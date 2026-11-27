// Teste de fumaça da API: percorre o fluxo da seção 8 da especificação.
// Uso: com `npm run dev` rodando e banco local limpo → node scripts/smoke.mjs [baseURL]
const BASE = process.argv[2] ?? "http://localhost:5173";
let cookie = "";
let failures = 0;

async function call(method, path, body, headers = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.getSetCookie?.() ?? [];
  if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function check(label, ok, extra = "") {
  console.log(`${ok ? "✔" : "✘"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
}

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const day = Number(today.slice(8));
const plusDays = (n) => {
  const d = new Date(today + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

// 1. cadastro do dono e bloqueio de um segundo cadastro
const email = `matheus+${Date.now()}@example.com`;
let r = await call("POST", "/api/auth/sign-up/email", { name: "Matheus", email, password: "senha-forte-123" });
check("cadastro do primeiro usuário", r.status === 200, `status ${r.status}`);
const ownerCookie = cookie;
cookie = "";
r = await call("POST", "/api/auth/sign-up/email", { name: "Outro", email: `x${Date.now()}@example.com`, password: "senha-forte-123" });
check("cadastro fechado para um segundo usuário", r.status === 403, `status ${r.status}`);
cookie = "";
r = await call("GET", "/api/today");
check("rotas exigem login", r.status === 401);

// login
r = await call("POST", "/api/auth/sign-in/email", { email, password: "senha-forte-123" });
check("login", r.status === 200 && cookie.includes("session"));
void ownerCookie;

// 2. dados iniciais
r = await call("GET", "/api/bills?status=pending");
const names = r.data.map((b) => b.name);
check("seed: contas recorrentes", ["Nio Fibra", "Metha Energia", "Copasa", "Cemig"].every((n) => names.includes(n)), names.join(", "));
const nio = r.data.find((b) => b.name === "Nio Fibra");
check("seed: Nio Fibra R$ 67,54 dia 26", nio?.amount === 6754 && nio.dueDate.endsWith("-26"));
r = await call("GET", "/api/reminders");
check("seed: lembretes Copasa 17/13 e Cemig 10", [17, 13, 10].every((d) => r.data.some((x) => x.dayOfMonth === d)));
r = await call("GET", "/api/categories");
const cats = r.data;
const cat = (n) => cats.find((c) => c.name === n).id;
check("seed: categorias com emoji", cats.length >= 10 && cats.every((c) => c.emoji));

// 3. contas e cartões
r = await call("GET", "/api/accounts");
const wallet = r.data.find((a) => a.name === "Carteira");
check("seed: carteira", Boolean(wallet));
r = await call("POST", "/api/accounts", { name: "Inter", kind: "checking", openingBalance: 200000 });
const inter = r.data;
check("cadastrar conta", r.status === 201);
r = await call("POST", "/api/accounts", { name: "Nubank", kind: "card", creditLimit: 500000, closingDay: 3, dueDay: 10 });
const nubank = r.data;
check("cadastrar cartão", r.status === 201);
r = await call("POST", "/api/accounts", { name: "Sem dias", kind: "card", creditLimit: 1000 });
check("cartão sem fechamento/vencimento é recusado", r.status === 400);

// 4. gasto e receita
r = await call("POST", "/api/transactions", { type: "expense", amount: 15000, description: "Mercado", categoryId: cat("Mercado"), accountId: inter.id, date: today });
check("registrar gasto", r.status === 201);
r = await call("POST", "/api/transactions", { type: "income", amount: 100000, description: "Freela", categoryId: cat("Outras receitas"), accountId: inter.id, date: today });
check("registrar receita", r.status === 201);
r = await call("POST", "/api/transactions", { type: "expense", amount: 60000, description: "Pneu", categoryId: cat("Carro"), accountId: nubank.id, date: today, installmentsTotal: 3 });
check("gasto parcelado no cartão", r.status === 201);
r = await call("POST", "/api/transactions", { type: "transfer", amount: 5000, description: "Saque", accountId: inter.id, toAccountId: wallet.id, date: today });
check("transferência entre contas", r.status === 201);
r = await call("GET", "/api/accounts");
const interNow = r.data.find((a) => a.id === inter.id);
check("saldo da conta", interNow.balance === 200000 - 15000 + 100000 - 5000, String(interNow.balance));
const nubankNow = r.data.find((a) => a.id === nubank.id);
check("limite disponível do cartão", nubankNow.card.available === 440000, String(nubankNow.card.available));
r = await call("GET", `/api/cards/${nubank.id}/invoices`);
check("faturas: parcelas futuras", r.data.invoices.filter((i) => i.total === 20000).length === 3);

// 5. conta a pagar e marcar como paga
r = await call("POST", "/api/bills", { name: "IPVA", amount: 80000, dueDate: today, recurrence: "yearly", accountId: inter.id });
const ipva = r.data;
check("criar conta a pagar", r.status === 201);
r = await call("POST", `/api/bills/${ipva.id}/pay`, {});
check("marcar como paga gera o gasto e a próxima", r.status === 200 && r.data.transaction.amount === 80000 && r.data.next?.dueDate > today, JSON.stringify(r.data.next?.dueDate));
r = await call("POST", `/api/bills/${ipva.id}/pay`, {});
check("não paga duas vezes", r.status === 409);
r = await call("POST", `/api/bills/${ipva.id}/unpay`, {});
check("desfazer pagamento", r.status === 200);
r = await call("GET", "/api/bills?status=pending");
check("desfazer volta a conta e remove a próxima", r.data.filter((b) => b.name === "IPVA").length === 1 && r.data.find((b) => b.name === "IPVA").id === ipva.id);
r = await call("GET", "/api/transactions");
check("desfazer apaga o gasto lançado", !r.data.some((t) => t.description === "IPVA"));
r = await call("POST", `/api/bills/${ipva.id}/pay`, {});
check("pagar de novo depois de desfazer", r.status === 200);
const copasa = (await call("GET", "/api/bills?status=pending")).data.find((b) => b.name === "Copasa");
r = await call("POST", `/api/bills/${copasa.id}/pay`, { accountId: inter.id });
check("conta de valor variável pede o valor", r.status === 400);

// 6. resumo do mês
r = await call("GET", "/api/summary");
check("resumo do mês", r.data.income === 100000 && r.data.expense === 15000 + 60000 + 80000 && r.data.categories[0].name === "Contas da casa" || r.data.categories.length > 0, `entrou ${r.data.income} saiu ${r.data.expense}`);
check("transferência não conta como gasto nem receita", r.data.expense === 155000 && r.data.income === 100000);

// 7. posso comprar / gasto por dia
await call("PATCH", "/api/settings", { nextPayday: plusDays(20) });
r = await call("GET", "/api/forecast");
check("gasto por dia", typeof r.data.perDay === "number" && r.data.days === 20 && !r.data.paydayAssumed, `R$ ${(r.data.perDay / 100).toFixed(2)}/dia, livre ${r.data.free}`);
r = await call("POST", "/api/can-buy", { amount: 30000, method: "pix" });
check("posso comprar (pix)", r.data.options.length === 2 && ["cabe", "aperta", "nao_cabe"].includes(r.data.options[0].verdict), r.data.options.map((o) => `${o.accountName}: ${o.verdict}`).join("; "));
r = await call("POST", "/api/can-buy", { amount: 300000, method: "credit", installments: 10 });
check("posso comprar (parcelado)", r.data.options[0]?.installmentAmount === 30000, r.data.options.map((o) => `${o.accountName}: ${o.verdict}`).join("; "));

// 8. vertente pessoal
r = await call("GET", "/api/areas");
const casa = r.data.find((a) => a.name === "Casa");
check("áreas padrão", ["Casa", "VZT", "LEVVA", "Carros", "Pessoal"].every((n) => r.data.some((a) => a.name === n)));
r = await call("POST", "/api/tasks", { title: "Ligar para o mecânico", dueDate: today, areaId: casa.id, priority: "high" });
const task = r.data;
check("tarefa com prazo", r.status === 201);
r = await call("POST", "/api/events", { title: "Reunião LEVVA", date: today, time: "23:59", remindMinutes: 30 });
check("compromisso com lembrete", r.status === 201);
r = await call("POST", "/api/reminders", { title: "Regar as plantas", dayOfMonth: day });
const rem = r.data;
check("lembrete recorrente", r.status === 201);
r = await call("POST", "/api/deadlines", { title: "Renovar CNH", date: plusDays(10), alertDaysBefore: 30, areaId: casa.id });
check("prazo importante", r.status === 201);
r = await call("POST", "/api/tasks", { title: "x", areaId: "nao-existe" });
check("área de outro usuário/inexistente é recusada", r.status === 404);

// 9. Hoje
r = await call("GET", "/api/today");
const t = r.data;
check("Hoje: tarefa", t.tasks.today.some((x) => x.id === task.id));
check("Hoje: compromisso", t.events.today.some((x) => x.title === "Reunião LEVVA"));
check("Hoje: lembrete do dia", t.reminders.today.some((x) => x.id === rem.id));
check("Hoje: prazo em alerta", t.deadlines.some((x) => x.title === "Renovar CNH" && x.daysLeft === 10));
r = await call("POST", "/api/bills", { name: "Condomínio", amount: 50000, dueDate: today });
r = await call("GET", "/api/today");
check("Hoje: conta que vence hoje", r.data.bills.today.some((b) => b.name === "Condomínio"));
await call("POST", `/api/reminders/${rem.id}/done`, {});
r = await call("GET", "/api/today");
check("lembrete feito sai do Hoje", !r.data.reminders.today.some((x) => x.id === rem.id));

// 10. API do assistente
r = await call("POST", "/api/keys", { name: "Pelúcio" });
const key = r.data.key;
check("criar chave da API", r.status === 201 && key?.startsWith("vf_"));
r = await call("POST", "/api/v1/transactions", { amount: "42,90", description: "Pão de queijo (assistente)", category: "alimentacao", account: "inter" }, { "x-api-key": "vf_errada", cookie: "" });
check("API recusa chave errada", r.status === 401);
const saved = cookie;
cookie = "";
r = await call("POST", "/api/v1/transactions", { amount: "42,90", description: "Pão de queijo (assistente)", category: "alimentacao", account: "inter" }, { "x-api-key": key });
check("assistente registra gasto", r.status === 201 && r.data.transaction.amount === 4290 && r.data.transaction.source === "whatsapp", r.data.account);
r = await call("POST", "/api/v1/transactions", { amount: 120, description: "Tênis", method: "credit", installments: 2 }, { "x-api-key": key });
check("assistente registra compra no crédito", r.status === 201 && r.data.account === "Nubank");
r = await call("POST", "/api/v1/bills", { name: "Conta de luz", dueDate: plusDays(1) }, { "x-api-key": key });
check("assistente registra conta a pagar", r.status === 201 && r.data.bill.amount === null);
cookie = saved;
r = await call("GET", "/api/transactions");
check("registro do assistente aparece no app", r.data.some((x) => x.description === "Pão de queijo (assistente)" && x.source === "whatsapp"));

// 11. persistência e exportação
cookie = "";
r = await call("POST", "/api/auth/sign-in/email", { email, password: "senha-forte-123" });
r = await call("GET", "/api/transactions");
check("dados persistem após novo login", r.data.length >= 6);
r = await call("GET", "/api/account/export");
check("exportar dados", r.status === 200 && Array.isArray(r.data.transactions));

// 12. modo demonstração isolado
const ownerSession = cookie;
cookie = "";
r = await call("POST", "/api/demo", {});
check("modo demonstração", r.status === 200 && cookie.includes("session"));
r = await call("GET", "/api/transactions");
check("demo tem dados de exemplo e não vê os do dono", r.data.length > 0 && !r.data.some((x) => x.description === "Pão de queijo (assistente)"));
r = await call("GET", `/api/cards/${nubank.id}/invoices`);
check("demo não acessa cartão do dono", r.status === 404);
r = await call("POST", "/api/account/delete", { confirm: "EXCLUIR" });
check("excluir conta (demo)", r.status === 200);
r = await call("GET", "/api/today");
check("sessão some após excluir conta", r.status === 401);
cookie = ownerSession;

console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);

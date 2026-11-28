// Teste de ponta a ponta da casa (vertente familiar), com vários usuários.
// Uso: banco local VAZIO e `npm run dev` rodando → node scripts/smoke-household.mjs
const BASE = process.argv[2] ?? "http://localhost:5173";
let failures = 0;

function client() {
  let cookie = "";
  return async function call(method, path, body) {
    const res = await fetch(BASE + path, {
      method,
      headers: { "content-type": "application/json", origin: BASE, ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    if (set.length) cookie = set.map((c) => c.split(";")[0]).join("; ");
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data };
  };
}
const check = (label, ok, extra = "") => {
  console.log(`${ok ? "✔" : "✘"} ${label}${extra ? ` — ${extra}` : ""}`);
  if (!ok) failures++;
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const pw = "senha-forte-123";

const dono = client();
const esposa = client();
const filho = client();
const intruso = client();

// --- dono cria a casa
let r = await dono("POST", "/api/auth/sign-up/email", { name: "Dono", email: "dono@example.com", password: pw });
check("dono se cadastra", r.status === 200);
r = await dono("GET", "/api/household");
check("sem casa no começo", r.data.household === null);
r = await dono("POST", "/api/household", { name: "Casa" });
check("cria a casa", r.status === 201);
r = await dono("POST", "/api/household", { name: "Outra" });
check("uma casa por usuário", r.status === 409);
r = await dono("GET", "/api/household");
check("criador é administrador", r.data.me.role === "admin" && r.data.members.length === 1);

// --- convite
r = await dono("POST", "/api/household/invite");
const code = r.data.code;
check("gera código de 6 caracteres", /^[A-Z0-9]{6}$/.test(code ?? ""), code);
check("validade de 7 dias", Math.abs(r.data.expiresAt - Date.now() - 7 * 86400000) < 60000);

// --- cadastro fechado sem código; com código entra na casa
r = await intruso("POST", "/api/auth/sign-up/email", { name: "Alguém", email: "alguem@example.com", password: pw });
check("cadastro sem código continua fechado", r.status === 403);
r = await intruso("POST", "/api/household/signup", { code: "ZZZZZZ", name: "Intruso", email: "alguem@example.com", password: pw });
check("código errado não entra", r.status === 404);
r = await esposa("POST", "/api/household/signup", { code: code.toLowerCase(), name: "Pessoa 2", email: "pessoa2@example.com", password: pw });
check("cadastro com código (aceita minúsculas)", r.status === 200);
r = await esposa("GET", "/api/household");
check("entra como membro", r.data.me?.role === "member" && r.data.members.length === 2);
check("membro não vê o código de convite", r.data.invite === null);
check("membro não vê e-mail dos outros", r.data.members.find((m) => m.name === "Dono")?.email === undefined);
const anaId = r.data.me.userId;
r = await esposa("POST", "/api/household/invite");
check("membro não gera convite", r.status === 403);
r = await esposa("POST", "/api/keys", { name: "x" });
check("assistente do WhatsApp é só do dono", r.status === 403);
r = await dono("POST", "/api/keys", { name: "Pelúcio" });
check("dono continua gerando a chave do assistente", r.status === 201);
r = await esposa("GET", "/api/bills?status=pending");
check("membro não herda as contas pessoais do dono", r.status === 200 && !r.data.some((b) => b.name === "Internet"));
r = await filho("POST", "/api/household/signup", { code, name: "Pessoa 3", email: "pessoa3@example.com", password: pw });
check("segundo membro entra com o mesmo código", r.status === 200);
const pedroId = (await filho("GET", "/api/household")).data.me.userId;

// --- criança: finanças desligadas
r = await dono("PATCH", `/api/household/members/${pedroId}`, { isChild: true });
r = await filho("GET", "/api/household");
check("criança fica sem finanças", r.data.me.isChild && r.data.me.permissions.finance === false);
r = await filho("GET", "/api/household/bills");
check("criança não vê contas da casa", r.status === 403);

// --- contas da casa e isolamento do pessoal
r = await dono("POST", "/api/household/bills", { name: "Condomínio", amount: 45000, dueDate: today, recurrence: "monthly" });
const condo = r.data;
check("admin cria conta da casa", r.status === 201);
r = await esposa("GET", "/api/household/bills");
check("adulto vê contas da casa", r.data.some((b) => b.id === condo.id));
r = await dono("GET", "/api/bills?status=pending");
check("conta da casa não aparece nas contas pessoais", !r.data.some((b) => b.id === condo.id));
r = await dono("PATCH", `/api/bills/${condo.id}`, { name: "hack" });
check("rota pessoal não mexe em conta da casa", r.status === 404);
r = await dono("GET", "/api/forecast");
check("conta da casa fora do gasto por dia pessoal", !r.data.commitments.some((c) => c.id === condo.id));
const personal = (await dono("POST", "/api/bills", { name: "Internet", amount: 6754, dueDate: today })).data;
r = await esposa("PATCH", `/api/bills/${personal.id}`, { name: "hack" });
check("membro não mexe em conta pessoal do dono", r.status === 404);

// --- quem pagou
r = await esposa("POST", `/api/household/bills/${condo.id}/pay`, {});
check("membro marca como paga", r.status === 200 && r.data.next?.dueDate > today);
r = await dono("GET", "/api/household/bills?status=paid");
check("registra quem pagou", r.data.find((b) => b.id === condo.id)?.paidByName === "Pessoa 2");
r = await dono("GET", "/api/household/bills/summary");
check("resumo por membro", r.data.byMember[0]?.name === "Pessoa 2" && r.data.byMember[0]?.total === 45000);
r = await dono("POST", `/api/household/bills/${condo.id}/unpay`, {});
check("desfazer pagamento da casa", r.status === 200);
r = await dono("GET", "/api/household/bills");
check("desfazer remove a próxima ocorrência", r.data.filter((b) => b.name === "Condomínio").length === 1);
const wallet = (await dono("GET", "/api/accounts")).data.find((a) => a.name === "Carteira");
r = await dono("POST", `/api/household/bills/${condo.id}/pay`, { accountId: wallet.id });
check("pagar e lançar nas finanças pessoais", r.status === 200 && r.data.transaction?.amount === 45000);
r = await dono("GET", "/api/transactions");
check("gasto da casa aparece no pessoal de quem pagou", r.data.some((t) => t.description === "Condomínio (casa)"));
r = await esposa("POST", `/api/household/bills/${r.data[0] && condo.id}/pay`, { accountId: wallet.id });
check("não lança conta já paga", r.status === 409);

// --- permissão de finanças por membro
await dono("PATCH", `/api/household/members/${anaId}`, { canFinance: false });
r = await esposa("GET", "/api/household/bills");
check("admin desliga finanças de um membro", r.status === 403);
await dono("PATCH", `/api/household/members/${anaId}`, { canFinance: true });

// --- tarefas da casa
r = await dono("POST", "/api/household/tasks", { title: "Lavar o carro", dueDate: today, assigneeId: anaId });
const lavar = r.data;
check("tarefa da casa com responsável", r.status === 201);
r = await dono("POST", "/api/household/tasks", { title: "Trocar lâmpada", dueDate: today, assigneeId: (await dono("GET", "/api/household")).data.me.userId });
const lampada = r.data;
r = await esposa("GET", "/api/today");
check("Hoje do membro mostra a tarefa dele", r.data.house?.tasks.some((t) => t.id === lavar.id));
check("Hoje do membro não mostra tarefa de outro", !r.data.house?.tasks.some((t) => t.id === lampada.id));
check("Hoje mostra a conta da casa de hoje", Array.isArray(r.data.house?.bills.today));
await dono("PATCH", `/api/household/members/${anaId}`, { canCreateTasks: false });
r = await esposa("POST", "/api/household/tasks", { title: "x" });
check("sem permissão não cria tarefa", r.status === 403);
r = await esposa("PATCH", `/api/household/tasks/${lavar.id}`, { done: true });
check("membro conclui a própria tarefa", r.status === 200);
r = await esposa("PATCH", `/api/household/tasks/${lampada.id}`, { done: true });
check("membro não conclui tarefa de outro", r.status === 403);
r = await esposa("PATCH", `/api/household/tasks/${lavar.id}`, { title: "outro" });
check("sem permissão não edita tarefa", r.status === 403);
r = await dono("GET", "/api/tasks");
check("tarefas da casa fora das tarefas pessoais", !r.data.some((t) => t.id === lavar.id));

// --- compromissos e compras
r = await dono("POST", "/api/household/events", { title: "Reunião de condomínio", date: today, time: "20:00", remindMinutes: 60 });
check("compromisso da casa", r.status === 201);
r = await esposa("GET", "/api/household/events");
check("membro vê compromissos da casa", r.data.some((e) => e.title === "Reunião de condomínio"));
r = await dono("POST", "/api/household/shopping-lists", { name: "Supermercado", date: today });
const lista = r.data;
check("cria lista de compras com data", r.status === 201 && lista.date === today);
r = await esposa("POST", `/api/household/shopping-lists/${lista.id}/items`, { name: "Leite", quantity: "2" });
const leite = r.data;
check("membro adiciona item dentro da lista", r.status === 201 && leite.listId === lista.id);
r = await dono("PATCH", `/api/household/shopping-lists/${lista.id}/items/${leite.id}`, { checked: true });
r = await esposa("GET", `/api/household/shopping-lists/${lista.id}`);
check("lista compartilhada com os itens", r.data.items.find((i) => i.id === leite.id)?.checked === true);
r = await esposa("GET", "/api/household/shopping-lists");
check("listagem mostra quantos itens faltam", r.data.find((l) => l.id === lista.id)?.open === 0 && r.data.find((l) => l.id === lista.id)?.total === 1);
await dono("PATCH", `/api/household/members/${pedroId}`, { canShopping: false });
r = await filho("POST", `/api/household/shopping-lists/${lista.id}/items`, { name: "Doce" });
check("sem permissão não adiciona item", r.status === 403);
r = await filho("GET", `/api/household/shopping-lists/${lista.id}`);
check("sem permissão ainda vê a lista", r.status === 200 && r.data.canEdit === false);
r = await filho("POST", "/api/household/shopping-lists", { name: "X", date: today });
check("sem permissão não cria lista", r.status === 403);
await dono("POST", `/api/household/shopping-lists/${lista.id}/clear`);
r = await dono("GET", `/api/household/shopping-lists/${lista.id}`);
check("tirar comprados", !r.data.items.some((i) => i.checked));
r = await dono("POST", "/api/household/shopping-lists", { name: "Farmácia", date: today });
r = await dono("DELETE", `/api/household/shopping-lists/${r.data.id}`);
check("apagar lista", r.status === 200);

// --- administrador
const donoId = (await dono("GET", "/api/household")).data.me.userId;
r = await dono("PATCH", `/api/household/members/${donoId}`, { role: "member" });
check("não rebaixa o último administrador", r.status === 409);
r = await dono("POST", "/api/household/leave");
check("último administrador não sai sem passar o papel", r.status === 409);
r = await dono("PATCH", `/api/household/members/${anaId}`, { role: "admin" });
check("passa administração", r.status === 200);
r = await esposa("GET", "/api/household");
check("novo administrador vê o código", r.data.me.role === "admin" && r.data.invite?.code === code);

// --- remover membro: perde o acesso na hora, dados ficam
r = await dono("DELETE", `/api/household/members/${pedroId}`);
check("admin remove membro", r.status === 200);
r = await filho("GET", "/api/household/tasks");
check("removido perde o acesso na hora", r.status === 404);
r = await filho("GET", "/api/household");
check("removido fica sem casa", r.data.household === null);

// --- revogar código
await dono("DELETE", "/api/household/invite");
r = await intruso("POST", "/api/household/signup", { code, name: "Intruso", email: "alguem@example.com", password: pw });
check("código revogado não deixa entrar", r.status === 410);
r = await filho("POST", "/api/household/join", { code });
check("código revogado não deixa voltar", r.status === 410);
r = await dono("POST", "/api/household/invite");
r = await filho("POST", "/api/household/join", { code: r.data.code });
check("novo código: entrar de dentro do app", r.status === 200);

// --- exclusão de conta mantém os dados da casa
r = await dono("POST", "/api/account/delete", { confirm: "EXCLUIR" });
check("dono exclui a própria conta", r.status === 200);
r = await esposa("GET", "/api/household/bills");
check("contas da casa continuam para os outros", r.status === 200 && r.data.some((b) => b.name === "Condomínio"));
r = await esposa("GET", "/api/household/tasks");
check("tarefas da casa continuam", r.data.some((t) => t.title === "Trocar lâmpada"));
check("tarefa de quem saiu fica sem responsável", r.data.find((t) => t.title === "Trocar lâmpada")?.assigneeId === null);
r = await esposa("GET", "/api/household");
check("casa sempre tem administrador", r.data.members.some((m) => m.role === "admin"));

console.log(failures ? `\n${failures} falha(s)` : "\nTudo certo.");
process.exit(failures ? 1 : 0);

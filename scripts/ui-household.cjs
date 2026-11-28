// Fluxo da casa pelo navegador, com duas pessoas. Banco local VAZIO e `npm run dev` rodando: node scripts/ui-household.cjs
const { chromium, devices } = require("playwright");
const SHOTS = process.env.SHOTS;
(async () => {
  const b = await chromium.launch();
  const mk = async () => { const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: SHOTS ? 2 : 1 }); const p = await ctx.newPage(); p.errors = []; p.on("pageerror", (e) => p.errors.push(String(e))); p.on("console", (m) => m.type() === "error" && p.errors.push(m.text())); return p; };
  const ok = (l, v) => console.log((v ? "✔ " : "✘ ") + l);
  const seen = (loc) => loc.first().waitFor({ timeout: 6000 }).then(() => true, () => false);
  const shot = async (p, name) => SHOTS && p.screenshot({ path: `${SHOTS}/${name}.png` });
  const B = "http://localhost:5173";
  const dono = await mk();
  await dono.goto(B + "/entrar");
  await dono.getByRole("button", { name: "Criar conta" }).click();
  await dono.getByLabel("Como posso chamar você?").fill("Dono");
  await dono.getByLabel("E-mail").fill("dono@example.com");
  await dono.getByLabel("Senha").fill("senha-forte-123");
  await dono.getByRole("button", { name: "Criar conta" }).click();
  await dono.waitForURL(B + "/");
  // aba Casa
  await dono.getByRole("link", { name: "Casa" }).click(); await dono.waitForLoadState("networkidle");
  await shot(dono, "casa-1-criar");
  await dono.getByRole("button", { name: "Criar casa" }).click();
  await dono.waitForURL(/\/casa\/contas/); await dono.waitForLoadState("networkidle");
  ok("dono cria a casa e vê as contas", await seen(dono.getByText("Contas da casa neste mês")));
  // conta da casa pelo +
  await dono.getByRole("button", { name: "Nova conta da casa" }).click();
  await dono.getByLabel("Nome").fill("Condomínio"); await dono.getByLabel("Valor").fill("45000");
  await dono.getByRole("button", { name: "Salvar" }).click(); await dono.waitForTimeout(700);
  ok("conta da casa criada", await seen(dono.getByText("Condomínio")));
  // convite
  await dono.getByRole("link", { name: "Membros" }).click(); await dono.waitForLoadState("networkidle");
  await dono.getByRole("button", { name: "Gerar código de convite" }).click(); await dono.waitForTimeout(700);
  const code = (await dono.locator("p.num").filter({ hasText: /^[A-Z0-9]{6}$/ }).innerText()).trim();
  ok("código de convite gerado", /^[A-Z0-9]{6}$/.test(code));
  await shot(dono, "casa-2-convite");
  // esposa entra com o código
  const ana = await mk();
  await ana.goto(B + "/entrar");
  await ana.getByRole("button", { name: "Tenho um código de convite" }).click();
  await ana.getByLabel("Código de convite").fill(code);
  await ana.getByLabel("Como posso chamar você?").fill("Pessoa 2");
  await ana.getByLabel("E-mail").fill("pessoa2@example.com");
  await ana.getByLabel("Senha").fill("senha-forte-123");
  await ana.getByRole("button", { name: "Criar conta e entrar na casa" }).click();
  await ana.waitForURL(/\/casa/); await ana.waitForLoadState("networkidle");
  ok("esposa entra na casa pelo código", await seen(ana.getByText("você é membro")));
  if (process.env.DEBUG) await ana.screenshot({ path: "/tmp/claude-0/shots/ana.png" });
  ok("membro vê as contas da casa", await seen(ana.getByText("Condomínio")));
  // ela paga a conta
  await ana.getByRole("button", { name: /Condomínio/ }).click();
  await ana.getByRole("button", { name: "Pagar", exact: true }).click();
  await ana.getByRole("button", { name: "Marcar como paga" }).click(); await ana.waitForTimeout(700);
  await dono.goto(B + "/casa/contas"); await dono.waitForLoadState("networkidle");
  ok("dono vê quem pagou", await seen(dono.getByText("Pago por Pessoa 2")));
  await shot(dono, "casa-3-contas");
  // tarefa para a esposa
  await dono.goto(B + "/casa/tarefas"); await dono.waitForLoadState("networkidle");
  await dono.getByRole("button", { name: "Nova tarefa da casa" }).click();
  await dono.getByRole("textbox", { name: "Tarefa" }).fill("Levar o lixo");
  await dono.getByLabel("Responsável").selectOption({ label: "Pessoa 2" });
  await dono.getByRole("button", { name: "Salvar" }).click(); await dono.waitForTimeout(700);
  await ana.goto(B + "/"); await ana.waitForLoadState("networkidle");
  ok("tarefa aparece no Hoje da esposa", await seen(ana.getByText("Levar o lixo")));
  await shot(ana, "casa-4-hoje-membro");
  await ana.getByRole("checkbox", { name: "Concluir tarefa" }).first().click(); await ana.waitForTimeout(700);
  await dono.goto(B + "/casa/tarefas"); await dono.waitForLoadState("networkidle");
  ok("dono vê a tarefa concluída", !(await seen(dono.getByText("Levar o lixo"))) || (await dono.getByText("Ver concluídas (1)").isVisible()));
  // lista de compras compartilhada
  await dono.goto(B + "/casa/compras"); await dono.waitForLoadState("networkidle");
  await dono.getByRole("button", { name: "Nova lista" }).first().click();
  await dono.getByRole("button", { name: "Criar lista" }).click(); await dono.waitForURL(/\/casa\/compras\//); await dono.waitForLoadState("networkidle");
  ok("dono cria lista com nome e data", await seen(dono.getByText("Supermercado")));
  await ana.goto(B + "/casa/compras"); await ana.waitForLoadState("networkidle");
  await ana.getByRole("link", { name: /Supermercado/ }).click(); await ana.waitForURL(/\/casa\/compras\//); await ana.waitForLoadState("networkidle");
  await ana.getByRole("textbox", { name: "Item" }).fill("Leite"); await ana.getByLabel("Quantidade").fill("2");
  await ana.getByRole("button", { name: "Adicionar à lista" }).click(); await ana.waitForTimeout(700);
  await dono.goto(dono.url()); await dono.waitForLoadState("networkidle");
  ok("item aparece dentro da lista para o dono", await seen(dono.getByText("Leite")));
  await dono.getByRole("checkbox", { name: "Pôr Leite no carrinho" }).click(); await dono.waitForTimeout(600);
  ok("item vai para o carrinho", await seen(dono.getByText("No carrinho")));
  await shot(dono, "casa-5-compras");
  // permissões: dono tira finanças da esposa
  await dono.goto(B + "/casa/membros"); await dono.waitForLoadState("networkidle");
  await dono.getByRole("button", { name: /Pessoa 2/ }).click();
  await shot(dono, "casa-6-permissoes");
  await dono.getByText("Ver e editar as finanças da casa").click();
  await dono.getByRole("button", { name: "Salvar" }).click(); await dono.waitForTimeout(700);
  await ana.goto(B + "/casa"); await ana.waitForLoadState("networkidle");
  ok("sem finanças: aba Contas some para a esposa", !(await ana.getByRole("link", { name: "Contas" }).count()));
  ok("Ajustes pelo botão de engrenagem", await (async () => { await ana.goto(B + "/"); await ana.getByRole("link", { name: "Ajustes" }).click(); return ana.getByRole("heading", { name: "Ajustes" }).waitFor({ timeout: 4000 }).then(() => true, () => false); })());
  console.log("erros:", JSON.stringify([...dono.errors, ...ana.errors]));
  await b.close();
})();

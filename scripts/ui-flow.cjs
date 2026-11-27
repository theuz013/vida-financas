// Teste dos fluxos pela interface (Playwright), com `npm run dev` rodando: node scripts/ui-flow.cjs
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 }); const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const ok = (l, v) => console.log((v ? "✔ " : "✘ ") + l);
  await p.goto("http://localhost:5173/entrar"); await p.getByRole("button", { name: "Ver com dados de exemplo" }).click(); await p.waitForURL("http://localhost:5173/");
  await p.waitForLoadState("networkidle");
  const perDayBefore = await p.locator("text=Pode gastar por dia").locator("..").innerText();
  // gasto rápido
  await p.getByRole("button", { name: "Registrar" }).last().click();
  await p.getByLabel("Valor").fill("80,50");
  await p.getByRole("button", { name: /Mercado/ }).click();
  await p.getByRole("button", { name: "Registrar gasto" }).click();
  await p.waitForTimeout(800);
  const perDayAfter = await p.locator("text=Pode gastar por dia").locator("..").innerText();
  ok("gasto pelo + atualiza o gasto por dia", perDayBefore !== perDayAfter);
  // pagar conta de hoje
  await p.getByRole("button", { name: /Internet/ }).click();
  await p.getByRole("button", { name: "Marcar como paga" }).click();
  await p.waitForTimeout(800);
  ok("conta paga sai do Hoje", !(await p.getByRole("button", { name: /Internet/ }).count()));
  // tarefa
  await p.getByRole("button", { name: "Registrar" }).last().click();
  await p.getByRole("radio", { name: "Tarefa" }).click();
  await p.getByLabel("O que precisa ser feito").fill("Renovar seguro da casa");
  await p.getByRole("button", { name: "Salvar tarefa" }).click();
  await p.waitForTimeout(800);
  ok("tarefa criada aparece no Hoje", await p.getByText("Renovar seguro da casa").isVisible());
  await p.getByRole("checkbox", { name: "Concluir tarefa" }).first().click();
  await p.waitForTimeout(600);
  // lembrete recorrente
  await p.goto("http://localhost:5173/vida/lembretes"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Novo lembrete" }).click();
  await p.getByLabel("Lembrar de").fill("Trocar filtro de água");
  await p.getByLabel("Todo dia").fill("5");
  await p.getByRole("button", { name: "Salvar" }).click(); await p.waitForTimeout(600);
  ok("lembrete recorrente criado", await p.getByText("Trocar filtro de água").isVisible());
  // conta a pagar nova
  await p.goto("http://localhost:5173/financas/contas"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Nova conta a pagar" }).click();
  await p.getByLabel("Nome").fill("Conta de teste"); await p.getByLabel("Valor").fill("67,54");
  await p.getByRole("button", { name: "Salvar" }).click(); await p.waitForTimeout(600);
  ok("conta a pagar criada", await p.getByText("Conta de teste").isVisible());
  // persistência após recarregar
  await p.reload(); await p.waitForLoadState("networkidle");
  ok("dados persistem após recarregar", await p.getByText("Conta de teste").isVisible());
  console.log("erros:", JSON.stringify(errors));
  await b.close();
})();

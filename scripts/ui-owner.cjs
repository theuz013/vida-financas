// Fluxo do dono a partir do banco local VAZIO (cadastro, guia, cartão, parcelas, desfazer, busca): node scripts/ui-owner.cjs
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 }); const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const ok = (l, v) => console.log((v ? "✔ " : "✘ ") + l);
  await p.goto("http://localhost:5173/entrar");
  await p.getByRole("button", { name: "Criar conta" }).click();
  await p.getByLabel("Como posso chamar você?").fill("Matheus");
  await p.getByLabel("E-mail").fill("dono@example.com");
  await p.getByLabel("Senha").fill("senha-forte-123");
  await p.getByRole("button", { name: "Criar conta" }).click();
  await p.waitForURL("http://localhost:5173/"); await p.waitForLoadState("networkidle");
  ok("guia de primeiro uso aparece", await p.getByText("Comece por aqui").isVisible());
  await p.screenshot({ path: "/tmp/claude-0/shots/owner-hoje.png", fullPage: true });
  // saldo da carteira e cartão
  await p.goto("http://localhost:5173/financas"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Novo cartão" }).click();
  await p.getByLabel("Nome").fill("Nubank"); await p.getByLabel("Limite total").fill("5000");
  await p.getByLabel("Dia do fechamento").fill("3"); await p.getByLabel("Dia do vencimento").fill("10");
  await p.getByRole("button", { name: "Salvar" }).click(); await p.waitForTimeout(700);
  ok("cartão cadastrado", await p.getByText("Nubank").first().isVisible());
  // compra já parcelada (parcela 3 de 10)
  await p.getByRole("button", { name: "Registrar" }).last().click();
  await p.getByLabel("Valor").fill("1000");
  await p.getByLabel("Pago com").selectOption({ label: "Nubank (crédito)" });
  await p.getByLabel("Parcelas").selectOption("10");
  await p.getByLabel("Parcela atual").selectOption("3");
  await p.getByLabel("Descrição").fill("Notebook");
  await p.getByRole("button", { name: "Registrar gasto" }).click(); await p.waitForTimeout(800);
  ok("toast com desfazer", await p.getByRole("button", { name: "Desfazer" }).isVisible());
  const avail = await p.getByText(/Disponível/).first().innerText();
  ok("compra antiga só lança as 8 parcelas que faltam (R$ 800 usados)", avail.includes("4.200,00"));
  // desfazer gasto
  await p.getByRole("button", { name: "Registrar" }).last().click();
  await p.getByLabel("Valor").fill("33"); await p.getByLabel("Descrição").fill("Teste desfazer");
  await p.getByRole("button", { name: "Registrar gasto" }).click(); await p.waitForTimeout(500);
  await p.getByRole("button", { name: "Desfazer" }).click(); await p.waitForTimeout(800);
  await p.goto("http://localhost:5173/financas/lancamentos"); await p.waitForLoadState("networkidle");
  ok("desfazer apaga o gasto", !(await p.getByText("Teste desfazer").count()));
  // busca
  await p.getByLabel("Buscar lançamentos").fill("note");
  ok("busca encontra", await p.getByText("Notebook").isVisible());
  await p.getByLabel("Buscar lançamentos").fill("xyz");
  ok("busca vazia avisa", await p.getByText("Nada encontrado.").isVisible());
  // detalhe da conta
  await p.goto("http://localhost:5173/financas"); await p.waitForLoadState("networkidle");
  await p.getByRole("link", { name: /Carteira/ }).click(); await p.waitForURL(/\/financas\/conta\//); await p.waitForLoadState("networkidle");
  ok("detalhe da conta abre", await p.getByRole("heading", { name: "Carteira" }).waitFor({ timeout: 5000 }).then(() => true, () => false));
  // pagar e desfazer conta (seed Nio Fibra)
  await p.goto("http://localhost:5173/financas/contas"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: /Nio Fibra/ }).click();
  await p.getByRole("button", { name: "Pagar", exact: true }).click();
  await p.getByRole("button", { name: "Marcar como paga" }).click(); await p.waitForTimeout(600);
  await p.getByRole("button", { name: "Desfazer" }).click(); await p.waitForTimeout(800);
  ok("desfazer pagamento volta para a pagar (uma só Nio Fibra)", (await p.getByRole("button", { name: /Nio Fibra/ }).count()) === 1);
  // tarefa: tocar abre edição
  await p.goto("http://localhost:5173/vida"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Nova tarefa" }).click();
  await p.getByLabel("O que precisa ser feito").fill("Pagar IPVA"); await p.getByRole("button", { name: "Salvar tarefa" }).click(); await p.waitForTimeout(600);
  await p.getByText("Pagar IPVA").click();
  ok("tocar na tarefa abre a edição", await p.getByRole("heading", { name: "Editar tarefa" }).isVisible());
  console.log("erros:", JSON.stringify(errors));
  await b.close();
})();

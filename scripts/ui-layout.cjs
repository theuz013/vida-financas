// Layout no celular: menus de seção fixos ao rolar, janela de compromisso colada no rodapé, máscara de valor. Com `npm run dev` rodando e banco vazio: node scripts/ui-layout.cjs
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e))); p.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  const ok = (l, v) => console.log((v ? "✔ " : "✘ ") + l);
  const B = "http://localhost:5173";
  await p.goto(B + "/entrar"); await p.getByRole("button", { name: "Ver com dados de exemplo" }).click(); await p.waitForURL(B + "/"); await p.waitForLoadState("networkidle");

  // menu da Vida fica no topo ao rolar a página
  // enche a lista para a página ter o que rolar
  await p.evaluate(async () => { for (let i = 0; i < 25; i++) await fetch("/api/tasks", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title: "Tarefa " + i }) }); });
  await p.goto(B + "/vida"); await p.waitForLoadState("networkidle");
  const navTop = async () => p.locator('nav[aria-label="Seções"]').evaluate((n) => Math.round(n.getBoundingClientRect().top));
  const before = await navTop();
  await p.evaluate(() => window.scrollTo(0, 400)); await p.waitForTimeout(300);
  const after = await navTop();
  const scrolled = await p.evaluate(() => window.scrollY);
  ok("página rolou de verdade", scrolled > 100);
  ok("menu Vida fica colado no topo ao rolar", after <= 2);
  console.log("   rolagem:", scrolled, "| topo do menu:", before, "→", after);

  await p.goto(B + "/vida/agenda"); await p.waitForLoadState("networkidle");
  // janela de novo compromisso: colada no rodapé, sem deslocar de lado
  await p.getByRole("button", { name: "Novo compromisso" }).tap(); await p.waitForTimeout(500);
  const rect = () => p.locator("dialog[open]").evaluate((d) => { const r = d.getBoundingClientRect(); return { x: Math.round(r.x), w: Math.round(r.width), bottom: Math.round(r.bottom), vh: innerHeight, vw: innerWidth }; });
  const r1 = await rect();
  ok("compromisso colado no rodapé e na largura da tela", r1.x === 0 && r1.bottom >= r1.vh - 1 && r1.w <= r1.vw);
  console.log("   janela:", JSON.stringify(r1));
  await p.getByLabel("O quê").tap().catch(() => {});
  await p.waitForTimeout(400);
  const r2 = await rect();
  ok("janela não sai do lugar ao focar um campo", r2.x === r1.x && r2.w === r1.w);
  await p.getByRole("button", { name: "Fechar" }).tap(); await p.waitForTimeout(300);

  // máscara de valor
  await p.goto(B + "/financas/contas"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Nova conta a pagar" }).tap(); await p.waitForTimeout(400);
  await p.getByLabel("Valor").tap(); await p.keyboard.type("100000"); await p.waitForTimeout(150);
  const shown = await p.getByLabel("Valor").inputValue();
  ok("máscara: digitar 100000 mostra 1.000,00", shown === "1.000,00");
  console.log("   valor exibido:", shown);
  await p.getByRole("button", { name: "Fechar" }).tap();

  // janela de registro: a faixa de tipos (Gasto, Receita...) não rola com o formulário
  await p.goto(B + "/"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Registrar" }).last().tap(); await p.waitForTimeout(500);
  const radio = p.locator('[role="radiogroup"][aria-label="Tipo"]');
  const t1 = await radio.evaluate((n) => Math.round(n.getBoundingClientRect().top));
  await p.locator("dialog[open] .overflow-y-auto").first().evaluate((n) => { n.scrollTop = 300; });
  await p.waitForTimeout(200);
  const t2 = await radio.evaluate((n) => Math.round(n.getBoundingClientRect().top));
  ok("registro: faixa de tipos fica fixa ao rolar o formulário", Math.abs(t1 - t2) <= 1);
  console.log("   faixa de tipos:", t1, "→", t2);
  await p.getByRole("button", { name: "Fechar" }).tap(); await p.waitForTimeout(300);

  console.log("erros:", JSON.stringify(errors));
  await b.close();
})();

// Gestos de celular (toque simulado): arrastar para fechar, puxar para atualizar, + por tela. node scripts/ui-gestures.cjs
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 1 }); const p = await ctx.newPage();
  const errors = []; p.on("pageerror", (e) => errors.push(String(e)));
  const ok = (l, v) => console.log((v ? "✔ " : "✘ ") + l);
  const cdp = await ctx.newCDPSession(p);
  const swipe = async (x, y1, y2) => {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: y1 }] });
    for (let i = 1; i <= 10; i++) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y1 + ((y2 - y1) * i) / 10 }] });
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  };
  await p.goto("http://localhost:5173/entrar"); await p.getByRole("button", { name: "Ver com dados de exemplo" }).click(); await p.waitForURL("http://localhost:5173/"); await p.waitForLoadState("networkidle");
  // + abre registro rápido; arrastar a alça fecha
  await p.getByRole("button", { name: "Registrar" }).click(); await p.waitForTimeout(400);
  const box = await p.locator("dialog[open] h2").boundingBox();
  await swipe(box.x + 20, box.y, box.y + 260); await p.waitForTimeout(500);
  ok("arrastar para baixo fecha a janela", !(await p.locator("dialog[open]").count()));
  // botão fechar continua funcionando no toque
  await p.getByRole("button", { name: "Registrar" }).click(); await p.waitForTimeout(400);
  await p.getByRole("button", { name: "Fechar" }).tap(); await p.waitForTimeout(400);
  ok("tocar no X fecha a janela", !(await p.locator("dialog[open]").count()));
  // puxar para atualizar
  let refetched = false; p.on("request", (r) => { if (r.url().includes("/api/today")) refetched = true; });
  await swipe(200, 120, 520); await p.waitForTimeout(1200);
  ok("puxar para baixo atualiza os dados", refetched);
  // + muda conforme a tela
  await p.goto("http://localhost:5173/vida/agenda"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Novo compromisso" }).tap(); await p.waitForTimeout(400);
  ok("+ na Agenda abre novo compromisso", await p.getByRole("heading", { name: "Novo compromisso" }).isVisible());
  await p.getByRole("button", { name: "Fechar" }).tap(); await p.waitForTimeout(300);
  await p.goto("http://localhost:5173/financas/contas"); await p.waitForLoadState("networkidle");
  await p.getByRole("button", { name: "Nova conta a pagar" }).tap(); await p.waitForTimeout(400);
  ok("+ em Contas a pagar abre nova conta", await p.getByRole("heading", { name: "Nova conta a pagar" }).isVisible());
  await p.getByRole("button", { name: "Fechar" }).tap(); await p.waitForTimeout(300);
  await p.goto("http://localhost:5173/financas"); await p.waitForLoadState("networkidle");
  ok("+ volta a ser Registrar fora dessas telas", await p.getByRole("button", { name: "Registrar" }).isVisible());
  console.log("erros:", JSON.stringify(errors));
  await b.close();
})();

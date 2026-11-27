// Auditoria de celular (iPhone SE, 320px): nada vazando para os lados e todo alvo de toque com 44px ou mais. Com `npm run dev` rodando: node scripts/mobile-audit.cjs
const { chromium, devices } = require("playwright");
(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices["iPhone SE"], viewport: { width: 320, height: 568 } });
  const p = await ctx.newPage();
  await p.goto("http://localhost:5173/entrar"); await p.getByRole("button", { name: "Ver com dados de exemplo" }).click(); await p.waitForURL("http://localhost:5173/"); await p.waitForLoadState("networkidle");
  const acc = await (await p.request.get("http://localhost:5173/api/accounts")).json();
  const card = acc.find((a) => a.kind === "card").id, chk = acc.find((a) => a.kind === "checking").id;
  const pages = ["/", "/financas", `/financas/conta/${chk}`, `/financas/cartao/${card}`, "/financas/contas", "/financas/lancamentos", "/financas/resumo", "/financas/posso-comprar", "/vida", "/vida/agenda", "/vida/lembretes", "/vida/prazos", "/vida/frentes", "/ajustes"];
  const small = new Map();
  for (const path of pages) {
    await p.goto("http://localhost:5173" + path); await p.waitForLoadState("networkidle"); await p.waitForTimeout(250);
    const r = await p.evaluate(() => {
      const overflow = document.documentElement.scrollWidth > innerWidth;
      const out = [];
      for (const el of document.querySelectorAll("a, button, input, select, [role=checkbox], [role=radio]")) {
        const rc0 = el.getBoundingClientRect();
        const ext = el.classList.contains("hit-lg") ? 20 : el.classList.contains("hit") ? 12 : 0;
        const rc = { width: rc0.width + (el.classList.contains("hit-lg") ? 20 : el.classList.contains("hit") ? 8 : 0), height: rc0.height + ext };
        if (!rc0.width || getComputedStyle(el).visibility === "hidden") continue;
        if (rc.height < 44 || rc.width < 44) out.push(`${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 24)}" ${Math.round(rc.width)}x${Math.round(rc.height)}`);
      }
      return { overflow, out };
    });
    if (r.overflow) console.log("VAZA PARA OS LADOS:", path);
    for (const o of r.out) small.set(o.replace(/"[^"]*"/, (m) => m), (small.get(o) || 0) + 1);
  }
  const uniq = [...new Set([...small.keys()].map((k) => k.replace(/ \d+x\d+$/, "") + " " + k.match(/\d+x\d+$/)[0]))];
  console.log("alvos pequenos (únicos):", uniq.length); uniq.slice(0, 60).forEach((u) => console.log("  " + u));
  await b.close();
})();

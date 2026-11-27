// Gera os PNGs do ícone a partir de public/icon.svg (usa o Chromium do Playwright).
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("playwright");
import fs from "node:fs";
const svg = fs.readFileSync("public/icon.svg", "utf8");
const browser = await chromium.launch();
const page = await browser.newPage();
const render = async (size, file, { pad = 0, square = false } = {}) => {
  await page.setViewportSize({ width: size, height: size });
  const inner = square ? svg.replace('rx="112"', 'rx="0"') : svg;
  await page.setContent(`<html><body style="margin:0;background:${square ? "#2a2c31" : "transparent"}"><div style="padding:${pad}px;box-sizing:border-box;width:${size}px;height:${size}px">${inner.replace("<svg ", '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: `public/${file}`, omitBackground: !square });
};
await render(192, "icon-192.png");
await render(512, "icon-512.png");
await render(512, "icon-maskable-512.png", { pad: 56, square: true });
await render(180, "apple-touch-icon.png", { square: true });
await browser.close();
console.log("ícones gerados");

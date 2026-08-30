import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const file = path.resolve("output/mobile-dock-redesign-preview.html");
const url = pathToFileURL(file).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForTimeout(400);

// 桌面端 1200px 视图
await page.locator(".frame").screenshot({ path: "output/dock-desktop-preview.png" });

// 移动端 390px 视图
await page.locator(".phone").screenshot({ path: "output/dock-mobile-preview.png" });

// 移动端首屏（440x1000 视口，验证「开始练习」是否在首屏内）
const m = await browser.newPage({ viewport: { width: 440, height: 1000 }, deviceScaleFactor: 2 });
await m.goto(url);
await m.waitForTimeout(400);
const box = await page.evaluate(() => {
  const el = document.querySelector(".m .start");
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: Math.round(r.top), bottom: Math.round(r.bottom) };
});
console.log("mobile .start position in 390px column:", JSON.stringify(box));
await m.screenshot({ path: "output/dock-mobile-viewport.png" });

console.log("done");
await browser.close();

import { chromium } from "playwright";
import { pathToFileURL } from "node:url";
import path from "node:path";

const file = path.resolve("output/mobile-dock-redesign-preview.html");
const url = pathToFileURL(file).href;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 }, deviceScaleFactor: 2 });
await page.goto(url);
await page.waitForTimeout(400);

// 桌面端 1200px 视图
await page.locator(".frame").screenshot({ path: "output/dock-desktop-preview.png" });

// 移动端：练习卡片（默认）
await page.locator(".phone").nth(0).screenshot({ path: "output/dock-mobile-preview.png" });

// 移动端：考点卡片 + 悬浮球展开
await page.locator(".phone").nth(1).screenshot({ path: "output/dock-mobile-topic-preview.png" });

const report = await page.evaluate(() => {
  const round = (r) => ({ top: Math.round(r.top), bottom: Math.round(r.bottom), height: Math.round(r.height) });
  const visible = (el) => !!el && el.getBoundingClientRect().height > 0;
  const desktopCount = document.querySelectorAll(".frame .quick-bar").length;
  const practice = document.querySelectorAll(".phone")[0];
  const topic = document.querySelectorAll(".phone")[1];

  const bar = practice.querySelector(".m .quick-bar");
  const ws = practice.querySelector(".m .workspace");

  const sheet = topic.querySelector(".quick-access");
  const fab = topic.querySelector(".workspace-fab");

  return {
    // 桌面端不应该出现底栏
    desktopCount,
    // 底栏贴在移动端 workspace 底部
    pinnedToBottom: Math.abs(bar.getBoundingClientRect().bottom - ws.getBoundingClientRect().bottom) <= 1,
    barBox: round(bar.getBoundingClientRect()),
    // 练习卡片视图：练习卡片可见，维护区隐藏
    practiceView: {
      launcher: visible(practice.querySelector(".launcher")),
      maintenance: visible(practice.querySelector(".maintenance")),
      peekCards: practice.querySelectorAll(".peek-card").length,
    },
    // 考点卡片视图：整张卡片切换，练习卡片隐藏，维护区里的考点块可见
    topicView: {
      launcher: visible(topic.querySelector(".launcher")),
      maintenance: visible(topic.querySelector(".maintenance")),
      summaryGrid: visible(topic.querySelector(".summary-grid")),
      topicSync: visible(topic.querySelector(".topic-sync")),
      peekCards: topic.querySelectorAll(".peek-card").length,
    },
    // 悬浮球与展开的浮窗
    fab: { box: round(fab.getBoundingClientRect()), badge: !!fab.querySelector(".fab-badge") },
    sheet: { open: sheet.classList.contains("open"), box: round(sheet.getBoundingClientRect()) },
    sheetAboveFab: sheet.getBoundingClientRect().bottom <= fab.getBoundingClientRect().top + 1,
  };
});

console.log(JSON.stringify(report, null, 2));
await page.screenshot({ path: "output/dock-preview-full.png", fullPage: true });
console.log("done");
await browser.close();

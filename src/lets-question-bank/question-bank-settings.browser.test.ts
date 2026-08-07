import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import QuestionBankSettings from "./QuestionBankSettings.svelte";
import { setPlugin } from "@/utils";

setPlugin({ i18n: {} });

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

const labels = {
  sections: {
    navigation: "题库设置分组",
    review: "复习与闪卡",
    reviewDescription: "设置复习和闪卡条件。",
    index: "索引与扫描",
    indexDescription: "管理扫描和索引。",
    display: "答题显示",
    displayDescription: "管理答题显示。",
    timing: "计时",
    timingDescription: "管理作答计时。",
    mask: "原文答案遮罩",
  },
  mask: {
    title: "原文答案遮盖",
    description: "隐藏原文答案。",
    enabled: "隐藏原文答案",
    style: "遮盖样式",
    preview: "预览",
    answerPrefix: "答案：",
    blur: "模糊",
    solid: "实色覆盖",
    underline: "下划线覆盖",
  },
};

const settingItems: ISettingItem[] = [
  { type: "number", title: "待复习阈值", description: "复习说明", key: "reviewThreshold", value: 2 },
  { type: "checkbox", title: "自动创建快速闪卡", description: "闪卡说明", key: "autoAddQuickCards", value: true },
  { type: "number", title: "Hard 阈值", description: "Hard 说明", key: "autoCardHardThreshold", value: 1 },
  { type: "number", title: "Again 阈值", description: "Again 说明", key: "autoCardAgainThreshold", value: 2 },
  { type: "checkbox", title: "自动同步索引", description: "同步说明", key: "autoSyncIndex", value: false },
  { type: "button", title: "维护索引", description: "维护说明", key: "maintainIndex", value: "立即维护" },
  { type: "checkbox", title: "自动扫描文档", description: "扫描说明", key: "autoScanDocument", value: false },
  { type: "checkbox", title: "显示答题标题", description: "标题说明", key: "showPracticeTitle", value: false },
  { type: "checkbox", title: "隐藏空答案块", description: "空块说明", key: "hideEmptyAnswerBlocks", value: true },
  { type: "checkbox", title: "继承原文样式", description: "样式说明", key: "inheritSourceStyles", value: true },
  { type: "select", title: "题目渲染方式", description: "渲染说明", key: "questionRenderMode", value: "native", options: { native: "原生" } },
  { type: "checkbox", title: "显示面包屑", description: "面包屑说明", key: "embedBreadcrumb", value: false },
  { type: "select", title: "标题嵌入方式", description: "标题嵌入说明", key: "embedHeadingMode", value: "0", options: { "0": "全部" } },
  { type: "checkbox", title: "记录作答用时", description: "计时说明", key: "timingEnabled", value: true },
  { type: "checkbox", title: "看答案时暂停", description: "暂停说明", key: "pauseOnAnswerReveal", value: true },
  { type: "select", title: "用时对比位置", description: "位置说明", key: "durationComparisonPosition", value: "rating", options: { rating: "评分上方" } },
  { type: "checkbox", title: "隐藏原文答案", description: "遮罩说明", key: "maskSourceAnswers", value: false },
  { type: "select", title: "遮罩样式", description: "遮罩样式说明", key: "answerMaskStyle", value: "blur", options: { blur: "模糊" } },
];

function render(events: Record<string, (event: any) => void> = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.appendChild(target);
  mounted.push(mount(QuestionBankSettings, {
    target,
    props: { group: "lets-question-bank.displayName", title: "题库", settingItems, labels },
    events,
  }));
  return target;
}

describe("question bank settings navigation", () => {
  it("starts with every settings group expanded and allows independent collapsing", async () => {
    const target = render();
    await tick();

    expect(target.textContent).toContain("复习与闪卡");
    expect(target.querySelectorAll(".workspace-panel")).toHaveLength(5);
    const reviewTrigger = target.querySelector<HTMLButtonElement>('button[aria-controls="question-bank-settings-review"]');
    const displayTrigger = target.querySelector<HTMLButtonElement>('button[aria-controls="question-bank-settings-display"]');
    if (!reviewTrigger || !displayTrigger) throw new Error("Missing settings panel trigger");
    expect(reviewTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(displayTrigger.getAttribute("aria-expanded")).toBe("true");

    displayTrigger.click();
    await tick();

    expect(displayTrigger.getAttribute("aria-expanded")).toBe("false");
    expect(reviewTrigger.getAttribute("aria-expanded")).toBe("true");
  });

  it("uses the header navigation to reveal and scroll to a settings group", async () => {
    const scrollIntoView = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => undefined);
    const target = render();
    await tick();

    const displayTrigger = target.querySelector<HTMLButtonElement>('button[aria-controls="question-bank-settings-display"]');
    const displayNavigation = target.querySelector<HTMLButtonElement>('[data-settings-section-target="display"]');
    if (!displayTrigger || !displayNavigation) throw new Error("Missing display settings navigation");

    displayTrigger.click();
    await tick();
    expect(displayTrigger.getAttribute("aria-expanded")).toBe("false");

    displayNavigation.click();
    await tick();

    expect(displayTrigger.getAttribute("aria-expanded")).toBe("true");
    expect(displayNavigation.getAttribute("aria-current")).toBe("location");
    await vi.waitFor(() => {
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "smooth", block: "start" });
    });
  });

  it("keeps actions on the existing settings event contract", async () => {
    const clicked = vi.fn();
    const target = render({ click: clicked });
    await tick();

    [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("立即维护"))
      ?.click();

    expect(clicked).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ group: "lets-question-bank.displayName", key: "maintainIndex" }),
    }));
  });

  it("adapts navigation labels to the available width without overflowing", async () => {
    await page.viewport(900, 760);
    const target = render();
    await tick();

    const reviewNavigationLabel = target.querySelector<HTMLElement>(
      '[data-settings-section-target="review"] .question-bank-settings-navigation-label',
    );
    if (!reviewNavigationLabel) throw new Error("Missing review navigation label");
    expect(getComputedStyle(reviewNavigationLabel).display).not.toBe("none");

    await page.viewport(390, 760);
    await vi.waitFor(() => {
      expect(getComputedStyle(reviewNavigationLabel).display).toBe("none");
    });

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(target.querySelectorAll("[data-settings-section-target]")).toHaveLength(5);
    expect(target.querySelectorAll("h2, h3")).toHaveLength(0);
  });

});

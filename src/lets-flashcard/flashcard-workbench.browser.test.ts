import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { FlashcardRuntime } from "@/flashcard/runtime";
import FlashcardSettings from "./FlashcardSettings.svelte";

let app: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (app) await unmount(app);
  app = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

async function render(
  onLoadOpenDocuments = vi.fn(async () => []),
  onReviewScope = vi.fn(),
) {
  const runtime = new FlashcardRuntime(() => undefined, vi.fn());
  vi.spyOn(runtime, "getReadablePath").mockImplementation(async (id) => `/法考/闪卡/${id === "20260823120000-aaaaaaa" ? "债权人代位权" : "复习文档"}`);
  vi.spyOn(Date, "now").mockReturnValue(new Date("2026-08-23T12:00:00+08:00").getTime());
  await runtime.recordScope({ id: "document:20260823115900-bbbbbbb", type: "document", targetId: "20260823115900-bbbbbbb", targetName: "20260823115900-bbbbbbb" });
  await runtime.recordScope({ id: "group:law", type: "group", targetName: "法考重点", groupId: "law", groupName: "法考重点" });
  vi.spyOn(runtime, "buildDiagnostics").mockResolvedValue([{
    blockId: "20260823120000-aaaaaaa",
    renderer: "list",
    kind: "basic",
    attributes: {},
    priority: "P1",
    card: { blockID: "20260823120000-aaaaaaa", cardID: "card-1", state: 1 },
    due: true,
    groupNames: ["法考重点"],
    content: "债权人代位权的成立要件",
  }]);
  const target = document.createElement("div");
  document.body.append(target);
  app = mount(FlashcardSettings, {
    target,
    props: {
      runtime,
      onLoadOpenDocuments,
      onReviewGroup: vi.fn(), onReviewAll: vi.fn(), onViewResults: vi.fn(),
      onOpenRaw: vi.fn(), onOpenFiltered: vi.fn(), onBatchPriority: vi.fn(), onImportSfp: vi.fn(),
      onReviewScope, onLocateCard: vi.fn(), onUnregisterCard: vi.fn(),
      onSetCardPriority: vi.fn(), onSettingsChanged: vi.fn(),
      onOptimizeReviewLog: vi.fn(), onApplyFsrsWeights: vi.fn(),
    },
  });
  await tick();
  return target;
}

function clickTab(target: HTMLElement, label: string): void {
  [...target.querySelectorAll<HTMLButtonElement>('[data-slot="tabs-trigger"]')]
    .find((button) => button.getAttribute("aria-label") === label)?.click();
}

describe("flashcard workbench", () => {
  it("shows recent scopes and opens the diagnostic browser", async () => {
    await page.viewport(1000, 760);
    const target = await render();

    expect(target.textContent).toContain("法考重点");
    expect(target.querySelector('[role="tree"]')).not.toBeNull();
    expect(target.textContent).toContain("文档范围 (1)");
    expect(target.textContent).toContain("应用分组 (1)");
    expect(target.textContent).toContain("刚刚 · 1 次");
    await vi.waitFor(() => expect(target.textContent).toContain("/法考/闪卡/复习文档"));
    const branch = target.querySelector<HTMLElement>(".tree-branch")!;
    const leafLabel = target.querySelector<HTMLElement>(".tree-leaf span")!;
    expect(getComputedStyle(branch).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(branch).borderTopWidth).toBe("0px");
    expect(getComputedStyle(leafLabel).whiteSpace).toBe("normal");
    clickTab(target, "闪卡浏览器");
    await vi.waitFor(() => expect(target.textContent).toContain("债权人代位权的成立要件"));

    expect(target.textContent).toContain("P1 · list · 已到期");
    await vi.waitFor(() => expect(target.textContent).toContain("/法考/闪卡/债权人代位权"));
    expect(target.querySelector('[title="定位原块"]')).not.toBeNull();
    expect(target.querySelector('[title="取消闪卡登记"]')).not.toBeNull();
  });

  it("shows every open document path and exposes direct document-group review actions", async () => {
    const onReviewScope = vi.fn();
    const onLoadOpenDocuments = vi.fn(async () => [{
      documentId: "20260823120000-aaaaaaa",
      title: "09 诉讼时效",
      path: "/Note-3.2/法考/客观/民法/09 诉讼时效",
      active: true,
    }]);
    const target = await render(onLoadOpenDocuments, onReviewScope);
    await vi.waitFor(() => expect(target.querySelector('[data-testid="open-documents-panel"] .open-document-row')).not.toBeNull());
    const row = target.querySelector<HTMLElement>('[data-testid="open-documents-panel"] .open-document-row');

    expect(row?.textContent).toContain("/Note-3.2/法考/客观/民法/09 诉讼时效");
    expect(row?.textContent).toContain("当前");
    const groupButton = [...(row?.querySelectorAll<HTMLButtonElement>("button") ?? [])]
      .find((button) => button.textContent?.includes("所有闪卡"));
    expect(groupButton).not.toBeUndefined();
    groupButton?.click();
    await vi.waitFor(() => expect(onReviewScope).toHaveBeenCalledWith(expect.objectContaining({
      type: "document",
      targetId: "20260823120000-aaaaaaa",
      groupId: "all-cards",
      groupName: "所有闪卡",
    })));
  });

  it("keeps workbench controls inside a mobile viewport", async () => {
    await page.viewport(390, 760);
    const target = await render();

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    const tabs = target.querySelector<HTMLElement>('[data-slot="tabs-list"]');
    expect(tabs?.scrollWidth).toBeLessThanOrEqual(tabs?.clientWidth ?? 0);
    const labels = [...target.querySelectorAll<HTMLElement>('[data-slot="tabs-trigger"] span')];
    expect(labels).toHaveLength(6);
    expect(labels.every((label) => getComputedStyle(label).display === "none")).toBe(true);
  });

  it("exposes configurable current-card statistics in the global settings", async () => {
    const saveSettings = vi.spyOn(FlashcardRuntime.prototype, "saveSettings").mockResolvedValue();
    const target = await render();
    clickTab(target, "总体配置");

    await vi.waitFor(() => expect(target.textContent).toContain("当前卡片信息"));
    expect(target.querySelector('[aria-label="距上次复习上移"]')).not.toBeNull();
    target.querySelector<HTMLButtonElement>('[aria-label="距上次复习上移"]')?.click();
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
    expect(saveSettings.mock.calls.at(-1)?.[0]).toMatchObject({
      reviewStats: { order: ["lastReview", "reviews", "lapses", "lapseRate", "interval"] },
    });
  });

  it("edits a category name inline instead of relying on a prompt", async () => {
    const saveCategory = vi.spyOn(FlashcardRuntime.prototype, "saveCategory").mockResolvedValue();
    const target = await render();
    clickTab(target, "SQL 分组");

    await vi.waitFor(() => expect(target.querySelector<HTMLButtonElement>('[title="重命名分类"]')).not.toBeNull());
    target.querySelector<HTMLButtonElement>('[title="重命名分类"]')?.click();
    await vi.waitFor(() => expect(target.querySelector<HTMLInputElement>('[aria-label="分类名称"]')).not.toBeNull());
    const input = target.querySelector<HTMLInputElement>('[aria-label="分类名称"]')!;
    input!.value = "重点复习";
    input!.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.waitFor(() => expect(target.querySelector<HTMLButtonElement>('[title="保存分类名称"]')).not.toBeNull());
    target.querySelector<HTMLButtonElement>('[title="保存分类名称"]')?.click();

    await vi.waitFor(() => expect(saveCategory).toHaveBeenCalledWith({ id: "default", name: "重点复习" }));
  });

  it("orders icon tabs by workflow and keeps instructions last", async () => {
    const target = await render();
    const tabs = [...target.querySelectorAll<HTMLButtonElement>('[data-slot="tabs-trigger"]')];
    expect(tabs.map((tab) => tab.getAttribute("aria-label"))).toEqual([
      "最近范围", "SQL 分组", "闪卡浏览器", "复习记录", "总体配置", "使用说明",
    ]);
    expect(tabs.every((tab) => tab.querySelector("svg"))).toBe(true);
  });

  it("offers review log scan and both supported export modes", async () => {
    await page.viewport(460, 760);
    const target = await render();
    clickTab(target, "复习记录");

    await vi.waitFor(() => expect(target.querySelector('[data-testid="review-log-panel"]')).not.toBeNull());
    const heading = target.querySelector<HTMLElement>('[data-testid="review-log-heading"]');
    expect(heading?.getBoundingClientRect().width).toBeGreaterThan(240);
    expect(target.textContent).toContain("尚未扫描");
    expect(target.querySelector('[aria-label="复习记录"] svg')).not.toBeNull();
    expect(target.querySelector('[aria-label="按月打包导出"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="导出合并记录"]')).not.toBeNull();
    expect(target.querySelector('[data-testid="fsrs-optimizer-panel"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="启动 FSRS 优化器"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="FSRS 优化运行模式"]')).not.toBeNull();
    expect(target.textContent).toContain("插件内部");

    await page.viewport(320, 760);
    await vi.waitFor(() => expect(getComputedStyle(target.querySelector('[aria-label="按月打包导出"] span')!).display).toBe("none"));
  });

  it("uses semantic switches and collapses renderer options with its master setting", async () => {
    await page.viewport(520, 760);
    const saveSettings = vi.spyOn(FlashcardRuntime.prototype, "saveSettings").mockResolvedValue();
    const target = await render();
    clickTab(target, "总体配置");

    await vi.waitFor(() => expect(target.querySelector('[aria-label="启用卡片渲染适配"]')).not.toBeNull());
    expect(target.querySelectorAll('input[type="checkbox"]')).toHaveLength(0);
    expect(target.querySelector('[data-testid="renderer-options"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="显示原生筛选"]')).not.toBeNull();
    expect(target.querySelector('[aria-label="显示原生全屏"]')).not.toBeNull();
    const rendererRows = [...target.querySelectorAll<HTMLElement>('[data-testid="renderer-options"] .option-row')];
    expect(rendererRows.every((row) => row.querySelector("svg"))).toBe(true);
    expect(Math.round(rendererRows[0].getBoundingClientRect().top)).toBe(Math.round(rendererRows[1].getBoundingClientRect().top));
    target.querySelector<HTMLButtonElement>('[aria-label="启用卡片渲染适配"]')?.click();
    await vi.waitFor(() => expect(target.querySelector('[data-testid="renderer-options"]')).toBeNull());
    await vi.waitFor(() => expect(saveSettings).toHaveBeenCalled());
  });

});

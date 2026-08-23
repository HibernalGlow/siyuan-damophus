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
});

async function render() {
  const runtime = new FlashcardRuntime(() => undefined, vi.fn());
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
      onReviewGroup: vi.fn(), onReviewAll: vi.fn(), onViewResults: vi.fn(),
      onOpenRaw: vi.fn(), onOpenFiltered: vi.fn(), onBatchPriority: vi.fn(), onImportSfp: vi.fn(),
      onReviewScope: vi.fn(), onLocateCard: vi.fn(), onUnregisterCard: vi.fn(),
      onSetCardPriority: vi.fn(), onSettingsChanged: vi.fn(),
    },
  });
  await tick();
  return target;
}

describe("flashcard workbench", () => {
  it("shows recent scopes and opens the diagnostic browser", async () => {
    await page.viewport(1000, 760);
    const target = await render();

    expect(target.textContent).toContain("法考重点");
    [...target.querySelectorAll<HTMLButtonElement>("nav.tabs button")]
      .find((button) => button.textContent === "闪卡浏览器")?.click();
    await vi.waitFor(() => expect(target.textContent).toContain("债权人代位权的成立要件"));

    expect(target.textContent).toContain("P1 · list · 已到期");
    expect(target.querySelector('[title="定位原块"]')).not.toBeNull();
    expect(target.querySelector('[title="取消闪卡登记"]')).not.toBeNull();
  });

  it("keeps workbench controls inside a mobile viewport", async () => {
    await page.viewport(390, 760);
    await render();

    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    expect(document.querySelector("nav.tabs")?.scrollWidth).toBeLessThanOrEqual(document.querySelector("nav.tabs")?.clientWidth ?? 0);
  });
});

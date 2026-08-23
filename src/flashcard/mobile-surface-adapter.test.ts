import { describe, expect, it, vi } from "vitest";
import { SiyuanMobileFlashcardSurfaceAdapter } from "./mobile-surface-adapter";

describe("SiyuanMobileFlashcardSurfaceAdapter", () => {
  it("opens the native current-document entry through the title menu", () => {
    vi.useFakeTimers();
    const titleButton = { click: vi.fn() };
    const reviewItem = { click: vi.fn() };
    let reviewReady = false;
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) => selector.includes('button[data-type="doc"]')
        ? titleButton
        : reviewReady ? reviewItem : null),
    });
    vi.stubGlobal("window", { setTimeout });
    const adapter = new SiyuanMobileFlashcardSurfaceAdapter(vi.fn() as never);

    expect(adapter.openReview({ type: "document" })).toBe(true);
    expect(titleButton.click).toHaveBeenCalledTimes(1);
    setTimeout(() => { reviewReady = true; }, 25);
    vi.advanceTimersByTime(100);
    expect(reviewItem.click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("opens the native global mobile entry when no scope is provided", () => {
    const globalEntry = { id: "menuCard", click: vi.fn(), dataset: {} };
    vi.stubGlobal("document", { querySelector: vi.fn(() => globalEntry) });
    const adapter = new SiyuanMobileFlashcardSurfaceAdapter(vi.fn() as never);

    expect(adapter.openReview()).toBe(true);
    expect(globalEntry.click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("marks the bottom-bar fallback so DAMO does not reroute it to the document", () => {
    const globalEntry = { id: "mobileBottomBarSpacedRepetition", click: vi.fn(), dataset: {} as Record<string, string> };
    vi.stubGlobal("document", { querySelector: vi.fn((selector: string) => selector === "#mobileBottomBarSpacedRepetition" ? globalEntry : null) });
    const adapter = new SiyuanMobileFlashcardSurfaceAdapter(vi.fn() as never);

    expect(adapter.openReview()).toBe(true);
    expect(globalEntry.dataset.damophusGlobalReviewBypass).toBe("true");
    expect(globalEntry.click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });
});

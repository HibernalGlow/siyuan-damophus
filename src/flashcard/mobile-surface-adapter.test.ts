import { describe, expect, it, vi } from "vitest";
import { SiyuanMobileFlashcardSurfaceAdapter } from "./mobile-surface-adapter";

describe("SiyuanMobileFlashcardSurfaceAdapter", () => {
  it("opens the native current-document entry through the title menu", () => {
    vi.useFakeTimers();
    const titleButton = { click: vi.fn() };
    const reviewItem = { click: vi.fn() };
    const menu = { style: { visibility: "visible" } };
    let reviewReady = false;
    vi.stubGlobal("document", {
      querySelector: vi.fn((selector: string) => {
        if (selector.includes('button[data-type="doc"]')) return titleButton;
        if (selector === "#commonMenu") return menu;
        return reviewReady ? reviewItem : null;
      }),
    });
    vi.stubGlobal("window", { setTimeout });
    const adapter = new SiyuanMobileFlashcardSurfaceAdapter(vi.fn() as never);

    expect(adapter.openReview({ type: "document" })).toBe(true);
    expect(titleButton.click).toHaveBeenCalledTimes(1);
    expect(menu.style.visibility).toBe("hidden");
    setTimeout(() => { reviewReady = true; }, 25);
    vi.advanceTimersByTime(100);
    expect(reviewItem.click).toHaveBeenCalledTimes(1);
    expect(menu.style.visibility).toBe("visible");
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

  it("does not use the current-document bottom bar as a global fallback", () => {
    vi.stubGlobal("document", { querySelector: vi.fn(() => null) });
    const adapter = new SiyuanMobileFlashcardSurfaceAdapter(vi.fn() as never);

    expect(adapter.openReview()).toBe(false);
    vi.unstubAllGlobals();
  });

  it("opens the desktop native review dialog through the workspace menu", () => {
    vi.useFakeTimers();
    const more = { click: vi.fn() };
    const reviewItem = { click: vi.fn() };
    let ready = false;
    vi.stubGlobal("document", { querySelector: vi.fn((selector: string) => {
      if (selector === "#barMore") return more;
      return ready ? reviewItem : null;
    }) });
    const adapter = new SiyuanMobileFlashcardSurfaceAdapter(vi.fn() as never);

    expect(adapter.openReview(undefined, false)).toBe(true);
    expect(more.click).toHaveBeenCalledTimes(1);
    setTimeout(() => { ready = true; }, 25);
    vi.advanceTimersByTime(100);
    expect(reviewItem.click).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

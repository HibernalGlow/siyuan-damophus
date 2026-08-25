import { afterEach, describe, expect, it } from "vitest";
import { NativeReviewCounter } from "./native-review-counter";
import type { FlashcardReviewStatsSettings } from "./types";

let counter: NativeReviewCounter | undefined;

afterEach(() => {
  counter?.uninstall();
  counter = undefined;
  document.body.innerHTML = "";
});

function mountCounter(): HTMLElement {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = '<div data-type="count" class="ft__flex"></div>';
  document.body.append(root);
  return root.querySelector<HTMLElement>('[data-type="count"]')!;
}

function mountMobileCounter(): { root: HTMLElement; count: HTMLElement; toolbar: HTMLElement } {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = `
    <div class="toolbar toolbar--border">
      <svg data-type="filter"></svg>
      <svg data-type="more"></svg>
      <svg data-type="close"></svg>
      <div data-type="count" class="fn__flex">native mobile counter</div>
    </div>
    `;
  document.body.append(root);
  return {
    root,
    count: root.querySelector<HTMLElement>('[data-type="count"]')!,
    toolbar: root.querySelector<HTMLElement>(".toolbar")!,
  };
}

function mountDesktopCounter(): { root: HTMLElement; count: HTMLElement; toolbar: HTMLElement } {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = `
    <div class="block__icons">
      <div class="block__logo">闪卡</div>
      <span class="fn__flex-1"></span>
      <div data-type="count" class="fn__flex-center">native desktop counter</div>
      <button data-type="filter">筛选</button>
      <button data-type="more">更多</button>
    </div>
    `;
  document.body.append(root);
  return {
    root,
    count: root.querySelector<HTMLElement>('[data-type="count"]')!,
    toolbar: root.querySelector<HTMLElement>(".block__icons")!,
  };
}

describe("native review priority counter", () => {
  it("renders priority quantities and preserves native markup on unload", async () => {
    const count = mountCounter();
    count.innerHTML = "native counter";
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([
      { cardID: "p1-a", priority: "P1" },
      { cardID: "p1-b", priority: "P1" },
      { cardID: "p2-a", priority: "P2" },
      { cardID: "other-a", priority: "other" },
    ]);
    counter.install();

    expect(count.querySelector('[data-priority="P1"] strong')?.textContent).toBe("2");
    expect(count.querySelector('[data-priority="P2"] strong')?.textContent).toBe("1");
    expect(count.querySelector('[data-priority="P3"] strong')?.textContent).toBe("0");
    expect(count.closest(".card__main")?.textContent).toContain("共 4");

    counter.setActiveCard("p2-a");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.querySelector('[data-priority="P2"]')?.getAttribute("data-active")).toBe("true");
    expect(count.querySelector('[data-priority="P1"]')?.getAttribute("data-active")).toBe("false");

    counter.markReviewed("p1-a", "3");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.querySelector('[data-priority="P1"] strong')?.textContent).toBe("1");

    counter.markReviewed("p1-b", "3");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const p1 = count.querySelector<HTMLElement>('[data-priority="P1"]');
    expect(p1?.dataset.count).toBe("0");
    expect(p1?.dataset.complete).toBe("true");

    counter.uninstall();
    expect(count.innerHTML).toBe("native counter");
  });

  it("resets completed cards when a seamless review starts a new round", async () => {
    const count = mountCounter();
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([{ cardID: "again-card", priority: "P1" }]);
    counter.install();

    counter.markReviewed("again-card", "1");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.querySelector('[data-priority="P1"] strong')?.textContent).toBe("0");

    counter.setQueue([{ cardID: "again-card", priority: "P1" }]);
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.querySelector('[data-priority="P1"] strong')?.textContent).toBe("1");
    expect(count.closest(".card__main")?.textContent).toContain("共 1");
  });

  it("splits mixed new and old card counts while keeping single-kind counts compact", async () => {
    const count = mountCounter();
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([
      { cardID: "p1-new-a", priority: "P1", isNew: true },
      { cardID: "p1-new-b", priority: "P1", isNew: true },
      { cardID: "p1-old", priority: "P1", isNew: false },
      { cardID: "p2-new", priority: "P2", isNew: true },
      { cardID: "p3-old", priority: "P3", isNew: false },
    ]);
    counter.install();

    const p1 = count.querySelector<HTMLElement>('[data-priority="P1"]')!;
    expect(p1.dataset.split).toBe("true");
    expect(p1.dataset.newCount).toBe("2");
    expect(p1.dataset.oldCount).toBe("1");
    expect(p1.querySelector("strong")?.textContent).toBe("2+1");
    expect(p1.querySelector(".damophus-priority-count-new")?.textContent).toBe("2");
    expect(p1.querySelector(".damophus-priority-count-old")?.textContent).toBe("1");
    expect(getComputedStyle(p1.querySelector<HTMLElement>(".damophus-priority-count-new")!).backgroundColor)
      .not.toBe(getComputedStyle(p1.querySelector<HTMLElement>(".damophus-priority-count-old")!).backgroundColor);

    const p2 = count.querySelector<HTMLElement>('[data-priority="P2"]')!;
    const p3 = count.querySelector<HTMLElement>('[data-priority="P3"]')!;
    expect(p2.dataset.split).toBe("false");
    expect(p2.querySelector("strong")?.textContent).toBe("1");
    expect(p2.querySelector(".damophus-priority-count-new")).toBeNull();
    expect(p3.querySelector("strong")?.textContent).toBe("1");
    expect(p3.querySelector(".damophus-priority-count-old")).toBeNull();

    counter.markReviewed("p1-old", "3");
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    const p1NewOnly = count.querySelector<HTMLElement>('[data-priority="P1"]')!;
    expect(p1NewOnly.dataset.split).toBe("false");
    expect(p1NewOnly.querySelector("strong")?.textContent).toBe("2");
    expect(p1NewOnly.querySelector(".damophus-priority-count-new")).toBeNull();
  });

  it("renders configurable statistics for the active card", async () => {
    const count = mountCounter();
    count.parentElement!.style.width = "300px";
    let statsSettings: FlashcardReviewStatsSettings = {
      enabled: true,
      order: ["lapseRate", "reviews", "interval", "lastReview", "lapses"],
      visible: { reviews: true, lastReview: false, lapses: false, lapseRate: true, interval: true },
    };
    counter = new NativeReviewCounter({ documentRef: document, getStatsSettings: () => statsSettings });
    counter.setQueue([{
      cardID: "p1-a",
      priority: "P1",
      stats: { reviews: 8, lapses: 2, interval: 3, lastReview: Date.now() - 86_400_000 },
    }]);
    counter.setActiveCard("p1-a");
    counter.install();

    const stats = count.closest<HTMLElement>(".card__main")?.querySelector<HTMLElement>('[data-testid="damophus-review-stats"]');
    expect(count.dataset.damophusDensity).toBe("compact");
    expect(stats?.querySelector("svg use")?.getAttribute("href")).toBe("#iconTags");
    expect([...stats!.querySelectorAll<HTMLElement>("[data-stat-key]")].map((node) => node.dataset.statKey)).toEqual([
      "lapseRate",
      "reviews",
      "interval",
    ]);
    expect(stats?.textContent).toContain("遗忘率25%");
    expect(stats?.textContent).toContain("复习8 次");
    expect(stats?.textContent).toContain("间隔3 天");
    expect(stats?.textContent).not.toContain("遗忘 2 次");

    count.parentElement!.style.width = "1200px";
    counter.refresh();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.dataset.damophusDensity).toBe("expanded");

    statsSettings = { ...statsSettings, enabled: false };
    counter.refresh();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(count.closest(".card__main")?.querySelector('[data-testid="damophus-review-stats"]')).toBeNull();
  });

  it("renders total and current-card timers and keeps them in the responsive details row", async () => {
    const { root, count, toolbar } = mountDesktopCounter();
    let timer = { enabled: true, totalMs: 65_000, cardMs: 12_000, paused: false };
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => 320 },
      scrollWidth: { configurable: true, get: () => 900 },
    });
    counter = new NativeReviewCounter({ documentRef: document, getTimerDisplay: () => timer });
    counter.setQueue([{ cardID: "timer-a", priority: "P1" }]);
    counter.install();

    const timers = root.querySelector<HTMLElement>('[data-testid="damophus-review-timers"]');
    expect(timers?.querySelector('[data-timer="total"]')?.textContent).toContain("01:05");
    expect(timers?.querySelector('[data-timer="card"]')?.textContent).toContain("00:12");
    expect(count.dataset.damophusDensity).toBe("tight");
    expect(root.querySelector(".damophus-counter-row")).not.toBeNull();

    timer = { ...timer, paused: true, totalMs: 70_000, cardMs: 17_000 };
    counter.refresh();
    await new Promise<void>((resolve) => queueMicrotask(resolve));
    expect(root.querySelector('[data-timer="card"]')?.getAttribute("data-paused")).toBe("true");
    expect(root.querySelector('[data-timer="total"]')?.textContent).toContain("01:10");
  });

  it("moves the complete mobile counter into a right-aligned second row", async () => {
    const { root, count, toolbar } = mountMobileCounter();
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => 385 },
      scrollWidth: { configurable: true, get: () => 900 },
    });
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([{ cardID: "mobile-a", priority: "P1" }]);
    counter.install();

    const row = root.querySelector<HTMLElement>(".damophus-mobile-counter-row");
    expect(row).not.toBeNull();
    expect(row?.previousElementSibling).toBe(toolbar);
    expect(row?.querySelector<HTMLElement>(".damophus-priority-segment")).not.toBeNull();
    expect(row?.querySelector<HTMLElement>(".damophus-counter-details-copy")).toBeNull();
    expect(row?.children).toHaveLength(1);
    expect(count.parentElement).toBe(row);
    expect(toolbar.querySelector('[data-type="count"]')).toBeNull();
    expect(getComputedStyle(row!).justifyContent).toBe("flex-end");

    counter.uninstall();
    expect(root.querySelector(".damophus-mobile-counter-row")).toBeNull();
    expect(count.parentElement).toBe(toolbar);
    expect(toolbar.querySelector('[data-type="count"]')).toBe(count);
  });

  it("keeps desktop statistics inline when the toolbar has enough width", () => {
    const { root, count, toolbar } = mountDesktopCounter();
    let toolbarWidth = 900;
    let toolbarScrollWidth = 900;
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => toolbarWidth },
      scrollWidth: { configurable: true, get: () => toolbarScrollWidth },
    });
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([{ cardID: "desktop-wide", priority: "P1" }]);
    counter.install();

    expect(root.querySelector(".damophus-counter-row")).toBeNull();
    expect(count.parentElement).toBe(toolbar);
  });

  it("moves desktop statistics to a second row only while the toolbar overflows", async () => {
    const { root, count, toolbar } = mountDesktopCounter();
    let toolbarWidth = 360;
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => toolbarWidth },
      scrollWidth: {
        configurable: true,
        get: () => toolbar.querySelector(".damophus-counter-details.fn__none") ? 300 : 760,
      },
    });
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([{ cardID: "desktop-narrow", priority: "P1" }]);
    counter.install();

    const row = root.querySelector<HTMLElement>(".damophus-counter-row");
    expect(row).not.toBeNull();
    expect(row?.previousElementSibling).toBe(toolbar);
    expect(count.parentElement).toBe(toolbar);
    expect(row?.querySelector(".damophus-counter-details-copy")).not.toBeNull();

    toolbarWidth = 900;
    counter.refresh();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(root.querySelector(".damophus-counter-row")).toBeNull();
    expect(count.parentElement).toBe(toolbar);
  });

  it("moves the priority segment down only when the priority segment itself overflows", () => {
    const { root, count, toolbar } = mountDesktopCounter();
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => 360 },
      scrollWidth: {
        configurable: true,
        get: () => toolbar.querySelector(".damophus-counter-details.fn__none") ? 760 : 900,
      },
    });
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([{ cardID: "desktop-priority-narrow", priority: "P1" }]);
    counter.install();

    const row = root.querySelector<HTMLElement>(".damophus-counter-row");
    expect(row).not.toBeNull();
    expect(count.parentElement).toBe(row);
    expect(row?.querySelector(".damophus-counter-details-copy")).not.toBeNull();
  });

  it("returns the priority segment to the toolbar before the details segment", async () => {
    const { root, count, toolbar } = mountDesktopCounter();
    let toolbarWidth = 600;
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => toolbarWidth },
      scrollWidth: {
        configurable: true,
        get: () => toolbar.querySelector(".damophus-counter-details.fn__none") ? 700 : 900,
      },
    });
    counter = new NativeReviewCounter({ documentRef: document });
    counter.setQueue([{ cardID: "desktop-priority-return", priority: "P1" }]);
    counter.install();
    expect(count.parentElement).toBe(root.querySelector(".damophus-counter-row"));

    toolbarWidth = 750;
    counter.refresh();
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
    expect(count.parentElement).toBe(toolbar);
    expect(root.querySelector(".damophus-counter-row")).not.toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeReviewTimer } from "./native-review-timer";

describe("native review timer", () => {
  let activeTimer: NativeReviewTimer | undefined;

  afterEach(() => {
    activeTimer?.dispose();
    activeTimer = undefined;
    vi.useRealTimers();
  });

  it("counts total and current-card question time, pausing after answer by default", () => {
    let now = 1_000;
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false }),
    });
    timer.startSession("a");
    now += 2_500;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 2_500, cardMs: 2_500, paused: false });

    timer.handleAction("-1", "a");
    now += 3_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 2_500, cardMs: 2_500, paused: true });

    timer.setActiveCard("b");
    now += 1_500;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 4_000, cardMs: 1_500, paused: false });
  });

  it("continues the current-card and total timers after answer when enabled", () => {
    let now = 0;
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: true }),
    });
    timer.startSession("a");
    now = 1_000;
    timer.handleAction("-1", "a");
    now = 4_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 4_000, cardMs: 4_000, paused: false });
  });

  it("stops when the review queue is exhausted and can be enabled later", () => {
    let enabled = false;
    let now = 0;
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled, continueAfterAnswer: false }),
    });
    timer.startSession("a");
    now = 2_000;
    expect(timer.getDisplay().enabled).toBe(false);
    enabled = true;
    timer.refresh();
    now = 3_000;
    expect(timer.getDisplay()).toMatchObject({ enabled: true, totalMs: 1_000, cardMs: 1_000 });
    timer.setQueue([]);
    expect(timer.getDisplay()).toMatchObject({ enabled: false, totalMs: 1_000, cardMs: 1_000 });
  });

  it("refreshes the toolbar once per running tick", () => {
    vi.useFakeTimers();
    let now = 0;
    const onChange = vi.fn();
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false }),
      onChange,
    });
    timer.startSession("a");
    onChange.mockClear();
    now = 1_000;
    vi.advanceTimersByTime(1_000);
    expect(onChange).toHaveBeenCalledTimes(1);
    timer.handleAction("-1", "a");
    onChange.mockClear();
    vi.advanceTimersByTime(2_000);
    expect(onChange).not.toHaveBeenCalled();
  });
});

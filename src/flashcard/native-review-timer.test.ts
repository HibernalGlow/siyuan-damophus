import { afterEach, describe, expect, it, vi } from "vitest";
import { NativeReviewTimer } from "./native-review-timer";

describe("native review timer", () => {
  let activeTimer: NativeReviewTimer | undefined;

  function activityTargets(hidden = false): { activityWindow: EventTarget; activityDocument: EventTarget & { hidden: boolean } } {
    const activityDocument = new EventTarget() as EventTarget & { hidden: boolean };
    Object.defineProperty(activityDocument, "hidden", { configurable: true, get: () => hidden });
    return { activityWindow: new EventTarget(), activityDocument };
  }

  afterEach(() => {
    activeTimer?.dispose();
    activeTimer = undefined;
    vi.useRealTimers();
  });

  it("counts total and current-card question time, pausing after answer by default", () => {
    let now = 1_000;
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: false }),
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
      getSettings: () => ({ enabled: true, continueAfterAnswer: true, pauseOnBlur: false }),
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
      getSettings: () => ({ enabled, continueAfterAnswer: false, pauseOnBlur: false }),
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

  it("starts once for native review callbacks and preserves the running round", () => {
    let now = 0;
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: false }),
    });
    timer.ensureSession("a");
    now = 2_000;
    timer.ensureSession("b");
    expect(timer.getDisplay()).toMatchObject({ totalMs: 2_000, cardMs: 2_000, paused: false });
  });

  it("pauses while the review window is inactive and resumes without counting time away", () => {
    let now = 1_000;
    const { activityWindow, activityDocument } = activityTargets();
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: true }),
    });
    timer.installActivityTracking(activityWindow, activityDocument);
    timer.startSession("a");

    now = 4_000;
    activityWindow.dispatchEvent(new Event("blur"));
    now = 12_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 3_000, cardMs: 3_000, paused: true });

    activityWindow.dispatchEvent(new Event("focus"));
    now = 15_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 6_000, cardMs: 6_000, paused: false });
  });

  it("waits for every inactive reason to clear before resuming", () => {
    let now = 0;
    const { activityWindow, activityDocument } = activityTargets();
    let hidden = false;
    Object.defineProperty(activityDocument, "hidden", { configurable: true, get: () => hidden });
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: true }),
    });
    timer.installActivityTracking(activityWindow, activityDocument);
    timer.startSession("a");

    now = 1_000;
    activityWindow.dispatchEvent(new Event("blur"));
    hidden = true;
    activityDocument.dispatchEvent(new Event("visibilitychange"));
    hidden = false;
    activityDocument.dispatchEvent(new Event("visibilitychange"));
    now = 5_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 1_000, paused: true });

    activityWindow.dispatchEvent(new Event("focus"));
    now = 7_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 3_000, paused: false });
  });

  it("does not resume an answer-paused timer when the window regains focus", () => {
    let now = 0;
    const { activityWindow, activityDocument } = activityTargets();
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: true }),
    });
    timer.installActivityTracking(activityWindow, activityDocument);
    timer.startSession("a");
    now = 1_000;
    timer.handleAction("-1", "a");
    activityWindow.dispatchEvent(new Event("blur"));
    activityWindow.dispatchEvent(new Event("focus"));
    now = 5_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 1_000, cardMs: 1_000, paused: true });
  });

  it("keeps counting on blur when smart pause is disabled", () => {
    let now = 0;
    const { activityWindow, activityDocument } = activityTargets();
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: false }),
    });
    timer.installActivityTracking(activityWindow, activityDocument);
    timer.startSession("a");
    now = 1_000;
    activityWindow.dispatchEvent(new Event("blur"));
    now = 5_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 5_000, cardMs: 5_000, paused: false });
  });

  it("synchronizes a smart-pause setting change while the window is inactive", () => {
    let now = 0;
    let pauseOnBlur = true;
    const { activityWindow, activityDocument } = activityTargets();
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur }),
    });
    timer.installActivityTracking(activityWindow, activityDocument);
    timer.startSession("a");
    now = 1_000;
    activityWindow.dispatchEvent(new Event("blur"));
    now = 5_000;
    pauseOnBlur = false;
    timer.refresh();
    now = 7_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 3_000, paused: false });
  });

  it("pauses outside the review surface and resumes when the card surface is focused", () => {
    let now = 0;
    const { activityWindow, activityDocument } = activityTargets();
    let insideSurface = false;
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: true }),
    });
    timer.installActivityTracking(activityWindow, activityDocument, () => insideSurface);
    timer.startSession("a");
    now = 1_000;
    activityDocument.dispatchEvent(new Event("pointerdown"));
    now = 5_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 1_000, paused: true });
    insideSurface = true;
    activityDocument.dispatchEvent(new Event("pointerdown"));
    now = 7_000;
    expect(timer.getDisplay()).toMatchObject({ totalMs: 3_000, paused: false });
  });

  it("refreshes the toolbar once per running tick", () => {
    vi.useFakeTimers();
    let now = 0;
    const onChange = vi.fn();
    const timer = activeTimer = new NativeReviewTimer({
      now: () => now,
      getSettings: () => ({ enabled: true, continueAfterAnswer: false, pauseOnBlur: false }),
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

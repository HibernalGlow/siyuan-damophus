import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { button, flush, makePreview, mockController, objectiveQuestion, option, render, scanAndSync } from "./question-bank.browser.fixtures";

const pauseButton = () => {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.getAttribute("aria-label") === "Pause timer" || item.getAttribute("aria-label") === "Resume timer");
  if (!result) throw new Error("Missing timer toggle button");
  return result;
};

const expectTimerPaused = (paused: boolean) => {
  const toggle = pauseButton();
  expect(toggle.getAttribute("aria-pressed")).toBe(String(paused));
};

async function startPractice(): Promise<void> {
  const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
  render(controller, { pauseOnBlur: true });
  await scanAndSync();
  button("Start practice").click();
  await flush();
  expectTimerPaused(false);
}

const fireWindowBlur = (): void => {
  window.dispatchEvent(new FocusEvent("blur"));
};
const fireWindowFocus = (): void => {
  window.dispatchEvent(new FocusEvent("focus"));
};
const fireVisibilityChange = (hidden: boolean): void => {
  Object.defineProperty(document, "hidden", { configurable: true, get: () => hidden });
  document.dispatchEvent(new Event("visibilitychange"));
};
const pointerDownOn = (target: Element): void => {
  target.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, composed: true }));
};

describe("pause on blur (browser)", () => {
  it("resumes when the window regains focus while the question bank held focus", async () => {
    await startPractice();
    await page.getByRole("button", { name: "Alpha" }).click();
    await flush();

    fireWindowBlur();
    await flush();
    expectTimerPaused(true);

    fireWindowFocus();
    await flush();
    expectTimerPaused(false);
  });

  it("resumes on window focus even when the focused element no longer belongs to the question bank", async () => {
    await startPractice();
    await page.getByRole("button", { name: "Alpha" }).click();
    await flush();

    fireWindowBlur();
    await flush();
    expectTimerPaused(true);

    // The user may refocus SiYuan through the title bar, taskbar, or Alt-Tab:
    // no pointer event lands in the page and document.activeElement may be body.
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body);
    fireWindowFocus();
    await flush();
    expectTimerPaused(false);
  });

  it("stays paused after returning focus when the pause came from clicking outside the question bank", async () => {
    await startPractice();

    pointerDownOn(document.body);
    await flush();
    expectTimerPaused(true);

    fireWindowBlur();
    fireWindowFocus();
    await flush();
    expectTimerPaused(true);
  });

  it("resumes when clicking back into the question bank after an outside-click pause", async () => {
    await startPractice();

    pointerDownOn(document.body);
    await flush();
    expectTimerPaused(true);

    (document.activeElement as HTMLElement | null)?.blur?.();
    fireWindowFocus();
    await flush();
    expectTimerPaused(true);

    await page.getByRole("button", { name: "Alpha" }).click();
    await flush();
    expectTimerPaused(false);
  });

  it("recovers through a blur-focus-blur focus jitter while away", async () => {
    await startPractice();
    await page.getByRole("button", { name: "Alpha" }).click();
    await flush();

    fireWindowBlur();
    await flush();
    expectTimerPaused(true);

    // Focus jitter while the user is away (taskbar clicks, IME, window animations).
    fireWindowFocus();
    fireWindowBlur();
    fireWindowFocus();
    await flush();
    expectTimerPaused(false);
  });

  it("keeps a manual timer pause across window blur and focus", async () => {
    await startPractice();
    pauseButton().click();
    await flush();
    expectTimerPaused(true);

    fireWindowBlur();
    fireWindowFocus();
    await flush();
    expectTimerPaused(true);

    pauseButton().click();
    await flush();
    expectTimerPaused(false);
  });

  it("keeps the answer-reveal freeze across blur and focus until the question changes", async () => {
    await startPractice();
    await page.getByRole("button", { name: "Alpha" }).click();
    button("Reveal answer").click();
    await flush();
    expectTimerPaused(true);

    fireWindowBlur();
    fireWindowFocus();
    await flush();
    expectTimerPaused(true);
  });
});

import { describe, expect, it, vi } from "vitest";
import "./question-bank.css";
import { isolateMobileDialogGestures } from "./mobile-dialog-scroll";

describe("question bank mobile dialog scrolling", () => {
  it("contains vertical overscroll on the dialog and its scroll surfaces", () => {
    document.body.innerHTML = `
      <div class="damophus-question-bank-mobile-dialog">
        <div class="damophus-question-bank-dialog">
          <main class="question-bank">
            <section class="workspace"></section>
            <section class="practice">
              <div class="practice-content"><div data-slot="scroll-area-viewport"></div></div>
            </section>
          </main>
        </div>
      </div>`;

    const dialog = document.querySelector<HTMLElement>(".damophus-question-bank-mobile-dialog")!;
    expect(getComputedStyle(dialog).overscrollBehaviorY).toBe("contain");
    expect(getComputedStyle(document.querySelector<HTMLElement>("[data-slot=scroll-area-viewport]")!).overscrollBehaviorY).toBe("contain");
  });

  it("stops touch and pointer gestures from bubbling to the host", () => {
    const root = document.createElement("div");
    const child = document.createElement("div");
    root.append(child);
    document.body.append(root);
    const hostHandler = vi.fn();
    document.body.addEventListener("touchmove", hostHandler);
    const cleanup = isolateMobileDialogGestures(root);

    child.dispatchEvent(new Event("touchmove", { bubbles: true }));

    expect(hostHandler).not.toHaveBeenCalled();
    cleanup();
    document.body.removeEventListener("touchmove", hostHandler);
  });
});

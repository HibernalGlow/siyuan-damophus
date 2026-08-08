import { describe, expect, it, vi } from "vitest";
import { renderLayoutActionsDock } from "./dock";
import "./layout-actions.css";

describe("layout actions dock", () => {
  it("renders accessible buttons and dispatches the selected native command", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const execute = vi.fn();
    const cleanup = renderLayoutActionsDock(target, {
      switchLeftDock: "Switch left panel layout",
      switchRightDock: "Switch right panel layout",
      switchBottomDock: "Switch bottom panel layout",
    }, execute);

    const buttons = target.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(3);
    expect(buttons[0].getAttribute("aria-label")).toBe("Switch left panel layout");
    expect(buttons[2].querySelector("use")?.getAttribute("href")).toBe("#iconDown");
    expect(getComputedStyle(target.firstElementChild!).display).toBe("grid");
    expect(getComputedStyle(buttons[0]).minHeight).toBe("36px");

    buttons[1].click();
    expect(execute).toHaveBeenCalledWith("switchRightDock");

    cleanup();
    expect(target.childElementCount).toBe(0);
    target.remove();
  });
});

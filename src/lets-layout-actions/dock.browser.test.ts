import { describe, expect, it, vi } from "vitest";
import { renderConfiguredActionsDock } from "./dock";
import "./layout-actions.css";

describe("layout actions dock", () => {
  it("renders accessible buttons and dispatches the selected native command", () => {
    const target = document.createElement("div");
    document.body.append(target);
    const execute = vi.fn();
    const cleanup = renderConfiguredActionsDock(target, [{
      id: "switch-right",
      title: "Switch right panel layout",
      icon: "iconRight",
      kind: "system",
      value: "switchRightDock",
      placement: "dock",
      enabled: true,
    }], execute);

    const buttons = target.querySelectorAll<HTMLButtonElement>("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].getAttribute("aria-label")).toBe("Switch right panel layout");
    expect(buttons[0].querySelector("use")?.getAttribute("href")).toBe("#iconRight");
    expect(getComputedStyle(target.firstElementChild!).display).toBe("grid");
    expect(getComputedStyle(buttons[0]).minHeight).toBe("36px");

    buttons[0].click();
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({ value: "switchRightDock" }));

    cleanup();
    expect(target.childElementCount).toBe(0);
    target.remove();
  });
});

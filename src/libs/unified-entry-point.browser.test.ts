import { describe, expect, it, vi } from "vitest";
import { UnifiedEntryPoint } from "./unified-entry-point";

describe("UnifiedEntryPoint Dock visibility", () => {
  it("hides its registered Dock button while disabled and restores it when enabled", () => {
    const dockButton = document.createElement("button");
    dockButton.className = "dock__item";
    dockButton.dataset.type = "siyuan-damophuslifecycle-test-dock";
    dockButton.innerHTML = '<svg><use xlink:href="#iconOld"></use></svg>';
    document.body.append(dockButton);

    const entry = new UnifiedEntryPoint({
      id: "lifecycle-test",
      title: "Lifecycle test",
      icon: "iconTest",
      execute: vi.fn(),
      dock: {
        type: "lifecycle-test-dock",
        config: {
          position: "RightBottom",
          size: { width: 240, height: 0 },
          icon: "iconTest",
          title: "Lifecycle test",
        },
        data: {},
        init: vi.fn(),
      },
    }, {
      addCommand: vi.fn(),
      addDock: vi.fn(() => ({ config: {} as never, model: {} as never })),
    });

    entry.setEnabled(false);
    expect(dockButton.hidden).toBe(true);
    expect(dockButton.style.display).toBe("none");
    expect(dockButton.getAttribute("aria-hidden")).toBe("true");

    entry.setEnabled(true);
    expect(dockButton.hidden).toBe(false);
    expect(dockButton.style.display).toBe("");
    expect(dockButton.getAttribute("aria-hidden")).toBe("false");
    expect(dockButton.querySelector("use")?.getAttribute("href")).toBe("#iconTest");

    entry.setSurfaces({ dock: false });
    expect(dockButton.style.display).toBe("none");

    entry.setSurfaces({ dock: true });
    expect(dockButton.style.display).toBe("");

    const click = vi.spyOn(dockButton, "click");
    expect(entry.openDock()).toBe(true);
    expect(click).toHaveBeenCalledOnce();

    dockButton.remove();
  });

  it("does not register a Dock while its persisted surface setting is disabled", () => {
    const addDock = vi.fn(() => ({ config: {} as never, model: {} as never }));
    const entry = new UnifiedEntryPoint({
      id: "disabled-on-start",
      title: "Disabled on start",
      icon: "iconTest",
      execute: vi.fn(),
      dock: {
        type: "disabled-on-start-dock",
        config: {
          position: "RightBottom",
          size: { width: 240, height: 0 },
          icon: "iconBrain",
          title: "Disabled on start",
        },
        data: {},
        init: vi.fn(),
      },
    }, {
      name: "siyuan-damophus",
      docks: {},
      addCommand: vi.fn(),
      addDock,
    });

    entry.setSurfaces({ dock: false });
    entry.registerDock();
    expect(addDock).not.toHaveBeenCalled();

    entry.setSurfaces({ dock: true });
    expect(addDock).toHaveBeenCalledOnce();
  });

  it("executes an action Dock created after registration without allowing SiYuan to open a panel", () => {
    const execute = vi.fn();
    const nativeDockClick = vi.fn();
    window.addEventListener("click", nativeDockClick);

    const entry = new UnifiedEntryPoint({
      id: "direct-action",
      title: "Direct action",
      icon: "iconTest",
      execute,
      dock: {
        type: "direct-action-dock",
        activation: "action",
        config: {
          position: "LeftTop",
          size: { width: 240, height: 0 },
          icon: "iconTest",
          title: "Direct action",
        },
        data: {},
        init: vi.fn(),
      },
    }, {
      addCommand: vi.fn(),
      addDock: vi.fn(() => ({ config: {} as never, model: {} as never })),
    });

    entry.registerDock();
    const dockButton = document.createElement("button");
    dockButton.className = "dock__item";
    dockButton.dataset.type = "siyuan-damophusdirect-action-dock";
    dockButton.innerHTML = "<svg><use></use></svg>";
    document.body.append(dockButton);
    const event = new MouseEvent("click", { bubbles: true, cancelable: true });
    dockButton.querySelector("svg")?.dispatchEvent(event);

    expect(execute).toHaveBeenCalledOnce();
    expect(nativeDockClick).not.toHaveBeenCalled();
    expect(event.defaultPrevented).toBe(true);

    const replacement = dockButton.cloneNode(true) as HTMLElement;
    dockButton.replaceWith(replacement);
    replacement.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(nativeDockClick).not.toHaveBeenCalled();

    entry.setEnabled(false);
    replacement.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(execute).toHaveBeenCalledTimes(2);
    expect(nativeDockClick).toHaveBeenCalledOnce();
    window.removeEventListener("click", nativeDockClick);
    replacement.remove();
  });

});

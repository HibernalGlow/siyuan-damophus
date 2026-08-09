import { describe, expect, it, vi } from "vitest";
import { UnifiedEntryPoint } from "./unified-entry-point";

describe("UnifiedEntryPoint", () => {
  it("builds one top-bar menu item from a shared action definition", () => {
    let executions = 0;
    const entry = new UnifiedEntryPoint({
      id: "test.open",
      title: "Open test surface",
      icon: "iconTest",
      execute: () => executions += 1,
    }, {
      addCommand: () => undefined,
      addDock: () => ({ config: {} as never, model: {} as never }),
    });

    const item = entry.menuItem();
    expect(item.icon).toBe("iconTest");
    expect(item.label).toBe("Open test surface");
    (item.click as () => void)();
    expect(executions).toBe(1);
  });

  it("registers command and cross-platform Dock contracts once", () => {
    const commands: any[] = [];
    const docks: any[] = [];
    const initialized: unknown[] = [];
    let executions = 0;
    const entry = new UnifiedEntryPoint({
      id: "question-bank.open",
      title: "Open question bank",
      icon: "iconDatabase",
      execute: () => executions += 1,
      command: { langKey: "question-bank.open" },
      dock: {
        type: "question-bank-dock",
        config: {
          position: "LeftTop",
          size: { width: 420, height: 0 },
          icon: "iconDatabase",
          title: "Question bank",
        },
        data: {},
        init: (target) => initialized.push(target),
      },
    }, {
      commands,
      addCommand: (command) => commands.push(command),
      addDock: (dock) => {
        docks.push(dock);
        return { config: dock.config, model: {} as never };
      },
    });

    entry.registerCommand();
    entry.registerCommand();
    entry.registerDock();
    entry.registerDock();

    expect(commands).toHaveLength(1);
    expect(docks).toHaveLength(1);
    commands[0].callback();
    expect(executions).toBe(1);

    const target = {} as HTMLElement;
    docks[0].init.call({ element: target });
    expect(initialized).toEqual([target]);
  });

  it("disables command execution and tears down Dock content until re-enabled", () => {
    const commands: any[] = [];
    const docks: any[] = [];
    const init = vi.fn();
    const destroy = vi.fn();
    const execute = vi.fn();
    const entry = new UnifiedEntryPoint({
      id: "lifecycle-test",
      title: "Lifecycle test",
      icon: "iconTest",
      execute,
      command: { langKey: "lifecycle-test" },
      dock: {
        type: "lifecycle-test-dock",
        config: {
          position: "RightBottom",
          size: { width: 240, height: 0 },
          icon: "iconTest",
          title: "Lifecycle test",
        },
        data: {},
        init,
        destroy,
      },
    }, {
      commands,
      addCommand: (command) => commands.push(command),
      addDock: (dock) => {
        docks.push(dock);
        return { config: dock.config, model: {} as never };
      },
    });

    entry.registerCommand();
    entry.registerDock();
    docks[0].init.call({ element: {} as HTMLElement });
    expect(init).toHaveBeenCalledOnce();

    entry.setEnabled(false);
    expect(commands).toHaveLength(0);
    entry.menuItem().click?.({} as HTMLElement, {} as MouseEvent);
    expect(execute).not.toHaveBeenCalled();
    expect(destroy).toHaveBeenCalledOnce();

    entry.setEnabled(true);
    commands[0].callback();
    expect(init).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledOnce();
  });
});

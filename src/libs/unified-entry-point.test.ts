import { describe, expect, it } from "vitest";
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
});

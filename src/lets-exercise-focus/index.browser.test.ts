import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import ExerciseFocusPlugin from "./index";

afterEach(() => {
  setPlugin(undefined);
  document.body.innerHTML = "";
});

describe("exercise focus entry", () => {
  it("registers a stable toggle command that layout actions can discover", () => {
    const commands: unknown[] = [];
    const addCommand = vi.fn((command: unknown) => commands.push(command));
    setPlugin({
      name: "siyuan-damophus",
      commands,
      docks: {},
      addCommand,
      addDock: vi.fn(),
    });

    const module = new ExerciseFocusPlugin();
    module.enabled = true;
    module.t = (key) => key;
    module.getSetting = () => false;
    module.setSetting = vi.fn();
    module.onload();

    expect(addCommand).toHaveBeenCalledWith(expect.objectContaining({
      langKey: "lets-exercise-focus.toggleCommand",
      callback: expect.any(Function),
    }));

    module.onunload();
  });
});

import { describe, expect, it, vi } from "vitest";
import { executeSiyuanCommand, PANEL_LAYOUT_ACTIONS } from "./actions";

describe("panel layout actions", () => {
  it("exposes the three native SiYuan panel layout commands", () => {
    expect(PANEL_LAYOUT_ACTIONS.map((action) => action.command)).toEqual([
      "switchLeftDock",
      "switchRightDock",
      "switchBottomDock",
    ]);
  });

  it("passes commands directly to the SiYuan command executor", () => {
    const execute = vi.fn();

    executeSiyuanCommand("switchBottomDock", execute);

    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith("switchBottomDock");
  });
});

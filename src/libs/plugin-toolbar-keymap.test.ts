import { describe, expect, it } from "vitest";
import { syncPluginToolbarKeymap } from "./plugin-toolbar-keymap";

describe("syncPluginToolbarKeymap", () => {
  it("registers dynamically discovered toolbar items for SiYuan shortcuts", () => {
    const keymap = {};
    const toolbar = ["bold", { name: "damophus-same-text-painter" }];

    syncPluginToolbarKeymap(keymap, "siyuan-damophus", toolbar);

    expect(keymap).toEqual({
      plugin: {
        "siyuan-damophus": {
          "damophus-same-text-painter": { custom: "", default: "" },
        },
      },
    });
    expect(toolbar[1]).toEqual({ name: "damophus-same-text-painter", hotkey: "" });
  });

  it("updates defaults without overwriting a user's custom shortcut", () => {
    const keymap = {
      plugin: {
        "siyuan-damophus": {
          "damophus-same-text-painter": { custom: "⌘⇧P", default: "" },
        },
      },
    };
    const toolbar = [{ name: "damophus-same-text-painter", hotkey: "⌥P" }];

    syncPluginToolbarKeymap(keymap, "siyuan-damophus", toolbar);
    syncPluginToolbarKeymap(keymap, "siyuan-damophus", toolbar);

    expect(keymap.plugin["siyuan-damophus"]["damophus-same-text-painter"]).toEqual({
      custom: "⌘⇧P",
      default: "⌥P",
    });
  });
});

import { describe, expect, it } from "vitest";
import type { DiscoveredPluginMenuEntry } from "./discovered-entries";
import {
  extractAdvancedExpandedMenuRules,
  selectedDiscoveredEntryKeys,
  serializeExpandedMenuSettings,
} from "./settings-model";

const entries: DiscoveredPluginMenuEntry[] = [
  { key: "module:calloutTools", label: "转换为 Callout", pluginId: "siyuan-damophus", moduleId: "calloutTools", source: "identity", lastSeen: 3 },
  { key: "plugin:other-plugin|混搭", label: "混搭", pluginId: "other-plugin", source: "identity", lastSeen: 2 },
  { key: "label:旧插件", label: "旧插件", source: "label", lastSeen: 1 },
];

describe("expanded plugin menu settings model", () => {
  it("maps stable identities and legacy labels into discovered selections", () => {
    expect(selectedDiscoveredEntryKeys("转换为 Callout\nplugin:other-plugin|混搭\n旧插件", entries))
      .toEqual(new Set(entries.map((entry) => entry.key)));
  });

  it("keeps only unrecognized rules in the advanced field", () => {
    expect(extractAdvancedExpandedMenuRules(
      "module:calloutTools\nplugin:other-plugin|混搭\nplugin:future-plugin\n未发现入口",
      entries,
    )).toBe("plugin:future-plugin\n未发现入口");
  });

  it("serializes selected discoveries before advanced rules", () => {
    expect(serializeExpandedMenuSettings(
      entries,
      new Set(["module:calloutTools", "plugin:other-plugin|混搭"]),
      "plugin:future-plugin",
    )).toBe("module:calloutTools\nplugin:other-plugin|混搭\nplugin:future-plugin");
  });
});

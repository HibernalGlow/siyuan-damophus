import { describe, expect, it } from "vitest";
import {
  discoverPluginMenuEntry,
  mergeDiscoveredPluginMenuEntries,
  parseDiscoveredPluginMenuEntries,
} from "./discovered-entries";

describe("discovered plugin menu entries", () => {
  it("prefers module identity and retains all available identity details", () => {
    const attributes: Record<string, string> = {
      "data-plugin-id": "siyuan-damophus",
      "data-damophus-module": "questionBank",
      "data-damophus-declaration": "questionBank/practice",
    };
    const item = { getAttribute: (name: string) => attributes[name] ?? null } as HTMLElement;
    expect(discoverPluginMenuEntry(item, "从此块打开题库", 42)).toEqual({
      key: "module:questionBank",
      label: "从此块打开题库",
      pluginId: "siyuan-damophus",
      moduleId: "questionBank",
      declaration: "questionBank/practice",
      source: "identity",
      lastSeen: 42,
    });
  });

  it("distinguishes multiple first-level entries from one external plugin", () => {
    const first = { getAttribute: (name: string) => name === "data-plugin-id" ? "other-plugin" : null } as HTMLElement;
    const second = { getAttribute: (name: string) => name === "data-plugin-id" ? "other-plugin" : null } as HTMLElement;
    expect(discoverPluginMenuEntry(first, "入口甲", 1).key).toBe("plugin:other-plugin|入口甲");
    expect(discoverPluginMenuEntry(second, "入口乙", 1).key).toBe("plugin:other-plugin|入口乙");
  });

  it("keeps unseen persisted entries while merging newly observed ones", () => {
    const current = parseDiscoveredPluginMenuEntries(JSON.stringify([
      { key: "module:old", label: "已停用模块", moduleId: "old", source: "identity", lastSeen: 1 },
    ]));
    const next = { key: "label:新入口", label: "新入口", source: "label" as const, lastSeen: 2 };
    const merged = mergeDiscoveredPluginMenuEntries(current, [next]);
    expect(merged.changed).toBe(true);
    expect(merged.entries.map((entry) => entry.key)).toEqual(["module:old", "label:新入口"]);
  });

  it("upgrades a cached text match when the same entry gains a stable module identity", () => {
    const current = parseDiscoveredPluginMenuEntries(JSON.stringify([
      { label: "复制带 IAL 的 Markdown", source: "label", lastSeen: 1 },
    ]));
    const observed = parseDiscoveredPluginMenuEntries(JSON.stringify([
      { label: "复制带 IAL 的 Markdown", pluginId: "siyuan-damophus", moduleId: "kramdownExport", lastSeen: 2 },
    ]));
    const merged = mergeDiscoveredPluginMenuEntries(current, observed);
    expect(merged.entries).toHaveLength(1);
    expect(merged.entries[0].key).toBe("module:kramdownExport");
  });
});

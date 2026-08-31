import { afterEach, describe, expect, it } from "vitest";
import type { Plugin } from "siyuan";
import { collectCommandOptions, groupCommandOptions } from "./runtime";

const LANGUAGES: Record<string, string> = {
  syncNow: "立即同步",
  general: "常规",
  element: "元素",
  headings: "标题",
  list1: "列表",
  table: "表格",
};

function plugin(
  name: string,
  displayName: string,
  i18n: Record<string, string>,
  commands: Array<{ langKey: string; langText?: string; callback?: () => void }>,
): Plugin {
  return {
    name,
    displayName,
    i18n,
    commands,
  } as unknown as Plugin;
}

afterEach(() => {
  delete (window as { siyuan?: unknown }).siyuan;
});

describe("collectCommandOptions", () => {
  it("collects system, plugin, and editor commands with localized labels", () => {
    window.siyuan = {
      languages: LANGUAGES,
      config: {
        keymap: {
          general: { syncNow: { custom: "Ctrl+S" } },
          editor: {
            general: { switchReadonly: { custom: "Ctrl+Shift+R" } },
            heading: { moveHeadingUp: { custom: "" } },
          },
        },
      },
      ws: {
        app: {
          plugins: [
            plugin("damophus", "Damophus", {
              "lets-layout-actions.switchLeft": "切换左侧面板布局",
            }, [
              { langKey: "lets-layout-actions.switchLeft", callback: () => {} },
            ]),
            plugin("plain", "Plain Plugin", {}, [
              { langKey: "runExport", langText: "导出" },
            ]),
          ],
        },
      },
    } as unknown as typeof window.siyuan;

    const catalog = collectCommandOptions();

    expect(catalog.system.map((option) => [option.value, option.label])).toEqual([
      ["syncNow", "立即同步"],
    ]);
    expect(catalog.editor.map((option) => [option.value, option.label])).toEqual([
      ["editor::heading::moveHeadingUp", "moveHeadingUp (标题)"],
      ["editor::general::switchReadonly", "switchReadonly (常规)"],
    ]);
    expect(catalog.plugin.map((option) => [option.value, option.label, option.available])).toEqual([
      ["plugin::damophus::lets-layout-actions.switchLeft", "Damophus: 切换左侧面板布局", true],
      ["plugin::plain::runExport", "Plain Plugin: 导出", false],
    ]);
    expect(catalog.system.map((option) => option.groupLabel)).toEqual(["常规"]);
    expect(catalog.editor.map((option) => [option.value, option.group, option.groupLabel])).toEqual([
      ["editor::heading::moveHeadingUp", "heading", "标题"],
      ["editor::general::switchReadonly", "general", "常规"],
    ]);
    expect(catalog.plugin.map((option) => [option.value, option.group, option.groupLabel])).toEqual([
      ["plugin::damophus::lets-layout-actions.switchLeft", "damophus", "Damophus"],
      ["plugin::plain::runExport", "plain", "Plain Plugin"],
    ]);
  });

  it("groups command options by native group while keeping label order", () => {
    const grouped = groupCommandOptions([
      { value: "b", label: "B", available: true, group: "g2", groupLabel: "Bbb" },
      { value: "a", label: "A", available: true, group: "g1", groupLabel: "Aaa" },
      { value: "c", label: "C", available: true, group: "g2", groupLabel: "Bbb" },
    ]);

    expect(grouped.map((group) => [group.group, group.groupLabel, group.options.map((o) => o.value)])).toEqual([
      ["g1", "Aaa", ["a"]],
      ["g2", "Bbb", ["b", "c"]],
    ]);
  });

  it("returns empty catalogs when SiYuan state is not available", () => {
    const catalog = collectCommandOptions();

    expect(catalog).toEqual({ system: [], plugin: [], editor: [] });
  });
});

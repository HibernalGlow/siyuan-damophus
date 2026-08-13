import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExpandedPluginMenuSettings from "./ExpandedPluginMenuSettings.svelte";

let mounted: ReturnType<typeof mount>[] = [];
const discoveredEntries = JSON.stringify([
  { key: "module:calloutTools", label: "转换为 Callout", pluginId: "siyuan-damophus", moduleId: "calloutTools", declaration: "calloutTools/convert", source: "identity", lastSeen: 3 },
  { key: "plugin:other-plugin|混搭", label: "混搭", pluginId: "other-plugin", source: "identity", lastSeen: 2 },
  { key: "label:旧插件", label: "旧插件", source: "label", lastSeen: 1 },
]);
const labels = {
  listTitle: "已发现的菜单入口", listDescription: "自动发现。", empty: "尚未发现", emptyHint: "打开菜单。",
  allowExpansion: "允许展开", moduleEnabled: "模块已启用", moduleDisabled: "模块已停用",
  externalPlugin: "外部插件", textMatch: "文字匹配", moduleId: "模块", pluginId: "插件", declaration: "声明路径",
  advanced: "高级规则", advancedDescription: "外部插件与旧文字规则。", advancedPlaceholder: "plugin:other-plugin",
};

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

function render(changed = vi.fn(), entries: unknown = discoveredEntries) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  target.style.width = "760px";
  document.body.append(target);
  mounted.push(mount(ExpandedPluginMenuSettings, {
    target,
    props: {
      group: "插件菜单完全展开", title: "插件菜单完全展开", discoveredEntries: entries,
      moduleStates: { calloutTools: true }, allowedEntries: "转换为 Callout\nplugin:future-plugin", labels,
    },
    events: { changed },
  }));
  return { target, changed };
}

describe("expanded plugin menu settings", () => {
  it("renders only automatically identified entries with dedicated identity details", async () => {
    await page.viewport(900, 760);
    const { target } = render();
    await tick();
    const rows = target.querySelectorAll<HTMLElement>("[data-entry-key]");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("calloutTools");
    expect(rows[0].textContent).toContain("siyuan-damophus");
    expect(rows[0].textContent).toContain("calloutTools/convert");
    expect(rows[1].textContent).toContain("外部插件");
    expect(target.textContent).not.toContain("旧插件");
    expect(target.querySelectorAll('[role="switch"][data-state="checked"]')).toHaveLength(1);
    target.querySelector("summary")?.click();
    await tick();
    expect(target.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe("plugin:future-plugin");
  });

  it("persists a discovered external entry without requiring metadata", async () => {
    const { target, changed } = render();
    await tick();
    target.querySelector<HTMLButtonElement>('[role="switch"][aria-label="允许展开: 混搭"]')?.click();
    await tick();
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ detail: {
      group: "插件菜单完全展开", key: "allowedEntries",
      value: "module:calloutTools\nplugin:other-plugin|混搭\nplugin:future-plugin",
    } }));
  });

  it("shows an actionable empty state before the first menu scan", async () => {
    const { target } = render(vi.fn(), "[]");
    await tick();
    expect(target.textContent).toContain("尚未发现");
    expect(target.querySelectorAll("[data-entry-key]")).toHaveLength(0);
  });

  it("contains long identities at narrow widths", async () => {
    await page.viewport(420, 760);
    const { target } = render();
    target.style.width = "360px";
    await tick();
    expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);
  });
});

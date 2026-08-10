import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import EntryManagementSettings from "./entry-management-settings.svelte";
import type { ManagedEntryModule } from "@/libs/module-settings";

let mounted: ReturnType<typeof mount>[] = [];

afterEach(async () => {
  await Promise.all(mounted.map((component) => unmount(component)));
  mounted = [];
  document.body.innerHTML = "";
});

const modules: ManagedEntryModule[] = [
  {
    pluginName: "skillManager",
    group: "lets-skill-manager.displayName",
    title: "lets-skill-manager.displayName",
    description: "",
    icon: "brain",
    enabled: true,
    surfaces: {
      desktopDock: { type: "checkbox", key: "entryDesktopDock", title: "Desktop", value: false },
      mobileDock: { type: "checkbox", key: "entryMobileDock", title: "Mobile", value: true },
      menu: { type: "checkbox", key: "entryMenu", title: "Menu", value: true },
      command: { type: "checkbox", key: "entryCommand", title: "Command", value: true },
      tab: { type: "checkbox", key: "entryTab", title: "Tab", value: true },
    },
  },
  {
    pluginName: "agentSurface",
    group: "lets-agent-surface.displayName",
    title: "lets-agent-surface.displayName",
    description: "",
    icon: "sparkles",
    enabled: false,
    surfaces: {
      menu: { type: "checkbox", key: "entryMenu", title: "Menu", value: true },
      tab: { type: "checkbox", key: "entryTab", title: "Tab", value: false },
    },
  },
];

const labels = {
  desktopDock: "桌面侧栏",
  mobileDock: "移动 Dock",
  menu: "插件菜单",
  command: "命令",
  tab: "新标签页",
  disabled: "模块已停用",
  unavailable: "未提供",
};

function render(mobile: boolean, changed = vi.fn()) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root";
  document.body.appendChild(target);
  mounted.push(mount(EntryManagementSettings, {
    target,
    props: {
      modules,
      labels,
      mobile,
      translate: (key: string) => ({
        "lets-skill-manager.displayName": "技能管理",
        "lets-agent-surface.displayName": "智能体",
      })[key] ?? key,
    },
    events: { changed },
  }));
  return { target, changed };
}

describe("entry management settings", () => {
  it("renders declared entry capabilities and updates the owning module", async () => {
    await page.viewport(1000, 720);
    const { target, changed } = render(false);
    await tick();

    expect(target.querySelector("svg.lucide-brain")).not.toBeNull();
    expect(target.textContent).toContain("技能管理");
    expect(target.textContent).toContain("模块已停用");
    expect(target.querySelectorAll('[aria-label="未提供"]')).toHaveLength(3);
    const desktopDock = target.querySelector<HTMLButtonElement>('[role="switch"][aria-label="技能管理: 桌面侧栏"]');
    if (!desktopDock) throw new Error("Missing desktop Dock switch");
    expect(desktopDock.getBoundingClientRect().width).toBeGreaterThanOrEqual(24);
    expect(desktopDock.getBoundingClientRect().height).toBeGreaterThanOrEqual(14);
    expect(getComputedStyle(desktopDock).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    desktopDock.click();
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {
        group: "lets-skill-manager.displayName",
        key: "entryDesktopDock",
        value: true,
      },
    }));
  });

  it("uses a stacked layout without horizontal overflow on mobile", async () => {
    await page.viewport(390, 700);
    const { target } = render(true);
    await tick();

    expect(target.textContent).toContain("移动 Dock");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });
});

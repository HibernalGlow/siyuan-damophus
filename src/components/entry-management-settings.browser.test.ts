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
      contextMenu: { type: "checkbox", key: "entryContextMenu", title: "Context", value: true },
      command: { type: "checkbox", key: "entryCommand", title: "Command", value: true },
      tab: { type: "checkbox", key: "entryTab", title: "Tab", value: true },
    },
    leafSwitches: [
      { type: "checkbox", key: "hideSourceAnswers", title: "Hide source answers", value: true, menu: true },
    ],
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
    leafSwitches: [],
  },
];

const labels = {
  desktopDock: "桌面侧栏",
  mobileDock: "移动 Dock",
  menu: "Damophus 菜单",
  contextMenu: "上下文菜单",
  command: "命令",
  tab: "新标签页",
  quickSwitches: "快捷开关",
  showModuleDetailSwitches: "在模块内部显示启用开关",
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
        "Hide source answers": "隐藏原文答案",
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
    expect(target.querySelectorAll('[aria-label="未提供"]')).toHaveLength(0);
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

    const contextMenu = target.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="技能管理: 上下文菜单"]',
    );
    if (!contextMenu) throw new Error("Missing context-menu switch");
    contextMenu.click();
    await tick();
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {
        group: "lets-skill-manager.displayName",
        key: "entryContextMenu",
        value: false,
      },
    }));

    const leafSwitch = target.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="技能管理: 隐藏原文答案"]',
    );
    if (!leafSwitch) throw new Error("Missing declaration leaf switch");
    expect(leafSwitch.getBoundingClientRect().height).toBeLessThanOrEqual(24);
    leafSwitch.click();
    await tick();
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {
        group: "lets-skill-manager.displayName",
        key: "hideSourceAnswers",
        value: false,
      },
    }));
  });

  it("uses a stacked layout without horizontal overflow on mobile", async () => {
    await page.viewport(390, 700);
    const { target, changed } = render(true);
    await tick();

    expect(target.textContent).toContain("移动 Dock");
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
    const mobileDock = target.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="技能管理: 移动 Dock"]',
    );
    if (!mobileDock) throw new Error("Missing mobile Dock switch");
    mobileDock.click();
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: {
        group: "lets-skill-manager.displayName",
        key: "entryMobileDock",
        value: false,
      },
    }));
  });

  it("updates the module-detail switch visibility preference", async () => {
    await page.viewport(1000, 720);
    const target = document.createElement("div");
    target.className = "damophus-theme-root";
    document.body.appendChild(target);
    const changed = vi.fn();
    mounted.push(mount(EntryManagementSettings, {
      target,
      props: { modules, labels, showModuleDetailSwitches: false },
      events: { moduleDetailSwitchesChanged: changed },
    }));
    await tick();

    const control = target.querySelector<HTMLButtonElement>(
      '[role="switch"][aria-label="在模块内部显示启用开关"]',
    );
    if (!control) throw new Error("Missing module-detail visibility switch");
    expect(control.dataset.state).toBe("unchecked");
    control.click();
    await tick();
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ detail: true }));
  });

  it("reorders menu modules by dragging the grip", async () => {
    await page.viewport(1000, 720);
    const changed = vi.fn();
    const { target } = render(false);
    const component = mounted.pop();
    if (component) await unmount(component);
    target.innerHTML = "";
    mounted.push(mount(EntryManagementSettings, {
      target,
      props: { modules, labels, mobile: false },
      events: { menuOrderChanged: changed },
    }));
    await tick();

    const source = target.querySelector<HTMLElement>('[data-entry-module="skillManager"] .entry-module__drag-handle');
    const destination = target.querySelector<HTMLElement>('[data-entry-module="agentSurface"]');
    if (!source || !destination) throw new Error("Missing draggable menu rows");
    const sourceRect = source.getBoundingClientRect();
    const destinationRect = destination.getBoundingClientRect();
    source.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 1, buttons: 1, clientX: sourceRect.left + 4, clientY: sourceRect.top + 4 }));
    document.dispatchEvent(new PointerEvent("pointermove", { bubbles: true, pointerId: 1, buttons: 1, clientX: destinationRect.left + 12, clientY: destinationRect.bottom - 2 }));
    const indicator = getComputedStyle(destination, "::after");
    expect(destination.classList.contains("drop-after")).toBe(true);
    expect(parseFloat(indicator.height)).toBeGreaterThanOrEqual(4);
    expect(parseFloat(indicator.width)).toBeGreaterThanOrEqual(destinationRect.width - 24);
    expect(indicator.backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    document.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, pointerId: 1, clientX: destinationRect.left + 12, clientY: destinationRect.bottom - 2 }));
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({ detail: ["agentSurface", "skillManager"] }));
  });
});

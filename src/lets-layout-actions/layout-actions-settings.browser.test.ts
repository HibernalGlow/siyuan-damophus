import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import LayoutActionsSettings from "./LayoutActionsSettings.svelte";
import { DEFAULT_ACTIONS } from "./actions";
import { openIconPickerDialog } from "@/components/icon-picker-dialog";

vi.mock("@/components/icon-picker-dialog", () => ({ openIconPickerDialog: vi.fn() }));

const actions = DEFAULT_ACTIONS.map((action, index) => ({
  ...action,
  title: ["切换左侧面板布局", "切换右侧面板布局", "切换底部面板布局"][index],
}));

const labels = {
  dockPosition: "Dock 位置",
  actions: "自定义快捷操作",
  addAction: "添加操作",
  enabled: "启用",
  title: "标题",
  icon: "图标",
  kind: "来源",
  command: "命令",
  commandId: "命令 ID",
  placement: "显示位置",
  system: "思源系统命令",
  plugin: "插件命令",
  editor: "编辑器命令",
  placementMenu: "Damophus 菜单",
  dock: "Dock",
  both: "菜单和 Dock",
  leftTop: "左上",
  leftBottom: "左下",
  rightTop: "右上",
  rightBottom: "右下",
  bottomLeft: "底部左侧",
  bottomRight: "底部右侧",
  unavailable: "不可调用",
  moveUp: "上移",
  moveDown: "下移",
  remove: "删除",
  iconPickerBrowse: "浏览",
  iconPickerTitle: "选择图标",
  iconPickerSearch: "搜索图标…",
  iconPickerEmpty: "没有匹配的图标",
  commandSearch: "搜索命令…",
  commandEmpty: "没有匹配的命令",
};

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
  vi.mocked(openIconPickerDialog).mockReset();
});

function render(changed = vi.fn()) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  document.body.append(target);
  component = mount(LayoutActionsSettings, {
    target,
    props: {
      group: "lets-layout-actions.displayName",
      title: "快捷操作",
      moduleSettingItems: [{
        type: "checkbox",
        title: "快捷操作总开关",
        description: "Enable layout actions",
        key: "enabled",
        value: true,
      }],
      actions,
      dockPosition: "RightBottom",
      labels,
    },
    events: { changed },
  });
  return { target, changed };
}

describe("layout actions settings", () => {
  it("exposes editable actions without the retired aggregate Dock switch", async () => {
    const { target } = render();
    await tick();

    expect(target.querySelector('[role="switch"][aria-label*="Dock"]')).toBeNull();
    expect(target.textContent).not.toContain("快捷操作总开关");
    expect(target.textContent).toContain(labels.dockPosition);
    expect([...target.querySelectorAll<HTMLInputElement>("input")].some(
      (input) => input.value === "切换左侧面板布局",
    )).toBe(true);
    expect(target.querySelectorAll("article")).toHaveLength(3);
  });

  it("adds disabled actions without overflowing a mobile viewport", async () => {
    await page.viewport(390, 760);
    const { target, changed } = render();
    await tick();

    [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("添加操作"))
      ?.click();
    await tick();

    expect(changed).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({ key: "actions", value: expect.any(Array) }),
    }));
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(window.innerWidth);
  });

  it("previews the configured icon and opens the picker preselected with it", async () => {
    const { target } = render();
    await tick();

    const preview = target.querySelector<SVGUseElement>("[data-icon-preview] use");
    expect(preview?.getAttribute("href")).toBe("#iconDamophusPanelLeftClose");
    expect(preview?.getAttribute("xlink:href")).toBe("#iconDamophusPanelLeftClose");

    [...target.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes(labels.iconPickerBrowse))
      ?.click();
    await tick();

    expect(openIconPickerDialog).toHaveBeenCalledWith(expect.objectContaining({
      title: labels.iconPickerTitle,
      selected: "iconDamophusPanelLeftClose",
      labels: { search: labels.iconPickerSearch, empty: labels.iconPickerEmpty },
    }));
  });
});

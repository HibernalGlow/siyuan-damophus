import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import pluginMetadata from "./plugin";
import {
  EXPANDED_PLUGIN_MENU_ATTRIBUTE,
  EXPANDED_PLUGIN_MENU_GROUP_CLASS,
  EXPANDED_PLUGIN_MENU_GROUP_TITLE_CLASS,
  EXPANDED_PLUGIN_MENU_PANEL_CLASS,
  EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE,
  EXPANDED_PLUGIN_MENU_STYLE_ID,
  EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE,
  ExpandedPluginMenuController,
  parseExpandedPluginMenuAllowedEntries,
} from "./expanded-plugin-menu";

function createItem(label: string, childSubmenu?: HTMLElement): HTMLButtonElement {
  const menuItem = document.createElement("button");
  menuItem.className = "b3-menu__item";
  const labelElement = document.createElement("span");
  labelElement.className = "b3-menu__label";
  labelElement.textContent = label;
  menuItem.append(labelElement);
  if (childSubmenu) menuItem.append(childSubmenu);
  return menuItem;
}

function createSubmenu(labels: string[]): HTMLElement {
  const panel = document.createElement("div");
  panel.className = "b3-menu__submenu";
  const items = document.createElement("div");
  items.className = "b3-menu__items";
  items.append(...labels.map((label) => createItem(label)));
  panel.append(items);
  return panel;
}

function renderBlockMenu(): HTMLElement {
  if (!document.getElementById("expanded-menu-host-style")) {
    const hostStyle = document.createElement("style");
    hostStyle.id = "expanded-menu-host-style";
    hostStyle.textContent = `
      .b3-menu { position: absolute; left: 120px; top: 200px; width: 240px; }
      .b3-menu__item { position: relative; display: flex; box-sizing: border-box; width: 100%; min-height: 36px; }
      .b3-menu__label { flex: 1; }
      .b3-menu__submenu { position: absolute; }
    `;
    document.head.append(hostStyle);
  }
  const menu = document.createElement("div");
  menu.className = "b3-menu";
  const pluginSubmenu = createSubmenu([
    "块挖空", "有序列表编号", "从此块打开题库", "导出 Kramdown", "相同文字格式刷",
  ]);
  pluginSubmenu.querySelector(":scope > .b3-menu__items")?.append(
    createItem("添加属性", createSubmenu(["51", "52"])),
    createItem("调整标题", createSubmenu(["调整为 H1", "调整为 H2"])),
    createItem("转换为 Callout", createSubmenu(["Note", "Tip", "Important", "Warning", "Caution"])),
  );
  menu.append(
    createItem("复制"),
    createItem("转换为", createSubmenu(["一级标题", "二级标题"])),
    createItem("插件", pluginSubmenu),
  );
  document.body.append(menu);
  return menu;
}

function itemByLabel(root: ParentNode, label: string): HTMLElement {
  const item = Array.from(root.querySelectorAll<HTMLElement>(ITEM_SELECTOR))
    .find((candidate) => candidate.querySelector(":scope > .b3-menu__label")?.textContent === label);
  if (!item) throw new Error(`Menu item not found: ${label}`);
  return item;
}

const ITEM_SELECTOR = ".b3-menu__item";

function pointAt(item: HTMLElement): void {
  item.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
}

afterEach(() => {
  document.body.replaceChildren();
  document.getElementById(EXPANDED_PLUGIN_MENU_STYLE_ID)?.remove();
  document.getElementById("expanded-menu-host-style")?.remove();
  vi.restoreAllMocks();
});

describe("expanded plugin menu", () => {
  it("opens the existing plugin branch as one multi-column panel", async () => {
    await page.viewport(1440, 900);
    const menu = renderBlockMenu();
    const controller = new ExpandedPluginMenuController();
    controller.start();

    const pluginItem = itemByLabel(menu, "插件");
    pointAt(pluginItem);
    const panel = pluginItem.querySelector<HTMLElement>(":scope > .b3-menu__submenu")!;
    expect(menu.hasAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE)).toBe(true);
    expect(pluginItem.getAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE)).toBe("right");
    expect(pluginItem.hasAttribute(EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE)).toBe(true);
    const flatPanel = panel.querySelector<HTMLElement>(`:scope > .${EXPANDED_PLUGIN_MENU_PANEL_CLASS}`)!;
    expect(getComputedStyle(panel).display).toBe("block");
    expect(getComputedStyle(flatPanel).display).toBe("grid");
    expect(getComputedStyle(panel).visibility).toBe("visible");
    expect(getComputedStyle(panel).pointerEvents).toBe("auto");
    expect(flatPanel.querySelectorAll(`.${EXPANDED_PLUGIN_MENU_GROUP_CLASS}`)).toHaveLength(3);
    expect(flatPanel.querySelectorAll(`.${EXPANDED_PLUGIN_MENU_GROUP_CLASS} > .b3-menu__item`)).toHaveLength(12);
    expect(Number(pluginItem.style.getPropertyValue("--damophus-plugin-menu-columns"))).toBeGreaterThan(1);

    const groupTitles = Array.from(flatPanel.querySelectorAll<HTMLElement>(`.${EXPANDED_PLUGIN_MENU_GROUP_TITLE_CLASS}`))
      .map((heading) => heading.textContent);
    expect(groupTitles).toEqual(["快捷命令", "转换为 Callout", "其他插件"]);
    const flatLabels = Array.from(flatPanel.querySelectorAll<HTMLElement>(`.${EXPANDED_PLUGIN_MENU_GROUP_CLASS} > .b3-menu__item > .b3-menu__label`))
      .map((label) => label.textContent);
    expect(flatLabels).toContain("Note");
    expect(flatLabels).toContain("Caution");
    expect(flatLabels).toContain("添加属性");
    expect(flatLabels).not.toContain("添加属性 / 51");
    expect(itemByLabel(flatPanel, "添加属性").querySelector(":scope > .b3-menu__submenu")).not.toBeNull();

    const itemRect = pluginItem.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    expect(Math.abs(panelRect.left - itemRect.right)).toBeLessThanOrEqual(6);
    expect(panelRect.width).toBeGreaterThan(360);
    expect(panel.scrollWidth).toBeLessThanOrEqual(panel.clientWidth);

    controller.destroy();
  });

  it("enhances menus added after startup without replacing their click handlers", async () => {
    const controller = new ExpandedPluginMenuController();
    controller.start();
    const menu = renderBlockMenu();
    const originalAction = vi.fn();
    const nestedAction = Array.from(menu.querySelectorAll<HTMLElement>(".b3-menu__item"))
      .find((candidate) => candidate.querySelector(":scope > .b3-menu__label")?.textContent === "Note")!;
    nestedAction.addEventListener("click", originalAction);
    await new Promise((resolve) => setTimeout(resolve));

    const pluginItem = itemByLabel(menu, "插件");
    expect(pluginItem.hasAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE)).toBe(true);
    nestedAction.click();
    expect(originalAction).toHaveBeenCalledOnce();

    controller.destroy();
  });

  it("opens toward the available side near the right viewport edge", async () => {
    await page.viewport(800, 700);
    const menu = renderBlockMenu();
    menu.style.left = "548px";
    const controller = new ExpandedPluginMenuController();
    controller.start();

    const pluginItem = itemByLabel(menu, "插件");
    pointAt(pluginItem);
    const panel = pluginItem.querySelector<HTMLElement>(":scope > .b3-menu__submenu")!;
    expect(pluginItem.getAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE)).toBe("left");
    expect(pluginItem.style.getPropertyValue("--damophus-plugin-menu-columns")).toBe("2");
    expect(Math.abs(panel.getBoundingClientRect().right - pluginItem.getBoundingClientRect().left)).toBeLessThanOrEqual(6);
    expect(panel.getBoundingClientRect().left).toBeGreaterThanOrEqual(12);
    const groups = panel.querySelectorAll<HTMLElement>(`.${EXPANDED_PLUGIN_MENU_GROUP_CLASS}`);
    expect(groups[0].style.borderLeft).toBe("0px");
    expect(groups[1].style.borderLeft).toBe("");
    expect(groups[2].style.borderLeft).toBe("0px");

    controller.destroy();
  });

  it("does not alter slash menus or ordinary nested menus", async () => {
    const hint = document.createElement("div");
    hint.className = "protyle-hint";
    const hintMenu = document.createElement("div");
    hintMenu.className = "b3-menu";
    hintMenu.append(createItem("插件", createSubmenu(["模板", "资源"])));
    hint.append(hintMenu);
    const ordinary = document.createElement("div");
    ordinary.className = "b3-menu";
    ordinary.append(createItem("布局", createSubmenu(["上下布局", "左右布局"])));
    document.body.append(hint, ordinary);
    const controller = new ExpandedPluginMenuController();
    controller.start();
    await new Promise((resolve) => setTimeout(resolve));

    expect(document.querySelectorAll(`[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}]`)).toHaveLength(0);
    expect(hint.querySelector(".b3-menu")?.hasAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE)).toBe(false);
    expect(ordinary.hasAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE)).toBe(false);

    controller.destroy();
  });

  it("yields to a native sibling submenu and returns when Plugins is entered again", () => {
    const menu = renderBlockMenu();
    const controller = new ExpandedPluginMenuController();
    controller.start();
    const pluginItem = itemByLabel(menu, "插件");
    const pluginSubmenu = pluginItem.querySelector<HTMLElement>(":scope > .b3-menu__submenu")!;
    const nativeConvert = itemByLabel(menu, "转换为");

    pointAt(pluginItem);
    expect(getComputedStyle(pluginSubmenu).display).toBe("block");
    pointAt(nativeConvert);
    expect(pluginItem.hasAttribute(EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE)).toBe(false);
    expect(getComputedStyle(pluginSubmenu).visibility).toBe("hidden");
    expect(getComputedStyle(pluginSubmenu).pointerEvents).toBe("none");
    expect(nativeConvert.querySelector(":scope > .b3-menu__submenu")).not.toBeNull();

    pointAt(pluginItem);
    expect(getComputedStyle(pluginSubmenu).display).toBe("block");
    const flatCommand = itemByLabel(pluginSubmenu, "Note");
    pointAt(flatCommand);
    expect(getComputedStyle(pluginSubmenu).display).toBe("block");
    controller.destroy();
  });

  it("rebuilds an open menu when the persisted whitelist changes", () => {
    const menu = renderBlockMenu();
    const controller = new ExpandedPluginMenuController();
    controller.start("转换为 Callout");
    const pluginItem = itemByLabel(menu, "插件");
    pointAt(pluginItem);
    expect(itemByLabel(pluginItem, "Note")).toBeTruthy();
    expect(itemByLabel(pluginItem, "添加属性")).toBeTruthy();

    controller.updateAllowedEntries(" 添加属性 \n\n添加属性");
    pointAt(pluginItem);
    expect(itemByLabel(pluginItem, "51")).toBeTruthy();
    expect(itemByLabel(pluginItem, "转换为 Callout")).toBeTruthy();
    expect(pluginItem.querySelector<HTMLElement>(`:scope > .b3-menu__submenu > .${EXPANDED_PLUGIN_MENU_PANEL_CLASS}`))
      .not.toBeNull();
    controller.destroy();
  });

  it("removes every owned style and attribute when disabled", () => {
    const menu = renderBlockMenu();
    const pluginItem = itemByLabel(menu, "插件");
    const panel = pluginItem.querySelector<HTMLElement>(":scope > .b3-menu__submenu")!;
    const controller = new ExpandedPluginMenuController();
    controller.start();
    controller.destroy();

    expect(document.getElementById(EXPANDED_PLUGIN_MENU_STYLE_ID)).toBeNull();
    expect(menu.hasAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE)).toBe(false);
    expect(pluginItem.hasAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE)).toBe(false);
    expect(panel.style.left).toBe("");
    expect(panel.style.right).toBe("");
    expect(menu.querySelector(`.${EXPANDED_PLUGIN_MENU_PANEL_CLASS}`)).toBeNull();
    expect(Array.from(menu.querySelectorAll<HTMLElement>(".b3-menu__label"))
      .some((label) => label.textContent === "Note")).toBe(true);
  });

  it("drops references to menus that SiYuan replaces between openings", async () => {
    const controller = new ExpandedPluginMenuController();
    controller.start();
    const firstMenu = renderBlockMenu();
    await new Promise((resolve) => setTimeout(resolve));
    firstMenu.remove();
    const secondMenu = renderBlockMenu();
    await new Promise((resolve) => setTimeout(resolve));

    expect(secondMenu.querySelector(`[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}]`)).not.toBeNull();
    controller.refresh();
    controller.destroy();
    expect(secondMenu.querySelector(`[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}]`)).toBeNull();
  });

  it("registers as an enabled independent module", () => {
    expect(pluginMetadata).toMatchObject({
      name: "expandedPluginMenu",
      enabled: true,
      icon: "layoutGrid",
      settings: [expect.objectContaining({
        type: "textarea",
        key: "allowedEntries",
      })],
    });
    expect(parseExpandedPluginMenuAllowedEntries(" 转换为 Callout \r\n\r\n对比文档历史 "))
      .toEqual(new Set(["转换为 callout", "对比文档历史"]));
  });
});

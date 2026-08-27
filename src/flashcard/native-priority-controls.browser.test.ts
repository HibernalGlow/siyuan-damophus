import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePriorityControls } from "./native-priority-controls";
import { clearReviewToolbarActions, registerReviewToolbarAction } from "./review-action-registry";

let controls: NativePriorityControls | undefined;

afterEach(() => {
  controls?.uninstall();
  controls = undefined;
  clearReviewToolbarActions();
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function cardRoot(mobile: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = `
    <div class="${mobile ? "toolbar" : "block__icons"}">
      ${mobile
        ? '<svg class="toolbar__icon"><use href="#iconRiffCard"></use></svg><span class="toolbar__text">闪卡</span><svg class="toolbar__icon" data-type="filter"></svg>'
        : '<div class="block__logo block__logo--icon"><svg class="block__logoicon"><use href="#iconRiffCard"></use></svg>闪卡</div><button data-type="filter"></button><span class="fn__space"></span><button data-type="fullscreen"></button><span class="fn__space"></span>'}
    </div>
    <div class="card__block">
      <div class="protyle-breadcrumb">
        <button data-type="exit-focus">退出聚焦</button>
        <button class="block__icon" data-type="readonly"></button>
        <button class="block__icon" data-type="doc"></button>
        <button class="block__icon" data-type="more"></button>
      </div>
      <div data-node-id="20260823120000-aaaaaaa"></div>
    </div>
    <div class="card__action">
      <button data-type="-2"></button><span class="fn__space"></span>
      <button data-type="-1"></button><span class="fn__space"></span>
      <button data-type="-3"></button>
    </div>`;
  document.body.append(root);
  return root;
}

describe("native flashcard toolbar", () => {
  it("injects registered external actions according to configured order", async () => {
    cardRoot(false);
    const execute = vi.fn();
    const dispose = registerReviewToolbarAction({ id: "topic-relations.open", icon: "iconLink", label: "打开考点关系", source: "topic-relations", execute });
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: true, showExitFocus: false, showBrand: true, reviewToolbarActionOrder: ["topic-relations.open"] }),
      getCurrentCard: () => undefined,
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(), unregister: vi.fn(async () => false), openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true, toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({}), toggleRendererVisibility: vi.fn(), toggleToolVisibility: vi.fn(),
    });
    controls.install();
    const action = await vi.waitFor(() => document.querySelector<HTMLElement>('[data-damophus-flashcard-action="topic-relations.open"]'));
    expect(action?.getAttribute("aria-label")).toBe("打开考点关系");
    action?.click();
    expect(execute).toHaveBeenCalledTimes(1);
    dispose();
    controls.refresh();
    await vi.waitFor(() => expect(document.querySelector('[data-damophus-flashcard-action="topic-relations.open"]')).toBeNull());
  });

  it.each([false, true])("attaches native icon actions on %s layout", async (mobile) => {
    cardRoot(mobile);
    const locate = vi.fn();
    const openWorkbench = vi.fn();
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false, showBrand: true }),
      getCurrentCard: () => ({ blockID: "20260823120000-aaaaaaa", cardID: "card-1" }),
      setPriority: vi.fn(async () => "native" as const),
      locate,
      unregister: vi.fn(async () => false),
      openWorkbench,
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    await vi.waitFor(() => expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(5));
    document.querySelector<HTMLElement>('[data-damophus-flashcard-tool="iconFocus"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    document.querySelector<HTMLElement>('[data-damophus-flashcard-tool="iconSettings"]')
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    await vi.waitFor(() => expect(locate).toHaveBeenCalled());
    expect(openWorkbench).toHaveBeenCalled();
    const tools = [...document.querySelectorAll<HTMLElement>("[data-damophus-flashcard-tool]")];
    expect(tools.every((tool) => tool.tagName.toLowerCase() === (mobile ? "svg" : "button"))).toBe(true);
    if (mobile) {
      const iconUse = tools[0]?.querySelector("use");
      expect(tools[0]?.namespaceURI).toBe("http://www.w3.org/2000/svg");
      expect(iconUse?.getAttribute("href")).toBe("#iconFocus");
      expect(iconUse?.getAttribute("xlink:href")).toBe("#iconFocus");
    }
  });

  it("removes actions when the workbench switch disables the toolbar", async () => {
    cardRoot(false);
    let enabled = true;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false, showBrand: true }),
      getCurrentCard: () => ({ blockID: "20260823120000-aaaaaaa", cardID: "card-1" }),
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });
    controls.install();
    await vi.waitFor(() => expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(5));

    enabled = false;
    controls.refresh();

    expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(0);
  });

  it("keeps DAMO actions stable on a narrow mobile toolbar", async () => {
    const root = cardRoot(true);
    const toolbar = root.querySelector<HTMLElement>(".toolbar")!;
    let toolbarWidth = 385;
    Object.defineProperties(toolbar, {
      clientWidth: { configurable: true, get: () => toolbarWidth },
      scrollWidth: { configurable: true, get: () => 900 },
    });
    const addItem = vi.fn();
    const commonMenu = document.createElement("div");
    commonMenu.id = "commonMenu";
    document.body.append(commonMenu);
    vi.stubGlobal("siyuan", { menus: { menu: { addItem } } });
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false, showBrand: true }),
      getCurrentCard: () => ({ blockID: "20260823120000-aaaaaaa", cardID: "card-1" }),
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    await vi.waitFor(() => expect(document.querySelectorAll("[data-damophus-flashcard-tool]")).toHaveLength(5));
    const tools = [...document.querySelectorAll<HTMLElement>("[data-damophus-flashcard-tool]")];
    expect(tools.every((tool) => !tool.hasAttribute("hidden"))).toBe(true);
    expect(toolbar.querySelector('[data-type="filter"]')?.hasAttribute("hidden")).toBe(false);

    root.querySelector<HTMLElement>('.protyle-breadcrumb [data-type="more"]')?.click();
    await vi.waitFor(() => expect(addItem.mock.calls.map(([item]) => item.id)).toContain("damophus-flashcard-more-locate"));

    toolbarWidth = 1200;
    controls.refresh();
    expect(tools.every((tool) => !tool.hasAttribute("hidden"))).toBe(true);
  });

  it.each([false, true])("can hide and restore the native card brand on %s layout", async (mobile) => {
    const root = cardRoot(mobile);
    let showBrand = true;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: true, showExitFocus: false, showBrand }),
      getCurrentCard: () => undefined,
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    const brand = mobile
      ? [root.querySelector<HTMLElement>(".toolbar > .toolbar__icon"), root.querySelector<HTMLElement>(".toolbar > .toolbar__text")]
      : [root.querySelector<HTMLElement>(".block__logo")];
    const filter = root.querySelector<HTMLElement>('[data-type="filter"]');
    await vi.waitFor(() => expect(brand.every((element) => !element?.hasAttribute("hidden"))).toBe(true));
    expect(filter?.hasAttribute("hidden")).toBe(false);

    showBrand = false;
    controls.refresh();
    expect(brand.every((element) => element?.hasAttribute("hidden"))).toBe(true);
    expect(filter?.hasAttribute("hidden")).toBe(false);

    showBrand = true;
    controls.refresh();
    expect(brand.every((element) => !element?.hasAttribute("hidden"))).toBe(true);
  });

  it("hides native filter and fullscreen without mutating their own visibility state", async () => {
    const root = cardRoot(false);
    let showFilter = false;
    let showFullscreen = false;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: true, showExitFocus: false, showBrand: true, showFilter, showFullscreen }),
      getCurrentCard: () => undefined,
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    const filter = root.querySelector<HTMLElement>('[data-type="filter"]')!;
    const fullscreen = root.querySelector<HTMLElement>('[data-type="fullscreen"]')!;
    await vi.waitFor(() => expect(getComputedStyle(filter).display).toBe("none"));
    expect(getComputedStyle(fullscreen).display).toBe("none");
    expect(filter.hasAttribute("hidden")).toBe(false);
    expect(fullscreen.hasAttribute("hidden")).toBe(false);
    expect(filter.nextElementSibling?.hasAttribute("data-damophus-native-filter-space")).toBe(true);
    expect(fullscreen.nextElementSibling?.hasAttribute("data-damophus-native-fullscreen-space")).toBe(true);

    showFilter = true;
    showFullscreen = true;
    controls.refresh();
    expect(getComputedStyle(filter).display).not.toBe("none");
    expect(getComputedStyle(fullscreen).display).not.toBe("none");

    controls.uninstall();
    expect(root.hasAttribute("data-damophus-hide-native-filter")).toBe(false);
    expect(root.hasAttribute("data-damophus-hide-native-fullscreen")).toBe(false);
  });

  it("can place skip between PQ and show answer", async () => {
    const root = cardRoot(false);
    let moveSkip = true;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: moveSkip, showExitFocus: false, showBrand: true }),
      getCurrentCard: () => undefined,
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    const action = root.querySelector<HTMLElement>('.card__action')!;
    await vi.waitFor(() => expect([...action.querySelectorAll("button")].map((button) => button.dataset.type)).toEqual(["-2", "-3", "-1"]));

    moveSkip = false;
    controls.refresh();
    expect([...action.querySelectorAll("button")].map((button) => button.dataset.type)).toEqual(["-2", "-1", "-3"]);
  });

  it("adds DAMO tools to the native more menu", async () => {
    const root = cardRoot(false);
    const more = document.createElement("button");
    more.dataset.type = "more";
    root.querySelector(".block__icons")?.append(more);
    const addItem = vi.fn();
    const addSeparator = vi.fn();
    const toggleToolVisibility = vi.fn();
    const toggleRendererVisibility = vi.fn();
    const commonMenu = document.createElement("div");
    commonMenu.id = "commonMenu";
    document.body.append(commonMenu);
    vi.stubGlobal("siyuan", { menus: { menu: { addItem, addSeparator } } });
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false, showBrand: true }),
      getCurrentCard: () => ({ blockID: "20260823120000-aaaaaaa", cardID: "card-1" }),
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility,
      toggleToolVisibility,
    });

    controls.install();
    more.click();
    await vi.waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(addSeparator).not.toHaveBeenCalled();
    expect(addItem.mock.calls.map(([item]) => item.id)).toContain("damophus-flashcard-more-separator");
    expect(addItem.mock.calls.map(([item]) => item.label)).toContain("定位原块");
    const rendererMenu = addItem.mock.calls.map(([item]) => item).find((item) => item.id === "damophus-flashcard-more-renderers");
    expect(rendererMenu?.submenu.map((item: { label: string }) => item.label)).toContain("考点关系（显示中）");
    rendererMenu?.submenu.find((item: { label: string }) => item.label.startsWith("考点关系"))?.click();
    expect(toggleRendererVisibility).toHaveBeenCalledWith("topicRelations");
    const toolbarMenu = addItem.mock.calls.map(([item]) => item).find((item) => item.id === "damophus-flashcard-more-tools");
    expect(toolbarMenu?.submenu.map((item: { label: string }) => item.label)).toContain("原生筛选（已显示）");
    expect(toolbarMenu?.submenu.map((item: { label: string }) => item.label)).toContain("原生全屏（已显示）");
    toolbarMenu?.submenu.find((item: { label: string }) => item.label.startsWith("原生筛选"))?.click();
    expect(toggleToolVisibility).toHaveBeenCalledWith("filter");
    expect(document.querySelectorAll('[data-damophus-flashcard-tool="iconMore"]')).toHaveLength(0);
  });

  it("hides exit focus and compacts the mobile breadcrumb controls", async () => {
    const root = cardRoot(true);
    let showExitFocus = false;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: true, showExitFocus, showBrand: true }),
      getCurrentCard: () => undefined,
      setPriority: vi.fn(async () => "native" as const),
      locate: vi.fn(),
      unregister: vi.fn(async () => false),
      openWorkbench: vi.fn(),
      isRendererOverrideEnabled: () => true,
      toggleRendererOverride: vi.fn(),
      getRendererVisibility: () => ({ mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false }),
      toggleRendererVisibility: vi.fn(),
      toggleToolVisibility: vi.fn(),
    });

    controls.install();
    const breadcrumb = root.querySelector<HTMLElement>(".protyle-breadcrumb")!;
    await vi.waitFor(() => expect(breadcrumb.hasAttribute("data-damophus-flashcard-breadcrumb")).toBe(true));
    expect(breadcrumb.hasAttribute("data-damophus-show-exit-focus")).toBe(false);
    expect(document.getElementById("damophus-flashcard-breadcrumb-policy")).not.toBeNull();

    showExitFocus = true;
    controls.refresh();
    expect(breadcrumb.hasAttribute("data-damophus-show-exit-focus")).toBe(true);
    controls.uninstall();
    expect(breadcrumb.hasAttribute("data-damophus-flashcard-breadcrumb")).toBe(false);
    expect(document.getElementById("damophus-flashcard-breadcrumb-policy")).toBeNull();
  });
});

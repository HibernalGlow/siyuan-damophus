import { afterEach, describe, expect, it, vi } from "vitest";
import { NativePriorityControls } from "./native-priority-controls";

let controls: NativePriorityControls | undefined;

afterEach(() => {
  controls?.uninstall();
  controls = undefined;
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

function cardRoot(mobile: boolean): HTMLElement {
  const root = document.createElement("div");
  root.className = "card__main";
  root.innerHTML = `
    <div class="${mobile ? "toolbar" : "block__icons"}">
      <${mobile ? "svg" : "button"} data-type="filter"></${mobile ? "svg" : "button"}>
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
  it.each([false, true])("attaches native icon actions on %s layout", async (mobile) => {
    cardRoot(mobile);
    const locate = vi.fn();
    const openWorkbench = vi.fn();
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false }),
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
      getSettings: () => ({ enabled, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false }),
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

  it("can place skip between PQ and show answer", async () => {
    const root = cardRoot(false);
    let moveSkip = true;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: moveSkip, showExitFocus: false }),
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
    const commonMenu = document.createElement("div");
    commonMenu.id = "commonMenu";
    document.body.append(commonMenu);
    vi.stubGlobal("siyuan", { menus: { menu: { addItem, addSeparator } } });
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: true, unregister: true, priority: true, workbench: true, renderer: true, skipBetween: true, showExitFocus: false }),
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
    more.click();
    await vi.waitFor(() => expect(addItem).toHaveBeenCalled());
    expect(addSeparator).not.toHaveBeenCalled();
    expect(addItem.mock.calls.map(([item]) => item.id)).toContain("damophus-flashcard-more-separator");
    expect(addItem.mock.calls.map(([item]) => item.label)).toContain("定位原块");
    expect(document.querySelectorAll('[data-damophus-flashcard-tool="iconMore"]')).toHaveLength(0);
  });

  it("hides exit focus and compacts the mobile breadcrumb controls", async () => {
    const root = cardRoot(true);
    let showExitFocus = false;
    controls = new NativePriorityControls({
      documentRef: document,
      getSettings: () => ({ enabled: true, locate: false, unregister: false, priority: false, workbench: false, renderer: false, skipBetween: true, showExitFocus }),
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

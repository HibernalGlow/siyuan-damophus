import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import type { IProtyle } from "siyuan";
import CalloutToolsPlugin from "./index";
import pluginMetadata from "./plugin";

const ORIGINAL_LUTE = window.Lute;

interface EventBusMock {
  listeners: Map<string, Set<(event: CustomEvent<unknown>) => void>>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: (type: string, detail: unknown) => void;
}

function createEventBus(): EventBusMock {
  const listeners = new Map<string, Set<(event: CustomEvent<unknown>) => void>>();
  const on = vi.fn((type: string, listener: (event: CustomEvent<unknown>) => void) => {
    const set = listeners.get(type) ?? new Set();
    set.add(listener);
    listeners.set(type, set);
  });
  const off = vi.fn((type: string, listener: (event: CustomEvent<unknown>) => void) => {
    listeners.get(type)?.delete(listener);
  });
  return {
    listeners,
    on,
    off,
    emit: (type, detail) => {
      for (const listener of listeners.get(type) ?? []) listener(new CustomEvent(type, { detail }));
    },
  };
}

function createPlugin(settings: Record<string, unknown>, eventBus: EventBusMock): CalloutToolsPlugin {
  setPlugin({ eventBus });
  const module = new CalloutToolsPlugin();
  module.getSetting = (key) => settings[key];
  module.t = (key) => key;
  return module;
}

afterEach(() => {
  document.body.replaceChildren();
  setPlugin(undefined);
  window.Lute = ORIGINAL_LUTE;
});

describe("Callout tools module", () => {
  it("is independent and exposes enabled-by-default behavior switches", () => {
    expect(pluginMetadata).toMatchObject({ name: "calloutTools", enabled: true });
    expect(pluginMetadata.settings?.map((setting) => [setting.key, setting.value])).toEqual([
      ["smartInsert", true],
      ["blockMenuConversion", true],
      ["promoteHeadingToTitle", true],
    ]);
  });

  it("adds five selectable Callout types to the block menu", () => {
    const eventBus = createEventBus();
    const module = createPlugin({ smartInsert: false, blockMenuConversion: true }, eventBus);
    const addItem = vi.fn();
    const block = document.createElement("div");
    block.dataset.nodeId = "p";
    block.dataset.type = "NodeParagraph";
    const root = document.createElement("div");
    root.append(block);
    document.body.append(root);
    const transaction = vi.fn();
    const protyle = {
      block: { parentID: "document-root" },
      disabled: false,
      getInstance: () => ({ transaction }),
    } as unknown as IProtyle;

    module.onload();
    eventBus.emit("click-blockicon", { menu: { addItem }, protyle, blockElements: [block] });

    expect(addItem).toHaveBeenCalledOnce();
    const menu = addItem.mock.calls[0]?.[0];
    expect(menu.label).toBe("lets-callout-tools.menuLabel");
    expect(menu.submenu).toHaveLength(5);
    expect(menu.submenu.every((item: { disabled?: boolean }) => item.disabled !== true)).toBe(true);
    module.onunload();
  });

  it("enables conversion from a list item's own block menu", () => {
    const eventBus = createEventBus();
    const module = createPlugin({ smartInsert: false, blockMenuConversion: true }, eventBus);
    const addItem = vi.fn();
    const root = document.createElement("div");
    root.innerHTML = `<div data-node-id="list" data-type="NodeList">
      <div data-node-id="item" data-type="NodeListItem">
        <div class="protyle-action">1.</div>
        <div data-node-id="body" data-type="NodeParagraph">Body</div>
        <div class="protyle-attr"></div>
      </div>
    </div>`;
    document.body.append(root);
    const listItem = root.querySelector<HTMLElement>('[data-node-id="item"]')!;
    const protyle = {
      block: { parentID: "document-root" },
      disabled: false,
      getInstance: () => ({ transaction: vi.fn() }),
    } as unknown as IProtyle;

    module.onload();
    eventBus.emit("click-blockicon", { menu: { addItem }, protyle, blockElements: [listItem] });

    expect(addItem).toHaveBeenCalledOnce();
    expect(addItem.mock.calls[0]?.[0].submenu.every(
      (item: { disabled?: boolean }) => item.disabled !== true,
    )).toBe(true);
    module.onunload();
  });

  it("keeps headings in the body when title promotion is switched off", () => {
    const eventBus = createEventBus();
    const module = createPlugin({
      smartInsert: false,
      blockMenuConversion: true,
      promoteHeadingToTitle: false,
    }, eventBus);
    const addItem = vi.fn();
    const root = document.createElement("div");
    root.innerHTML = `
      <div data-node-id="heading" data-type="NodeHeading">Section title</div>
      <div data-node-id="body" data-type="NodeParagraph">Body</div>
    `;
    document.body.append(root);
    const blocks = ["heading", "body"].map(
      (id) => root.querySelector<HTMLElement>(`[data-node-id="${id}"]`)!,
    );
    const transaction = vi.fn();
    const protyle = {
      block: { parentID: "document-root" },
      disabled: false,
      getInstance: () => ({ transaction }),
    } as unknown as IProtyle;
    window.Lute = { ...ORIGINAL_LUTE, NewNodeID: () => "callout" } as typeof window.Lute;

    module.onload();
    eventBus.emit("click-blockicon", { menu: { addItem }, protyle, blockElements: blocks });
    addItem.mock.calls[0]?.[0].submenu[0].click();

    const callout = root.querySelector<HTMLElement>('[data-node-id="callout"]')!;
    expect(callout.querySelector(".callout-title")?.textContent).toBe("Note");
    expect(Array.from(callout.querySelector(":scope > .callout-content")!.children)
      .map((item) => (item as HTMLElement).dataset.nodeId)).toEqual(["heading", "body"]);
    expect(transaction).toHaveBeenCalledOnce();
    module.onunload();
  });

  it("keeps block conversion disabled without disabling smart insertion lifecycle", () => {
    const eventBus = createEventBus();
    const module = createPlugin({ smartInsert: true, blockMenuConversion: false }, eventBus);
    const addItem = vi.fn();

    module.onload();
    expect(eventBus.on).toHaveBeenCalledWith("loaded-protyle-static", expect.any(Function));
    eventBus.emit("click-blockicon", { menu: { addItem }, protyle: {}, blockElements: [] });
    expect(addItem).not.toHaveBeenCalled();
    module.onunload();
  });
});

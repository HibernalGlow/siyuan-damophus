import { describe, expect, it, vi } from "vitest";
import type { IMenu } from "siyuan";
import {
  bindMenuIdentity,
  markMenuIdentity,
  MENU_DECLARATION_ATTRIBUTE,
  MENU_MODULE_ATTRIBUTE,
  MENU_PLUGIN_ATTRIBUTE,
  installPluginMenuIdentityInstrumentation,
  withMenuEventIdentityRegistration,
  withMenuIdentity,
} from "./menu-identity";

function createElement(): HTMLElement {
  const attributes = new Map<string, string>();
  return {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  } as unknown as HTMLElement;
}

describe("menu identity", () => {
  it("marks plugin, module, and joined declaration identities", () => {
    const element = createElement();
    markMenuIdentity(element, {
      plugin: "siyuan-damophus",
      module: "questionBank",
      declaration: ["practice", "review"],
    });

    expect(element.getAttribute(MENU_PLUGIN_ATTRIBUTE)).toBe("siyuan-damophus");
    expect(element.getAttribute(MENU_MODULE_ATTRIBUTE)).toBe("questionBank");
    expect(element.getAttribute(MENU_DECLARATION_ATTRIBUTE)).toBe("practice/review");
  });

  it("preserves an existing bind callback before applying identity", () => {
    const element = createElement();
    const existingBind = vi.fn((boundElement: HTMLElement) => {
      expect(boundElement.getAttribute(MENU_MODULE_ATTRIBUTE)).toBeNull();
      boundElement.setAttribute("data-existing-bind", "kept");
    });
    const item: IMenu = { label: "Practice", bind: existingBind };

    bindMenuIdentity(item, {
      plugin: "siyuan-damophus",
      module: "questionBank",
      declaration: "practice",
    }).bind?.(element);

    expect(existingBind).toHaveBeenCalledWith(element);
    expect(element.getAttribute("data-existing-bind")).toBe("kept");
    expect(element.getAttribute(MENU_DECLARATION_ATTRIBUTE)).toBe("practice");
  });

  it("automatically marks items added through a scoped menu", () => {
    const addItem = vi.fn((item: IMenu) => {
      const element = createElement();
      item.bind?.(element);
      return element;
    });
    const menu = { addItem };
    withMenuIdentity(menu, { plugin: "siyuan-damophus", module: "kramdownExport" }, () => {
      menu.addItem({ label: "Copy Markdown" });
    });
    const item = addItem.mock.calls[0][0];
    const element = createElement();
    item.bind?.(element);
    expect(element.getAttribute(MENU_MODULE_ATTRIBUTE)).toBe("kramdownExport");
  });

  it("wraps menu event listeners and resolves the original listener on unload", () => {
    const listeners = new Map<string, (...args: any[]) => any>();
    const eventBus = {
      on: vi.fn((type: string, listener: (...args: any[]) => any) => listeners.set(type, listener)),
      off: vi.fn(),
    };
    const handler = vi.fn((event: CustomEvent<{ menu: { addItem: (item: IMenu) => unknown } }>) => {
      event.detail.menu.addItem({ label: "Numbering" });
    });
    withMenuEventIdentityRegistration(eventBus, { plugin: "siyuan-damophus", module: "listMerge" }, () => {
      eventBus.on("click-blockicon", handler);
    });
    const addItem = vi.fn((item: IMenu) => item);
    listeners.get("click-blockicon")?.({ detail: { menu: { addItem } } });
    const element = createElement();
    addItem.mock.calls[0][0].bind?.(element);
    expect(element.getAttribute(MENU_MODULE_ATTRIBUTE)).toBe("listMerge");

    withMenuEventIdentityRegistration(eventBus, { module: "listMerge" }, () => {
      eventBus.off("click-blockicon", handler);
    });
    expect(eventBus.off).toHaveBeenCalledWith("click-blockicon", listeners.get("click-blockicon"));
  });

  it("identifies third-party menu items from the emitting plugin event bus", () => {
    class EventBus {
      eventTarget: { data: string };
      listener?: (event: { detail: any }) => void;

      constructor(pluginId: string) {
        this.eventTarget = { data: pluginId };
      }

      emit(_type: string, detail?: any) {
        this.listener?.({ detail });
      }
    }
    const damophusBus = new EventBus("siyuan-damophus");
    const thirdPartyBus = new EventBus("third-party-plugin");
    const addItem = vi.fn((item: IMenu) => item);
    thirdPartyBus.listener = (event) => event.detail.menu.addItem({ label: "Third-party action" });

    const uninstall = installPluginMenuIdentityInstrumentation(damophusBus);
    thirdPartyBus.emit("click-blockicon", { menu: { addItem } });

    const element = createElement();
    addItem.mock.calls[0][0].bind?.(element);
    expect(element.getAttribute(MENU_PLUGIN_ATTRIBUTE)).toBe("third-party-plugin");

    uninstall();
    addItem.mockClear();
    thirdPartyBus.emit("click-blockicon", { menu: { addItem } });
    const uninstrumentedElement = createElement();
    addItem.mock.calls[0][0].bind?.(uninstrumentedElement);
    expect(uninstrumentedElement.getAttribute(MENU_PLUGIN_ATTRIBUTE)).toBeNull();
  });

  it("combines automatic plugin identity with a Damophus module identity", () => {
    class EventBus {
      eventTarget = { data: "siyuan-damophus" };
      listener?: (event: { detail: any }) => void;
      emit(_type: string, detail?: any) { this.listener?.({ detail }); }
    }
    const eventBus = new EventBus();
    const addItem = vi.fn((item: IMenu) => item);
    eventBus.listener = (event) => withMenuIdentity(
      event.detail.menu,
      { plugin: "siyuan-damophus", module: "listMerge" },
      () => event.detail.menu.addItem({ label: "Numbering" }),
    );

    const uninstall = installPluginMenuIdentityInstrumentation(eventBus);
    eventBus.emit("click-blockicon", { menu: { addItem } });
    const element = createElement();
    addItem.mock.calls[0][0].bind?.(element);
    expect(element.getAttribute(MENU_PLUGIN_ATTRIBUTE)).toBe("siyuan-damophus");
    expect(element.getAttribute(MENU_MODULE_ATTRIBUTE)).toBe("listMerge");
    uninstall();
  });
});

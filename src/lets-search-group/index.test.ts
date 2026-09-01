import { beforeEach, describe, expect, it, vi } from "vitest";

const eventBus = vi.hoisted(() => {
  const handlers = new Map<string, (event: CustomEvent<unknown>) => void>();
  return {
    handlers,
    on: vi.fn((name: string, handler: (event: CustomEvent<unknown>) => void) => handlers.set(name, handler)),
    off: vi.fn((name: string) => handlers.delete(name)),
  };
});

const openTabMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils", () => ({
  plugin: { app: { appId: "test-app" }, eventBus: { on: eventBus.on, off: eventBus.off } },
}));
vi.mock("siyuan", () => ({ openTab: openTabMock }));

import SearchGroupPlugin from "./index";

const makeDialogNode = (dataKey: string) => ({
  matches: vi.fn((selector: string) => selector.includes(`data-key="${dataKey}"`)),
  getAttribute: vi.fn().mockReturnValue(dataKey),
  querySelector: vi.fn((selector: string) => (selector === "#searchList" ? { id: "searchList" } : null)),
  style: { display: "" },
});

const makeWnd = (left: number) => {
  const element = { getBoundingClientRect: () => ({ left }) };
  const focusedHead = { classList: { contains: (cls: string) => cls === "item--focus" } };
  return {
    element: element as unknown as HTMLElement,
    headersElement: {},
    children: [{ headElement: focusedHead as unknown as HTMLElement }],
    switchTab: vi.fn(),
  };
};

describe("search document grouping", () => {
  beforeEach(() => {
    eventBus.handlers.clear();
    eventBus.on.mockClear();
    eventBus.off.mockClear();
    openTabMock.mockClear();
    vi.unstubAllGlobals();
  });

  it("groups global searches by default and leaves current-document searches opt-in", () => {
    const search = new SearchGroupPlugin();
    const settings: Record<string, unknown> = { globalSearch: true, currentDocumentSearch: false };
    search.getSetting = (key) => settings[key];
    search.onload();
    const handler = eventBus.handlers.get("input-search");
    const controls = { classList: { remove: vi.fn() } };
    const input = {
      closest: vi.fn().mockReturnValue({
        dataset: {},
        querySelector: vi.fn().mockReturnValue({ parentElement: controls }),
      }),
      parentElement: undefined,
    };

    const globalConfig = { idPath: [], group: 0 };
    handler?.({ detail: { config: globalConfig, searchElement: input } } as unknown as CustomEvent<unknown>);
    expect(globalConfig.group).toBe(1);
    expect(controls.classList.remove).toHaveBeenCalledWith("fn__none");

    const documentInput = {
      closest: vi.fn().mockReturnValue({ dataset: { key: "dialog-search" } }),
      parentElement: undefined,
    };
    const documentConfig = { idPath: ["notebook/doc.sy"], group: 0 };
    handler?.({ detail: { config: documentConfig, searchElement: documentInput } } as unknown as CustomEvent<unknown>);
    expect(documentConfig.group).toBe(0);

    search.onunload();
    expect(eventBus.off).toHaveBeenCalledWith("input-search", handler);
  });

  it("recognizes a Ctrl+F dialog even when it has a path filter", () => {
    const search = new SearchGroupPlugin();
    search.getSetting = (key) => key === "currentDocumentSearch";
    search.onload();
    const handler = eventBus.handlers.get("input-search");
    const input = {
      closest: vi.fn().mockReturnValue({
        dataset: { key: "dialog-search" },
        querySelector: vi.fn().mockReturnValue(undefined),
      }),
      parentElement: undefined,
    };
    const config = { idPath: ["notebook/doc.sy"], group: 0 };
    handler?.({ detail: { config, searchElement: input } } as unknown as CustomEvent<unknown>);
    expect(config.group).toBe(1);
    search.onunload();
  });

  it("keeps Ctrl+F grouping rules for document searches converted into tabs", () => {
    const search = new SearchGroupPlugin();
    const settings: Record<string, unknown> = {
      globalSearch: false,
      currentDocumentSearch: true,
      openSearchAsTab: true,
      documentSearchAsTab: true,
    };
    search.getSetting = (key) => settings[key];
    search.onload();

    const node = makeDialogNode("dialog-search");
    const config: { idPath: string[]; group: number; damophusDocSearch?: true } = {
      idPath: ["notebook/doc.sy"],
      group: 0,
    };
    const instance = { element: node, data: config, destroy: vi.fn() };
    const registry = [instance];
    vi.stubGlobal("window", { siyuan: { dialogs: registry } });
    search["convertSearchDialog"](node as unknown as Element);
    expect(openTabMock).toHaveBeenCalledWith({ app: { appId: "test-app" }, search: config });
    expect(instance.destroy).toHaveBeenCalledWith({ focus: "false" });
    expect(node.style.display).toBe("none");
    expect(registry).toHaveLength(0);
    expect(config.damophusDocSearch).toBe(true);

    const handler = eventBus.handlers.get("input-search");
    const input = {
      closest: vi.fn().mockReturnValue(undefined),
      parentElement: undefined,
    };
    handler?.({ detail: { config, searchElement: input } } as unknown as CustomEvent<unknown>);
    expect(config.group).toBe(1);

    search.onunload();
  });

  it("leaves search dialogs untouched while the master switch is off", () => {
    const search = new SearchGroupPlugin();
    search.getSetting = (key) => key === "globalSearchAsTab";
    const node = makeDialogNode("dialog-globalsearch");
    const destroy = vi.fn();
    vi.stubGlobal("window", { siyuan: { dialogs: [{ element: node, data: { k: "" }, destroy }] } });

    search["convertSearchDialog"](node as unknown as Element);
    expect(openTabMock).not.toHaveBeenCalled();
    expect(destroy).not.toHaveBeenCalled();
    expect(node.style.display).toBe("");
  });

  it("honors per-scope switches for global and document searches", () => {
    const search = new SearchGroupPlugin();
    const settings: Record<string, unknown> = {
      openSearchAsTab: true,
      globalSearchAsTab: true,
      documentSearchAsTab: false,
    };
    search.getSetting = (key) => settings[key];

    const globalNode = makeDialogNode("dialog-globalsearch");
    const globalDestroy = vi.fn();
    vi.stubGlobal("window", {
      siyuan: { dialogs: [{ element: globalNode, data: { k: "query" }, destroy: globalDestroy }] },
    });
    search["convertSearchDialog"](globalNode as unknown as Element);
    expect(openTabMock).toHaveBeenCalledTimes(1);
    expect(openTabMock.mock.calls[0][0].search.damophusDocSearch).toBeUndefined();
    expect(globalDestroy).toHaveBeenCalledWith({ focus: "false" });

    const documentNode = makeDialogNode("dialog-search");
    const documentConfig = { idPath: ["notebook/doc.sy"] };
    (window as unknown as { siyuan: { dialogs: unknown[] } }).siyuan.dialogs = [
      { element: documentNode, data: documentConfig, destroy: vi.fn() },
    ];
    search["convertSearchDialog"](documentNode as unknown as Element);
    expect(openTabMock).toHaveBeenCalledTimes(1);

    search.onunload();
  });

  it("ignores dialogs without a search result list or a matching dialog record", () => {
    const search = new SearchGroupPlugin();
    search.getSetting = (key) => key === "openSearchAsTab" || key === "globalSearchAsTab";

    const foreignNode = makeDialogNode("dialog-replace");
    search["convertSearchDialog"](foreignNode as unknown as Element);

    const bareNode = makeDialogNode("dialog-globalsearch");
    bareNode.querySelector = vi.fn().mockReturnValue(null);
    search["convertSearchDialog"](bareNode as unknown as Element);

    const orphanNode = makeDialogNode("dialog-globalsearch");
    vi.stubGlobal("window", { siyuan: { dialogs: [{ element: makeDialogNode("dialog-globalsearch"), data: {} }] } });
    search["convertSearchDialog"](orphanNode as unknown as Element);

    expect(openTabMock).not.toHaveBeenCalled();
  });

  it("opens in the mirrored area when placement is opposite", () => {
    const search = new SearchGroupPlugin();
    const settings: Record<string, unknown> = {
      openSearchAsTab: true,
      globalSearchAsTab: true,
      searchTabPosition: "opposite",
    };
    search.getSetting = (key) => settings[key];
    const config = { idPath: [], group: 0 };

    const leftWnd = makeWnd(0);
    const rightWnd = makeWnd(800);
    vi.stubGlobal("window", {
      siyuan: { layout: { centerLayout: { children: [leftWnd, rightWnd] } } },
      innerWidth: 2000,
    });
    vi.stubGlobal("document", { querySelector: vi.fn(() => leftWnd.element) });

    search["openSearchTab"](config);
    expect(leftWnd.switchTab).not.toHaveBeenCalled();
    expect(rightWnd.switchTab).toHaveBeenCalledWith(rightWnd.children[0].headElement);
    expect(openTabMock).toHaveBeenCalledWith({ app: { appId: "test-app" }, search: config });

    openTabMock.mockClear();
    vi.stubGlobal("document", { querySelector: vi.fn(() => rightWnd.element) });
    search["openSearchTab"](config);
    expect(rightWnd.switchTab).toHaveBeenCalledTimes(1);
    expect(leftWnd.switchTab).toHaveBeenCalledWith(leftWnd.children[0].headElement);
    expect(openTabMock).toHaveBeenCalledWith({ app: { appId: "test-app" }, search: config });
  });

  it("falls back to a right split or current area for opposite placement without a mirrored area", () => {
    const search = new SearchGroupPlugin();
    search.getSetting = (key) => (key === "searchTabPosition" ? "opposite" : undefined);
    const config = { idPath: [], group: 0 };
    const singleWnd = makeWnd(0);

    vi.stubGlobal("window", {
      siyuan: { layout: { centerLayout: { children: [singleWnd] } } },
      innerWidth: 2000,
    });
    vi.stubGlobal("document", { querySelector: vi.fn(() => singleWnd.element) });
    search["openSearchTab"](config);
    expect(openTabMock).toHaveBeenCalledWith({ app: { appId: "test-app" }, search: config, position: "right" });
    expect(singleWnd.switchTab).not.toHaveBeenCalled();

    openTabMock.mockClear();
    vi.stubGlobal("window", {
      siyuan: { layout: { centerLayout: { children: [singleWnd] } } },
      innerWidth: 900,
    });
    search["openSearchTab"](config);
    expect(openTabMock).toHaveBeenCalledWith({ app: { appId: "test-app" }, search: config });
  });
});

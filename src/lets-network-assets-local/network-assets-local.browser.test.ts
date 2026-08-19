import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import NetworkAssetsLocalPlugin from "./index";
import pluginMetadata from "./plugin";
import { networkAssetsLocalTabType } from "./tab-contract";

interface EventBusMock {
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit: (type: string, detail: unknown) => void;
}

function createEventBus(): EventBusMock {
  const listeners = new Map<string, Set<(event: CustomEvent<unknown>) => void>>();
  return {
    on: vi.fn((type: string, listener: (event: CustomEvent<unknown>) => void) => {
      const group = listeners.get(type) ?? new Set();
      group.add(listener);
      listeners.set(type, group);
    }),
    off: vi.fn((type: string, listener: (event: CustomEvent<unknown>) => void) => listeners.get(type)?.delete(listener)),
    emit: (type, detail) => {
      for (const listener of listeners.get(type) ?? []) listener(new CustomEvent(type, { detail }));
    },
  };
}

function createModule(eventBus: EventBusMock, addTab = vi.fn()): NetworkAssetsLocalPlugin {
  setPlugin({ eventBus, addTab });
  const module = new NetworkAssetsLocalPlugin();
  module.getSetting = () => true;
  module.t = (key) => key;
  return module;
}

afterEach(() => {
  document.body.replaceChildren();
  setPlugin(undefined);
});

describe("network assets to local module", () => {
  it("is disabled by default and uses the contextual entry setting", () => {
    expect(pluginMetadata).toMatchObject({ name: "networkAssetsLocal", enabled: false });
    expect(pluginMetadata.settings?.some((setting) => setting.key === "entryContextMenu")).toBe(true);
  });

  it("registers a dedicated Tab model for the conversion preview", () => {
    const eventBus = createEventBus();
    const addTab = vi.fn();
    const module = createModule(eventBus, addTab);
    module.registerModels();

    expect(addTab).toHaveBeenCalledWith(expect.objectContaining({ type: networkAssetsLocalTabType }));
  });

  it("adds the block action only when a selected block contains a remote resource", () => {
    const eventBus = createEventBus();
    const module = createModule(eventBus);
    const addItem = vi.fn();
    const plain = document.createElement("div");
    plain.dataset.nodeId = "plain";
    plain.innerHTML = '<a href="https://example.com/page">page</a>';
    const resource = document.createElement("div");
    resource.dataset.nodeId = "resource";
    resource.innerHTML = '<img src="https://example.com/image.png">';
    module.onload();

    eventBus.emit("click-blockicon", { menu: { addItem }, blockElements: [plain] });
    expect(addItem).not.toHaveBeenCalled();
    eventBus.emit("click-blockicon", { menu: { addItem }, blockElements: [resource] });
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      label: "lets-network-assets-local.blockMenuLabel",
      icon: "iconDownloadAssets",
    }));
    module.onunload();
  });

  it("adds one document-title action for recursive conversion", () => {
    const eventBus = createEventBus();
    const module = createModule(eventBus);
    const addItem = vi.fn();
    module.onload();
    eventBus.emit("click-editortitleicon", { menu: { addItem }, data: { id: "document" } });

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      label: "lets-network-assets-local.documentMenuLabel",
      icon: "iconDownloadAssets",
    }));
    module.onunload();
  });

  it("adds the same recursive action to a single document's file-tree menu", () => {
    const eventBus = createEventBus();
    const module = createModule(eventBus);
    const addItem = vi.fn();
    const documentElement = document.createElement("div");
    documentElement.dataset.nodeId = "document";
    module.onload();
    eventBus.emit("open-menu-doctree", { menu: { addItem }, elements: [documentElement], type: "doc" });

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      label: "lets-network-assets-local.documentMenuLabel",
      icon: "iconDownloadAssets",
    }));
    module.onunload();
  });

  it("does not add a recursive document action to notebook or multi-document menus", () => {
    const eventBus = createEventBus();
    const module = createModule(eventBus);
    const addItem = vi.fn();
    const first = document.createElement("div");
    first.dataset.nodeId = "first";
    const second = document.createElement("div");
    second.dataset.nodeId = "second";
    module.onload();
    eventBus.emit("open-menu-doctree", { menu: { addItem }, elements: [first], type: "notebook" });
    eventBus.emit("open-menu-doctree", { menu: { addItem }, elements: [first, second], type: "docs" });

    expect(addItem).not.toHaveBeenCalled();
    module.onunload();
  });
});

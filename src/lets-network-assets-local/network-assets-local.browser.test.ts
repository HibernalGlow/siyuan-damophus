import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import NetworkAssetsLocalPlugin from "./index";
import pluginMetadata from "./plugin";

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

function createModule(eventBus: EventBusMock): NetworkAssetsLocalPlugin {
  setPlugin({ eventBus });
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
});

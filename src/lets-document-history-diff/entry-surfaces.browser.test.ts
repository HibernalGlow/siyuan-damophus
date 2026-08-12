import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import DocumentHistoryDiffPlugin from "./index";

interface EventBusMock {
  listeners: Map<string, Set<(event: CustomEvent<unknown>) => void>>;
  on: ReturnType<typeof vi.fn>;
  off: ReturnType<typeof vi.fn>;
  emit(type: string, detail: unknown): void;
}

function createEventBus(): EventBusMock {
  const listeners = new Map<string, Set<(event: CustomEvent<unknown>) => void>>();
  return {
    listeners,
    on: vi.fn((type: string, listener: (event: CustomEvent<unknown>) => void) => {
      const handlers = listeners.get(type) ?? new Set();
      handlers.add(listener);
      listeners.set(type, handlers);
    }),
    off: vi.fn((type: string, listener: (event: CustomEvent<unknown>) => void) => {
      listeners.get(type)?.delete(listener);
    }),
    emit(type, detail) {
      for (const listener of listeners.get(type) ?? []) {
        listener(new CustomEvent(type, { detail }));
      }
    },
  };
}

function createModule(settings: Record<string, unknown>) {
  const eventBus = createEventBus();
  const commands: unknown[] = [];
  setPlugin({
    name: "siyuan-damophus",
    i18n: {
      "lets-document-history-diff.open": "对比文档历史",
      "lets-document-history-diff.openBlock": "对比块历史",
      "lets-document-history-diff.commandOpen": "对比文档历史",
    },
    eventBus,
    commands,
    addCommand: vi.fn((command: unknown) => commands.push(command)),
    addDock: vi.fn(),
  });
  const module = new DocumentHistoryDiffPlugin();
  module.getSetting = (key) => settings[key];
  module.onload();
  return { eventBus, module };
}

function emitBlockMenu(eventBus: EventBusMock, addItem: ReturnType<typeof vi.fn>): void {
  const block = document.createElement("div");
  block.dataset.nodeId = "20260813120000-block";
  block.textContent = "当前块";
  eventBus.emit("click-blockicon", {
    menu: { addItem },
    blockElements: [block],
    protyle: {
      block: { rootID: "20260813115900-document" },
      lute: { BlockDOM2StdMd: vi.fn() },
    },
  });
}

afterEach(() => setPlugin(undefined));

describe("document history entry surfaces", () => {
  it("shows block history when context menus are enabled and the Damophus menu is disabled", () => {
    const { eventBus, module } = createModule({
      entryMenu: false,
      entryContextMenu: true,
      entryCommand: false,
    });
    const contextAddItem = vi.fn();
    const damophusAddItem = vi.fn();

    emitBlockMenu(eventBus, contextAddItem);
    module.addMenuItem({ addItem: damophusAddItem } as never);

    expect(contextAddItem).toHaveBeenCalledWith(expect.objectContaining({ label: "对比块历史" }));
    expect(damophusAddItem).not.toHaveBeenCalled();
    module.onunload();
  });

  it("shows the Damophus item without leaking block history into context menus", () => {
    const { eventBus, module } = createModule({
      entryMenu: true,
      entryContextMenu: false,
      entryCommand: false,
    });
    const contextAddItem = vi.fn();
    const damophusAddItem = vi.fn();

    emitBlockMenu(eventBus, contextAddItem);
    module.addMenuItem({ addItem: damophusAddItem } as never);

    expect(contextAddItem).not.toHaveBeenCalled();
    expect(damophusAddItem).toHaveBeenCalledWith(expect.objectContaining({ label: "对比文档历史" }));
    module.onunload();
  });
});

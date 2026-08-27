import { afterEach, describe, expect, it, vi } from "vitest";
import { setPlugin } from "@/utils";
import DocumentFormatPlugin from "./index";

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

afterEach(() => setPlugin(undefined));

describe("document format document-tree menu", () => {
  it("adds the empty text block cleanup to a single document menu", () => {
    const eventBus = createEventBus();
    setPlugin({ eventBus });
    const module = new DocumentFormatPlugin();
    module.getSetting = (key) => key === "entryCommand" ? false : true;
    module.t = (key) => key;
    const addItem = vi.fn();
    const documentElement = document.createElement("div");
    documentElement.dataset.nodeId = "document";

    module.onload();
    eventBus.emit("open-menu-doctree", { menu: { addItem }, elements: [documentElement], type: "doc" });

    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      label: "lets-document-format.removeEmptyParagraphs",
      icon: "iconSparkles",
    }));
    module.onunload();
  });
});

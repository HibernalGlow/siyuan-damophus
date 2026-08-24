import { beforeEach, describe, expect, it, vi } from "vitest";

const eventBus = vi.hoisted(() => {
  const handlers = new Map<string, (event: CustomEvent<unknown>) => void>();
  return {
    handlers,
    on: vi.fn((name: string, handler: (event: CustomEvent<unknown>) => void) => handlers.set(name, handler)),
    off: vi.fn((name: string) => handlers.delete(name)),
  };
});

vi.mock("@/utils", () => ({ plugin: { eventBus: { on: eventBus.on, off: eventBus.off } } }));

import SearchGroupPlugin from "./index";

describe("search document grouping", () => {
  beforeEach(() => {
    eventBus.handlers.clear();
    eventBus.on.mockClear();
    eventBus.off.mockClear();
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
});

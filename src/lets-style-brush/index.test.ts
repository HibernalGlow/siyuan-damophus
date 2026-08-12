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
vi.mock("@/api", () => ({ getBlockBreadcrumb: vi.fn(), getHeadingChildrenIDs: vi.fn() }));
vi.mock("siyuan", () => ({ Dialog: class {}, showMessage: vi.fn() }));

import StyleBrushPlugin from "./index";

describe("same-text format painter integration", () => {
  beforeEach(() => {
    eventBus.handlers.clear();
    eventBus.on.mockClear();
    eventBus.off.mockClear();
  });

  it("adds scope actions only for a nonempty text selection", () => {
    const styleBrush = new StyleBrushPlugin();
    styleBrush.getSetting = () => true;
    styleBrush.t = (key) => key;
    styleBrush.onload();
    const addItem = vi.fn();
    const handler = eventBus.handlers.get("open-menu-content");
    handler?.({
      detail: {
        menu: { addItem },
        protyle: {},
        range: { toString: () => "same text", cloneRange: () => ({}) },
      },
    } as unknown as CustomEvent<unknown>);
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      icon: "iconSelectText",
      label: "lets-style-brush.menuLabel",
      submenu: expect.any(Array),
    }));
    styleBrush.onunload();
    expect(eventBus.off).toHaveBeenCalledWith("open-menu-content", handler);
  });

  it("adds one floating-toolbar action without duplicating it", () => {
    const styleBrush = new StyleBrushPlugin();
    styleBrush.t = (key) => key;
    const first = styleBrush.updateProtyleToolbar([]);
    expect(first).toContainEqual(expect.objectContaining({
      name: "damophus-same-text-painter",
      icon: "iconSelectText",
    }));
    expect(styleBrush.updateProtyleToolbar(first)).toBe(first);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const eventBus = vi.hoisted(() => {
  const handlers = new Map<string, (event: CustomEvent<unknown>) => void>();
  return {
    handlers,
    on: vi.fn((name: string, handler: (event: CustomEvent<unknown>) => void) => {
      handlers.set(name, handler);
    }),
    off: vi.fn((name: string) => {
      handlers.delete(name);
    }),
  };
});

vi.mock("@/utils", () => ({
  plugin: {
    eventBus: {
      on: eventBus.on,
      off: eventBus.off,
    },
  },
}));

vi.mock("@/api", () => ({
  batchSetBlockAttrsStrict: vi.fn(),
  getBlockAttrsStrict: vi.fn(),
  getBlockBreadcrumb: vi.fn(),
  getHeadingChildrenIDs: vi.fn(),
  sqlStrict: vi.fn(),
}));

vi.mock("siyuan", () => ({
  Dialog: class {},
  showMessage: vi.fn(),
}));

import StyleBrushPlugin from "./index";

describe("style brush menu integration", () => {
  beforeEach(() => {
    eventBus.handlers.clear();
    eventBus.on.mockClear();
    eventBus.off.mockClear();
  });

  it("adds the style brush to a selected text content menu using its block element", () => {
    const styleBrush = new StyleBrushPlugin();
    styleBrush.getSetting = () => true;
    styleBrush.t = (key) => key;
    styleBrush.onload();

    const addItem = vi.fn();
    const editor = {} as HTMLElement;
    const handler = eventBus.handlers.get("open-menu-content");
    expect(handler).toBeTypeOf("function");

    handler?.({
      detail: {
        element: { dataset: { nodeId: "20260812001000-aaaaaaa" } },
        menu: { addItem },
        protyle: {
          block: { rootID: "20260812000000-bbbbbbb" },
          wysiwyg: { element: editor },
        },
        range: {},
      },
    } as unknown as CustomEvent<unknown>);

    expect(addItem).toHaveBeenCalledOnce();
    expect(addItem).toHaveBeenCalledWith(expect.objectContaining({
      icon: "iconPaintBucket",
      label: "lets-style-brush.menuLabel",
      submenu: expect.any(Array),
    }));

    styleBrush.onunload();
    expect(eventBus.off).toHaveBeenCalledWith("open-menu-content", handler);
  });
});

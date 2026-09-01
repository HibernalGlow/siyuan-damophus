import { afterEach, describe, expect, it } from "vitest";
import { collectDockItems } from "./dock-items";

afterEach(() => {
  delete (window as { siyuan?: unknown }).siyuan;
});

describe("collectDockItems", () => {
  it("lists dock buttons from the workspace layout with localized labels", () => {
    window.siyuan = {
      languages: { outline: "大纲" },
      config: {
        uiLayout: {
          left: { data: [[{ type: "file" }, { type: "outline" }]] },
          right: { data: [[{ type: "backlink" }, { type: "damophus-custom", title: "自定义面板" }]] },
        },
      },
    } as unknown as typeof window.siyuan;

    expect(collectDockItems(window.siyuan)).toEqual([
      { type: "file", label: "file", position: "Left" },
      { type: "outline", label: "大纲", position: "Left" },
      { type: "backlink", label: "backlink", position: "Right" },
      { type: "damophus-custom", label: "自定义面板", position: "Right" },
    ]);
  });

  it("deduplicates a type that appears in several groups and tolerates a missing layout", () => {
    window.siyuan = {
      config: {
        uiLayout: {
          left: { data: [[{ type: "outline" }], [{ type: "outline" }, { type: "" }]] },
          bottom: { data: [[{ type: "graph" }]] },
        },
      },
    } as unknown as typeof window.siyuan;

    const items = collectDockItems(window.siyuan);
    expect(items.map((item) => `${item.type}:${item.position}`)).toEqual([
      "outline:Left",
      "graph:Bottom",
    ]);

    expect(collectDockItems(undefined)).toEqual([]);
    expect(collectDockItems({} as typeof window.siyuan)).toEqual([]);
  });
});

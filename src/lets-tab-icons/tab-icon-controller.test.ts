import { describe, expect, it, vi } from "vitest";
import { getTabRootId, isDescendantHPath, normalizeHPath, TabIconController } from "./tab-icon-controller";

describe("tab icon controller", () => {
  function fakeHeadElement() {
    const attributes = new Map<string, string>();
    const dataset = {} as DOMStringMap;
    return {
      dataset,
      classList: { add: vi.fn() },
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
        if (name.startsWith("data-")) (dataset as Record<string, string>)[name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())] = value;
      },
      removeAttribute: (name: string) => {
        attributes.delete(name);
        if (name.startsWith("data-")) delete (dataset as Record<string, string>)[name.slice(5).replace(/-([a-z])/gu, (_, letter) => letter.toUpperCase())];
      },
    } as unknown as HTMLElement;
  }

  it("normalizes hierarchy paths and matches descendants only", () => {
    expect(normalizeHPath(" Notebook\\Topic/ ")).toBe("/Notebook/Topic");
    expect(isDescendantHPath("/Notebook/Topic", "/Notebook/Topic/Child")).toBe(true);
    expect(isDescendantHPath("/Notebook/Topic", "/Notebook/Topic")).toBe(false);
    expect(isDescendantHPath("/Notebook/Topic", "/Notebook/Topics/Child")).toBe(false);
  });

  it("reads root ids from loaded editors and restored tab metadata", () => {
    expect(getTabRootId({ model: { editor: { protyle: { block: { rootID: "editor-root" } } } } })).toBe("editor-root");
    const headElement = fakeHeadElement();
    headElement.setAttribute("data-initdata", JSON.stringify({ rootId: "restored-root" }));
    expect(getTabRootId({ headElement })).toBe("restored-root");
  });

  it("applies the icon to matching tabs and restores it after pin/unload", async () => {
    const setDocIcon = vi.fn(function (this: { docIcon: string }, icon: string) { this.docIcon = icon; });
    const headElement = fakeHeadElement();
    const tab = {
      docIcon: "",
      model: { editor: { protyle: { block: { rootID: "child" } } } },
      headElement,
      setDocIcon,
    } as any;
    const controller = new TabIconController(() => [tab], async () => "/Notebook/Topic/Child");
    controller.updateOptions({ parentPath: "/Notebook/Topic", icon: "\u{1F516}" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tab.docIcon).toBe("\u{1F516}");
    expect(headElement.dataset.damophusTabIcon).toBe("\u{1F516}");
    tab.headElement.classList.add("item--pin");
    await controller.sync();
    expect(tab.docIcon).toBe("🔖");
    controller.destroy();
    expect(tab.docIcon).toBe("");
    expect(headElement.dataset.damophusTabIcon).toBeUndefined();
  });

  it("does not replace an existing document icon", async () => {
    const tab = {
      docIcon: "existing",
      model: { editor: { protyle: { block: { rootID: "child" } } } },
      headElement: fakeHeadElement(),
      setDocIcon: vi.fn(),
    } as any;
    const controller = new TabIconController(() => [tab], async () => "/Notebook/Topic/Child");
    controller.updateOptions({ parentPath: "/Notebook/Topic", icon: "\u{1F516}" });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(tab.docIcon).toBe("existing");
    expect(tab.setDocIcon).not.toHaveBeenCalled();
  });
});

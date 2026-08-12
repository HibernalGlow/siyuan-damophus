import { describe, expect, it, vi } from "vitest";
import type { IMenu } from "siyuan";
import {
  bindMenuIdentity,
  markMenuIdentity,
  MENU_DECLARATION_ATTRIBUTE,
  MENU_MODULE_ATTRIBUTE,
  MENU_PLUGIN_ATTRIBUTE,
} from "./menu-identity";

function createElement(): HTMLElement {
  const attributes = new Map<string, string>();
  return {
    getAttribute: (name: string) => attributes.get(name) ?? null,
    setAttribute: (name: string, value: string) => {
      attributes.set(name, value);
    },
  } as unknown as HTMLElement;
}

describe("menu identity", () => {
  it("marks plugin, module, and joined declaration identities", () => {
    const element = createElement();
    markMenuIdentity(element, {
      plugin: "siyuan-damophus",
      module: "questionBank",
      declaration: ["practice", "review"],
    });

    expect(element.getAttribute(MENU_PLUGIN_ATTRIBUTE)).toBe("siyuan-damophus");
    expect(element.getAttribute(MENU_MODULE_ATTRIBUTE)).toBe("questionBank");
    expect(element.getAttribute(MENU_DECLARATION_ATTRIBUTE)).toBe("practice/review");
  });

  it("preserves an existing bind callback before applying identity", () => {
    const element = createElement();
    const existingBind = vi.fn((boundElement: HTMLElement) => {
      expect(boundElement.getAttribute(MENU_MODULE_ATTRIBUTE)).toBeNull();
      boundElement.setAttribute("data-existing-bind", "kept");
    });
    const item: IMenu = { label: "Practice", bind: existingBind };

    bindMenuIdentity(item, {
      plugin: "siyuan-damophus",
      module: "questionBank",
      declaration: "practice",
    }).bind?.(element);

    expect(existingBind).toHaveBeenCalledWith(element);
    expect(element.getAttribute("data-existing-bind")).toBe("kept");
    expect(element.getAttribute(MENU_DECLARATION_ATTRIBUTE)).toBe("practice");
  });
});

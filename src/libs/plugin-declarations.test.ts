import { describe, expect, it, vi } from "vitest";
import {
  buildPluginDeclarationMenu,
  collectPluginSettings,
  resolvePluginDeclarations,
} from "./plugin-declarations";
import type { PluginMetadata } from "@/types/plugin";
import {
  MENU_DECLARATION_ATTRIBUTE,
  MENU_MODULE_ATTRIBUTE,
  MENU_PLUGIN_ATTRIBUTE,
} from "./menu-identity";

const metadata: PluginMetadata = {
  name: "deep",
  displayName: "Deep",
  settings: [{ type: "textinput", key: "root", title: "Root", value: "root" }],
  declarations: [{
    id: "one",
    title: "One",
    children: [{
      id: "two",
      title: "Two",
      children: [{
        id: "three",
        title: "Three",
        settings: [{ type: "checkbox", key: "enabled", title: "Enabled", value: false, menu: true }],
      }],
    }],
  }],
};

describe("plugin declarations", () => {
  it("resolves and collects settings at arbitrary declaration depth", () => {
    const declarations = resolvePluginDeclarations(metadata.declarations);
    expect(declarations[0].children[0].children[0].path).toEqual(["one", "two", "three"]);
    expect(collectPluginSettings(metadata).map((setting) => setting.key)).toEqual(["root", "enabled"]);
  });

  it("builds a recursive checked menu and delegates one persisted toggle", async () => {
    const toggle = vi.fn();
    const items = buildPluginDeclarationMenu(metadata, {
      readSetting: () => true,
      translate: (key) => key,
      toggle,
    });
    const leaf = items[0].submenu?.[0].submenu?.[0].submenu?.[0];
    expect(leaf).toMatchObject({ label: "Enabled", checked: true });
    await leaf?.click?.({} as HTMLElement, {} as MouseEvent);
    expect(toggle).toHaveBeenCalledWith(expect.objectContaining({ key: "enabled" }), false);
  });

  it("marks every declaration menu with its plugin, module, and full declaration path", () => {
    const items = buildPluginDeclarationMenu(metadata, {
      readSetting: () => true,
      translate: (key) => key,
      toggle: vi.fn(),
    });
    const attributes = new Map<string, string>();
    const element = {
      setAttribute: (name: string, value: string) => {
        attributes.set(name, value);
      },
    } as unknown as HTMLElement;
    const nested = items[0].submenu?.[0].submenu?.[0];

    nested?.bind?.(element);

    expect(attributes.get(MENU_PLUGIN_ATTRIBUTE)).toBe("siyuan-damophus");
    expect(attributes.get(MENU_MODULE_ATTRIBUTE)).toBe("deep");
    expect(attributes.get(MENU_DECLARATION_ATTRIBUTE)).toBe("deep/one/two/three");
  });
});

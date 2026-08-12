import type { IMenu } from "siyuan";
import type {
  PluginDeclaration,
  PluginMetadata,
  PluginSettingItem,
} from "@/types/plugin";
import { resolveSiyuanPluginIcon } from "./plugin-icons";

export interface ResolvedPluginDeclaration extends PluginDeclaration {
  path: string[];
  settings: PluginSettingItem[];
  children: ResolvedPluginDeclaration[];
}

export function resolvePluginDeclarations(
  declarations: readonly PluginDeclaration[] = [],
  parentPath: readonly string[] = [],
): ResolvedPluginDeclaration[] {
  return declarations.map((declaration) => {
    const path = [...parentPath, declaration.id];
    return {
      ...declaration,
      path,
      settings: [...(declaration.settings ?? [])],
      children: resolvePluginDeclarations(declaration.children, path),
    };
  });
}

export function collectPluginSettings(metadata: PluginMetadata): PluginSettingItem[] {
  const settings = [...(metadata.settings ?? [])];
  const visit = (declarations: readonly PluginDeclaration[]) => {
    for (const declaration of declarations) {
      settings.push(...(declaration.settings ?? []));
      visit(declaration.children ?? []);
    }
  };
  visit(metadata.declarations ?? []);
  return settings;
}

export interface DeclarationMenuOptions {
  readSetting: (key: string, fallback: unknown) => unknown;
  translate: (key: string) => string;
  toggle: (setting: PluginSettingItem, enabled: boolean) => void | Promise<void>;
}

function declarationMenuItems(
  declarations: readonly ResolvedPluginDeclaration[],
  options: DeclarationMenuOptions,
): IMenu[] {
  return declarations.flatMap((declaration) => {
    const ownItems = declaration.settings.flatMap((setting): IMenu[] => {
      if (!setting.menu || setting.type !== "checkbox") return [];
      const enabled = Boolean(options.readSetting(setting.key, setting.value));
      return [{
        label: options.translate(setting.title),
        checked: enabled,
        click: () => options.toggle(setting, !enabled),
      }];
    });
    const childItems = declarationMenuItems(declaration.children, options);
    const submenu = [...ownItems, ...childItems];
    if (submenu.length === 0) return [];
    return [{
      icon: declaration.icon ? resolveSiyuanPluginIcon(declaration.icon) : undefined,
      label: options.translate(declaration.title),
      submenu,
    }];
  });
}

export function buildPluginDeclarationMenu(
  metadata: PluginMetadata,
  options: DeclarationMenuOptions,
): IMenu[] {
  return declarationMenuItems(resolvePluginDeclarations(metadata.declarations), options);
}

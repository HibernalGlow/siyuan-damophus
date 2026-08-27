import type { PluginSettingItem } from "@/types/plugin";

export type PluginEntrySurface =
  | "menu"
  | "contextMenu"
  | "dock"
  | "desktopDock"
  | "mobileDock"
  | "command"
  | "tab";
export type ConfigurableEntrySurface = Exclude<PluginEntrySurface, "dock">;

export interface EntrySettingsOptions {
  central?: boolean;
}

const ENTRY_SETTING_KEYS: Record<PluginEntrySurface, string> = {
  menu: "entryMenu",
  contextMenu: "entryContextMenu",
  dock: "entryDock",
  desktopDock: "entryDesktopDock",
  mobileDock: "entryMobileDock",
  command: "entryCommand",
  tab: "entryTab",
};

export function entrySettingKey(surface: PluginEntrySurface): string {
  return ENTRY_SETTING_KEYS[surface];
}

export function isMobileEntryFrontend(): boolean {
  if (typeof document === "undefined") return false;
  const frontend = document.documentElement?.dataset?.frontend;
  return frontend === "mobile" || frontend === "browser-mobile";
}

export function createEntrySettings(
  surfaces: Partial<Record<PluginEntrySurface, boolean>>,
  options: EntrySettingsOptions = {},
): PluginSettingItem[] {
  return (Object.entries(surfaces) as Array<[PluginEntrySurface, boolean]>).flatMap(([surface, value]) => {
    const configuredSurfaces = surface === "dock" ? ["desktopDock", "mobileDock"] as const : [surface];
    return configuredSurfaces.map((configuredSurface) => ({
      type: "checkbox" as const,
      title: `settings.entry.${configuredSurface}`,
      description: `settings.entry.${configuredSurface}Description`,
      key: entrySettingKey(configuredSurface),
      value,
      entrySurface: configuredSurface,
      entryManagement: options.central ? "central" as const : undefined,
    }));
  });
}

export function resolveEntrySetting(
  getSetting: (key: string) => unknown,
  surface: PluginEntrySurface,
  fallback = true,
): boolean {
  const value = getSetting(entrySettingKey(surface));
  if (typeof value === "boolean") return value;
  if (surface === "contextMenu") {
    const legacyMenu = getSetting(entrySettingKey("menu"));
    if (typeof legacyMenu === "boolean") return legacyMenu;
  }
  if (surface === "desktopDock") {
    const legacyDock = getSetting(entrySettingKey("dock"));
    if (typeof legacyDock === "boolean") return legacyDock;
  }
  return fallback;
}

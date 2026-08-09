import type { PluginSettingItem } from "@/types/plugin";

export type PluginEntrySurface = "menu" | "dock" | "command" | "tab";

const ENTRY_SETTING_KEYS: Record<PluginEntrySurface, string> = {
  menu: "entryMenu",
  dock: "entryDock",
  command: "entryCommand",
  tab: "entryTab",
};

export function entrySettingKey(surface: PluginEntrySurface): string {
  return ENTRY_SETTING_KEYS[surface];
}

export function createEntrySettings(
  surfaces: Partial<Record<PluginEntrySurface, boolean>>,
): PluginSettingItem[] {
  return (Object.entries(surfaces) as Array<[PluginEntrySurface, boolean]>).map(([surface, value]) => ({
    type: "checkbox",
    title: `settings.entry.${surface}`,
    description: `settings.entry.${surface}Description`,
    key: entrySettingKey(surface),
    value,
  }));
}

export function resolveEntrySetting(
  getSetting: (key: string) => unknown,
  surface: PluginEntrySurface,
  fallback = true,
): boolean {
  const value = getSetting(entrySettingKey(surface));
  return typeof value === "boolean" ? value : fallback;
}

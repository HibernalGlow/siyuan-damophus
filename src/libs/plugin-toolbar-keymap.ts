import type { ProtyleToolbarItem } from "@/types/plugin";

interface KeymapEntry {
  custom: string;
  default: string;
}

interface PluginKeymap {
  plugin?: Record<string, Record<string, KeymapEntry>>;
}

/**
 * SiYuan discovers toolbar shortcuts in the Plugin base constructor. Damophus
 * discovers sub-plugin toolbar items later, so register those entries when the
 * aggregated toolbar is actually available.
 */
export function syncPluginToolbarKeymap(
  keymap: PluginKeymap,
  pluginName: string | undefined,
  toolbar: Array<string | ProtyleToolbarItem>,
): void {
  if (!pluginName) return;
  keymap.plugin ??= {};
  const entries = keymap.plugin[pluginName] ??= {};

  for (const item of toolbar) {
    if (typeof item === "string") continue;
    const hotkey = typeof item.hotkey === "string" ? item.hotkey : "";
    item.hotkey = hotkey;
    const current = entries[item.name];
    if (!current) {
      entries[item.name] = { custom: hotkey, default: hotkey };
      continue;
    }
    current.default = hotkey;
    if (typeof current.custom !== "string") current.custom = hotkey;
  }
}

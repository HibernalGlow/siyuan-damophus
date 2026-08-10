export const pluginIconNames = ["brain"] as const;

export type PluginIconName = typeof pluginIconNames[number];

const SIYUAN_PLUGIN_ICONS: Record<PluginIconName, string> = {
  brain: "iconBrain",
};

export function resolveSiyuanPluginIcon(icon: PluginIconName): string {
  return SIYUAN_PLUGIN_ICONS[icon];
}

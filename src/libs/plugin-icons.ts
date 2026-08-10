export const pluginIconNames = [
  "bookOpenCheck",
  "bot",
  "brain",
  "fileOutput",
  "film",
  "glassWater",
  "imagePlay",
  "listTree",
  "network",
  "panelRight",
  "power",
  "settings",
  "smartphone",
  "sparkles",
  "sunMoon",
  "tags",
  "waypoints",
] as const;

export type PluginIconName = typeof pluginIconNames[number];

const SIYUAN_PLUGIN_ICONS: Partial<Record<PluginIconName, string>> = {
  brain: "iconBrain",
  tags: "iconTags",
};

const FALLBACK_PLUGIN_ICONS: Record<string, PluginIconName> = {
  agentSurface: "sparkles",
};

export function resolveSiyuanPluginIcon(icon: PluginIconName): string {
  return SIYUAN_PLUGIN_ICONS[icon] ?? "iconPlugin";
}

export function resolvePluginIconName(
  pluginName: string,
  configuredIcon?: PluginIconName,
): PluginIconName {
  return configuredIcon ?? FALLBACK_PLUGIN_ICONS[pluginName] ?? "film";
}

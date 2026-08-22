export const pluginIconNames = [
  "bookA",
  "bookOpenCheck",
  "bot",
  "boxes",
  "brain",
  "cloudCog",
  "database",
  "fileOutput",
  "film",
  "glassWater",
  "globe2",
  "graduationCap",
  "gripVertical",
  "highlighter",
  "image",
  "imagePlay",
  "images",
  "layoutGrid",
  "layers",
  "listTree",
  "messageSquareText",
  "move",
  "network",
  "paintbrush",
  "palette",
  "panelRight",
  "plug",
  "power",
  "settings",
  "smartphone",
  "sparkles",
  "sunMoon",
  "tableProperties",
  "tags",
  "textSelect",
  "waypoints",
  "workflow",
] as const;

export type PluginIconName = typeof pluginIconNames[number];

export const settingGroupIcons = {
  switch: "power",
  entry: "waypoints",
  general: "settings",
} as const satisfies Record<string, PluginIconName>;

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

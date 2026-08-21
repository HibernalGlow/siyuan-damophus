import type { PluginIconName } from "@/libs/plugin-icons";

export type SettingCategoryId = "core" | "study" | "workflow" | "appearance" | "integrations" | "other";

export interface SettingCategoryDefinition {
  id: SettingCategoryId;
  label: string;
  description: string;
  icon: PluginIconName;
  modules: string[];
}

/** Keep this order intentional: it matches the way a user usually configures Damophus. */
export const SETTING_CATEGORY_DEFINITIONS: SettingCategoryDefinition[] = [
  {
    id: "core",
    label: "settings.category.core",
    description: "settings.category.coreDescription",
    icon: "layoutGrid",
    modules: [],
  },
  {
    id: "study",
    label: "settings.category.study",
    description: "settings.category.studyDescription",
    icon: "graduationCap",
    modules: ["questionBank", "exerciseFocus", "quickAttr", "topicDictionary", "topicRelations", "selectionHighlight", "tableFit"],
  },
  {
    id: "workflow",
    label: "settings.category.workflow",
    description: "settings.category.workflowDescription",
    icon: "workflow",
    modules: [
      "kramdownExport",
      "listMerge",
      "legacyBlockSelection",
      "styleBrush",
      "calloutTools",
      "expandedPluginMenu",
      "blockDragPerformance",
      "layoutActions",
      // "imageConverter", // Parked until a small, reliable encoder is available.
    ],
  },
  {
    id: "appearance",
    label: "settings.category.appearance",
    description: "settings.category.appearanceDescription",
    icon: "palette",
    modules: ["mobileAppearance", "mobileBreadcrumb", "mobileTitlePath", "mobileOutlineTheme", "mobileLiquidGlass", "animatedImageReplay", "calloutAppearance", "appearanceTweaks", "snippetAudit"],
  },
  {
    id: "integrations",
    label: "settings.category.integrations",
    description: "settings.category.integrationsDescription",
    icon: "plug",
    modules: ["agentBridge", "agentSurface", "aiConfigSync", "skillManager", "remoteAccess"],
  },
  {
    id: "other",
    label: "settings.category.other",
    description: "settings.category.otherDescription",
    icon: "boxes",
    modules: [],
  },
];

export function getSettingCategory(pluginName: string): SettingCategoryId {
  return SETTING_CATEGORY_DEFINITIONS.find((category) => category.modules.includes(pluginName))?.id ?? "other";
}

export function buildSettingCategoryGroups<T extends { key: string }>(
  items: T[],
  coreGroups: string[],
): Array<SettingCategoryDefinition & { groups: string[] }> {
  const groupsByCategory = new Map<SettingCategoryId, string[]>([
    ["core", coreGroups],
    ["study", []],
    ["workflow", []],
    ["appearance", []],
    ["integrations", []],
    ["other", []],
  ]);

  for (const item of items) {
    const category = getSettingCategory(item.key);
    groupsByCategory.get(category)?.push(item.key);
  }

  return SETTING_CATEGORY_DEFINITIONS
    .map((definition) => ({ ...definition, groups: groupsByCategory.get(definition.id) ?? [] }))
    .filter((definition) => definition.groups.length > 0);
}

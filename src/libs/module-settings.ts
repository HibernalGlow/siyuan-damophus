import type { PluginIconName } from "./plugin-icons";
import { resolvePluginIconName } from "./plugin-icons";
import type { ConfigurableEntrySurface } from "./plugin-entry-settings";
import type { PluginMetadata, PluginSettingItem } from "@/types/plugin";
import { collectPluginDeclarationSettings, collectPluginSettings } from "./plugin-declarations";

export const MODULE_ENABLED_SETTING_KEY = "enabled";

export interface ResolvedPluginSettingItem extends PluginSettingItem {
  value: unknown;
  icon?: PluginIconName;
  hasSetting?: boolean;
}

export interface ModuleSettingsModel {
  switches: ResolvedPluginSettingItem[];
  groups: Record<string, ResolvedPluginSettingItem[]>;
  entries: ManagedEntryModule[];
}

export interface ManagedEntryModule {
  pluginName: string;
  group: string;
  title: string;
  description: string;
  icon: PluginIconName;
  enabled: boolean;
  surfaces: Partial<Record<ConfigurableEntrySurface, ResolvedPluginSettingItem>>;
  leafSwitches: ResolvedPluginSettingItem[];
}

export function buildModuleSettings(
  pluginConfigs: PluginMetadata[],
  readSetting: (pluginName: string, key: string, fallback: unknown) => unknown,
): ModuleSettingsModel {
  const switches: ResolvedPluginSettingItem[] = [];
  const groups: Record<string, ResolvedPluginSettingItem[]> = {};
  const entries: ManagedEntryModule[] = [];

  for (const pluginMeta of pluginConfigs) {
    const enabled = Boolean(readSetting(
      pluginMeta.name,
      MODULE_ENABLED_SETTING_KEY,
      pluginMeta.enabled ?? false,
    ));
    const icon = resolvePluginIconName(pluginMeta.name, pluginMeta.icon);

    switches.push({
      type: "checkbox",
      title: pluginMeta.displayName || pluginMeta.name,
      description: pluginMeta.description || "",
      key: pluginMeta.name,
      value: enabled,
      icon,
      hasSetting: true,
    });

    const resolvedSettings = collectPluginSettings(pluginMeta).map((item) => ({
      ...item,
      value: readSetting(pluginMeta.name, item.key, item.value),
    }));
    const managedEntrySettings = resolvedSettings.filter(
      (item) => item.entryManagement === "central" && item.entrySurface,
    );
    const leafSwitches = collectPluginDeclarationSettings(pluginMeta)
      .map((item) => ({
        ...item,
        value: readSetting(pluginMeta.name, item.key, item.value),
      }))
      .filter((item) => item.type === "checkbox" && item.menu === true);

    groups[pluginMeta.displayName] = [
      {
        type: "checkbox",
        title: "settings.moduleEnabled",
        description: "settings.moduleEnabledDescription",
        key: MODULE_ENABLED_SETTING_KEY,
        value: enabled,
        icon,
      },
      ...resolvedSettings.filter((item) => item.entryManagement !== "central"),
    ];

    if (managedEntrySettings.length > 0 || leafSwitches.length > 0) {
      entries.push({
        pluginName: pluginMeta.name,
        group: pluginMeta.displayName,
        title: pluginMeta.displayName || pluginMeta.name,
        description: pluginMeta.description || "",
        icon,
        enabled,
        surfaces: Object.fromEntries(managedEntrySettings.map((item) => [item.entrySurface, item])),
        leafSwitches,
      });
    }
  }

  return { switches, groups, entries };
}

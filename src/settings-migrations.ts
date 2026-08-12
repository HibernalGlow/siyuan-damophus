import type { PluginMetadata } from "@/types/plugin";

export function migrateLegacyModuleSettings(
  config: Record<string, unknown>,
  pluginConfigs: PluginMetadata[],
): boolean {
  let changed = false;

  for (const pluginConfig of pluginConfigs) {
    const legacyKey = pluginConfig.legacyEnabledSetting;
    if (!legacyKey || typeof config[legacyKey] !== "boolean") continue;

    const currentModuleConfig = config[pluginConfig.name];
    const moduleConfig: Record<string, unknown> = isRecord(currentModuleConfig)
      ? currentModuleConfig
      : {};
    if (typeof moduleConfig.enabled !== "boolean") {
      moduleConfig.enabled = config[legacyKey];
      config[pluginConfig.name] = moduleConfig;
    }
    delete config[legacyKey];
    changed = true;
  }

  const calloutAppearance = isRecord(config.calloutAppearance) ? config.calloutAppearance : undefined;
  const calloutTools = isRecord(config.calloutTools) ? config.calloutTools : undefined;
  if (calloutAppearance && calloutTools && typeof calloutAppearance.smartInsert === "boolean") {
    calloutTools.smartInsert = calloutAppearance.smartInsert;
    delete calloutAppearance.smartInsert;
    changed = true;
  }

  return changed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

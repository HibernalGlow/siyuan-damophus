import { DAMOPHUS_SETTINGS_STORAGE_NAME } from "@hibernalglow/damophus-agent-contract";
import { getLogger } from "@/libs/logger";
import { PluginRegistry } from "./plugin-registry";
import {
  isSettingsDocument,
  mergeSettingsDocuments,
  parseSettingsDocument,
  type SettingsDocument,
} from "./settings-document";
import { migrateLegacyModuleSettings } from "./settings-migrations";
import { plugin } from "./utils";

const log = getLogger("settings");

function generateDefaultConfig(pluginRegistry: PluginRegistry): SettingsDocument {
  const config: SettingsDocument = {};
  for (const pluginMeta of pluginRegistry.getPluginConfigs()) {
    const moduleConfig: SettingsDocument = { enabled: pluginMeta.enabled ?? false };
    for (const setting of pluginMeta.settings ?? []) moduleConfig[setting.key] = setting.value;
    config[pluginMeta.name] = moduleConfig;
  }
  return config;
}

class Settings {
  private readonly pluginRegistry = PluginRegistry.getInstance();

  private getDefaultConfig(): SettingsDocument {
    return generateDefaultConfig(this.pluginRegistry);
  }

  private document(storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): SettingsDocument {
    const value = plugin.data[storageName];
    if (!isSettingsDocument(value)) {
      const document: SettingsDocument = {};
      plugin.data[storageName] = document;
      return document;
    }
    return value;
  }

  async initData(storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): Promise<void> {
    const stored = await this.load(storageName);
    const merged = mergeSettingsDocuments(this.getDefaultConfig(), stored ?? {});
    const migrated = migrateLegacyModuleSettings(merged, this.pluginRegistry.getPluginConfigs());
    plugin.data[storageName] = merged;

    if (!stored || migrated || JSON.stringify(stored) !== JSON.stringify(merged)) {
      await this.save(storageName);
    }
    log.debug("settings.loaded", { storageName, initialized: !stored, migrated });
  }

  async resetData(): Promise<void> {
    plugin.data[DAMOPHUS_SETTINGS_STORAGE_NAME] = this.getDefaultConfig();
    await this.save();
  }

  async mergeData(): Promise<void> {
    plugin.data[DAMOPHUS_SETTINGS_STORAGE_NAME] = mergeSettingsDocuments(
      this.getDefaultConfig(),
      this.document(),
    );
    await this.save();
  }

  setBySpace(space: string, key: string, value: unknown, storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): void {
    const document = this.document(storageName);
    const current = document[space];
    const moduleConfig = isSettingsDocument(current) ? current : {};
    moduleConfig[key] = value;
    document[space] = moduleConfig;
  }

  getBySpace<T = unknown>(space: string, key: string, storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): T | undefined {
    const moduleConfig = this.document(storageName)[space];
    return (isSettingsDocument(moduleConfig) ? moduleConfig[key] : undefined) as T | undefined;
  }

  set(key: string, value: unknown, storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): void {
    this.document(storageName)[key] = value;
  }

  get<T = unknown>(key: string, storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): T | undefined {
    return this.document(storageName)[key] as T | undefined;
  }

  async load(storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): Promise<SettingsDocument | undefined> {
    const document = parseSettingsDocument(await plugin.loadData(storageName));
    if (document) plugin.data[storageName] = document;
    return document;
  }

  async save(storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): Promise<void> {
    const document = this.document(storageName);
    await plugin.saveData(storageName, document);
    plugin.data[storageName] = document;
  }

  async remove(storageName = DAMOPHUS_SETTINGS_STORAGE_NAME): Promise<void> {
    await plugin.removeData(storageName);
    delete plugin.data[storageName];
  }
}

export const settings = new Settings();

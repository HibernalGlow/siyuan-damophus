import { en } from "../translations/en";
import type { ConfigurableEntrySurface, PluginEntrySurface } from "@/libs/plugin-entry-settings";
import type { PluginIconName } from "@/libs/plugin-icons";

export type TranslationKey = keyof typeof en;

export interface PluginSettingItem {
  type: "checkbox" | "textinput" | "textarea" | "select" | "number" | "slider" | "button" | "list";
  title: string;
  description?: string;
  key: string;
  value?: any;
  placeholder?: string;
  height?: string;
  slider?: {
    min: number;
    max: number;
    step: number;
  };
  options?: Record<string, string>;
  columns?: Array<{
    key: string;
    title: string;
    type: "text" | "number" | "select";
    width?: string;
    options?: Record<string, string>;
  }>;
  hasSetting?: boolean;
  entrySurface?: ConfigurableEntrySurface;
  entryManagement?: "central";
}

export interface PluginSettings {
  [groupName: string]: PluginSettingItem[];
}

export interface SubPlugin {
  // Core properties (will be set from PluginMetadata)
  name?: string;
  displayName?: string;
  description?: string;
  version?: string;
  enabled?: boolean;

  /** Register SiYuan models that must exist before the first async startup boundary. */
  registerModels?(): void;
  onload(): void;
  onunload(): void;
  onLayoutReady?(): void;
  onDataChanged?(): void;

  // Injected helpers
  t?(key: TranslationKey): string;
  getSetting?(key: string): any;
  setSetting?(key: string, value: any): void;
  isEntryEnabled?(surface: PluginEntrySurface, fallback?: boolean): boolean;

  // Event handlers
  addMenuItem?(menu: Menu): void;
}

export interface PluginMetadata {
  name: string;
  displayName: string;
  description?: string;
  version?: string;
  author?: string;
  enabled?: boolean;
  icon?: PluginIconName;
  /** Root setting key used by older releases for this module's enabled state. */
  legacyEnabledSetting?: string;
  defaultConfig?: Record<string, any>;
  settings?: PluginSettingItem[];
  reference?: string;
}

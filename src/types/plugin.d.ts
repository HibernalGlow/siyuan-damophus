import { en } from "../translations/en";
import type { ConfigurableEntrySurface, PluginEntrySurface } from "@/libs/plugin-entry-settings";
import type { PluginIconName } from "@/libs/plugin-icons";

export type TranslationKey = keyof typeof en;

export interface ProtyleToolbarItem {
  name: string;
  tip?: string;
  icon?: string;
  hotkey?: string;
  tipPosition?: string;
  click?(protyle: import("siyuan").Protyle): void;
}

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
  /** Expose a checkbox setting in the Damophus plugin menu. */
  menu?: boolean;
}

export interface PluginDeclaration {
  id: string;
  title: string;
  description?: string;
  icon?: PluginIconName;
  settings?: PluginSettingItem[];
  children?: PluginDeclaration[];
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
  updateProtyleToolbar?(toolbar: Array<string | ProtyleToolbarItem>): Array<string | ProtyleToolbarItem>;
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
  /** Arbitrarily nested feature declarations owned by this module. */
  declarations?: PluginDeclaration[];
  reference?: string;
}

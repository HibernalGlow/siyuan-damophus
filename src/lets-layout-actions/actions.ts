import type { ICommand, Plugin } from "siyuan";
import { PANEL_LAYOUT_ICONS } from "./icons";

export type ActionKind = "system" | "plugin" | "editor";
export type ActionPlacement = "menu" | "dock" | "both";
export type ActionPlatform = "desktop" | "mobile" | "both";
export type ActionPlatformTarget = "desktop" | "mobile";

export interface ConfiguredAction {
  id: string;
  title: string;
  icon: string;
  kind: ActionKind;
  value: string;
  placement: ActionPlacement;
  platform: ActionPlatform;
  enabled: boolean;
}

export interface ActionRuntime {
  executeSystem(command: string): void;
  executePlugin(pluginName: string, commandKey: string): boolean;
  getEditorHotkey(category: string, commandKey: string): string | undefined;
  simulateHotkey(hotkey: string): void;
}

export const DEFAULT_ACTIONS: ConfiguredAction[] = [
  {
    id: "switch-left-dock",
    title: "lets-layout-actions.switchLeft",
    icon: PANEL_LAYOUT_ICONS.switchLeftDock,
    kind: "system",
    value: "switchLeftDock",
    placement: "menu",
    platform: "both",
    enabled: true,
  },
  {
    id: "switch-right-dock",
    title: "lets-layout-actions.switchRight",
    icon: PANEL_LAYOUT_ICONS.switchRightDock,
    kind: "system",
    value: "switchRightDock",
    placement: "menu",
    platform: "both",
    enabled: true,
  },
  {
    id: "switch-bottom-dock",
    title: "lets-layout-actions.switchBottom",
    icon: PANEL_LAYOUT_ICONS.switchBottomDock,
    kind: "system",
    value: "switchBottomDock",
    placement: "menu",
    platform: "both",
    enabled: true,
  },
];

const ACTION_KINDS = new Set<ActionKind>(["system", "plugin", "editor"]);
const ACTION_PLACEMENTS = new Set<ActionPlacement>(["menu", "dock", "both"]);
const ACTION_PLATFORMS = new Set<ActionPlatform>(["desktop", "mobile", "both"]);

export function normalizeConfiguredActions(value: unknown): ConfiguredAction[] {
  if (!Array.isArray(value)) return DEFAULT_ACTIONS.map((action) => ({ ...action }));
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ConfiguredAction>;
    const kind = ACTION_KINDS.has(candidate.kind as ActionKind) ? candidate.kind as ActionKind : "system";
    const placement = ACTION_PLACEMENTS.has(candidate.placement as ActionPlacement)
      ? candidate.placement as ActionPlacement
      : "menu";
    // Actions saved before the platform switch existed showed up on every frontend.
    const platform = ACTION_PLATFORMS.has(candidate.platform as ActionPlatform)
      ? candidate.platform as ActionPlatform
      : "both";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    const command = typeof candidate.value === "string" ? candidate.value.trim() : "";
    return [{
      id: typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : `custom-action-${index + 1}`,
      title: title || `Custom action ${index + 1}`,
      icon: normalizeBuiltInIcon(candidate, normalizeIcon(candidate.icon)),
      kind,
      value: command,
      placement,
      platform,
      enabled: candidate.enabled !== false,
    }];
  });
}

function normalizeBuiltInIcon(candidate: Partial<ConfiguredAction>, icon: string): string {
  const migrations: Record<string, { value: string; from: string; to: string }> = {
    "switch-left-dock": { value: "switchLeftDock", from: "iconLeft", to: PANEL_LAYOUT_ICONS.switchLeftDock },
    "switch-right-dock": { value: "switchRightDock", from: "iconRight", to: PANEL_LAYOUT_ICONS.switchRightDock },
    "switch-bottom-dock": { value: "switchBottomDock", from: "iconDown", to: PANEL_LAYOUT_ICONS.switchBottomDock },
  };
  const migration = migrations[candidate.id ?? ""];
  return migration && candidate.value === migration.value && icon === migration.from ? migration.to : icon;
}

/**
 * Decides whether an action is offered on one surface of one frontend. Docks
 * only exist on desktop, so callers pass the platform they are rendering for.
 */
export function actionAppearsOn(
  action: ConfiguredAction,
  surface: "menu" | "dock",
  platform: ActionPlatformTarget,
): boolean {
  if (!action.enabled) return false;
  if (action.platform !== "both" && action.platform !== platform) return false;
  return action.placement === surface || action.placement === "both";
}

export function normalizeIcon(icon: unknown): string {
  const value = typeof icon === "string" ? icon.trim() : "";
  return (value.startsWith("#") ? value.slice(1) : value) || "iconMenu";
}

export function resolveActionTitle(action: ConfiguredAction, translations: Record<string, string>): string {
  return translations[action.title] || action.title;
}

/**
 * Editor keymap categories resolve through the same language-dictionary keys
 * that SiYuan's shortcut settings (keymapUi.ts) uses for their group labels.
 */
const EDITOR_CATEGORY_LANGUAGE_KEYS: Readonly<Record<string, string>> = {
  general: "general",
  insert: "element",
  heading: "headings",
  list: "list1",
  table: "table",
};

export function systemCommandLabel(languages: Record<string, string> | undefined, key: string): string {
  return languages?.[key] || key;
}

export function editorCategoryLabel(languages: Record<string, string> | undefined, category: string): string {
  return systemCommandLabel(languages, EDITOR_CATEGORY_LANGUAGE_KEYS[category] ?? category);
}

/**
 * Resolves a plugin command name with the same fallback chain as SiYuan's
 * shortcut settings: langText, then the plugin i18n dict, then the raw key.
 */
export function pluginCommandLabel(item: Plugin, command: ICommand): string {
  return command.langText || item.i18n[command.langKey] || command.langKey;
}

export function executeConfiguredAction(action: ConfiguredAction, runtime: ActionRuntime): boolean {
  if (!action.enabled) return false;
  if (action.kind === "system") {
    runtime.executeSystem(action.value);
    return true;
  }

  const parts = action.value.split("::");
  if (action.kind === "plugin") {
    if (parts.length !== 3 || parts[0] !== "plugin") return false;
    return runtime.executePlugin(parts[1], parts[2]);
  }

  if (parts.length !== 3 || parts[0] !== "editor") return false;
  const hotkey = runtime.getEditorHotkey(parts[1], parts[2]);
  if (!hotkey) return false;
  runtime.simulateHotkey(hotkey);
  return true;
}

export type ActionKind = "system" | "plugin" | "editor";
export type ActionPlacement = "menu" | "dock" | "both";

export interface ConfiguredAction {
  id: string;
  title: string;
  icon: string;
  kind: ActionKind;
  value: string;
  placement: ActionPlacement;
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
    icon: "iconLeft",
    kind: "system",
    value: "switchLeftDock",
    placement: "menu",
    enabled: true,
  },
  {
    id: "switch-right-dock",
    title: "lets-layout-actions.switchRight",
    icon: "iconRight",
    kind: "system",
    value: "switchRightDock",
    placement: "menu",
    enabled: true,
  },
  {
    id: "switch-bottom-dock",
    title: "lets-layout-actions.switchBottom",
    icon: "iconDown",
    kind: "system",
    value: "switchBottomDock",
    placement: "menu",
    enabled: true,
  },
];

const ACTION_KINDS = new Set<ActionKind>(["system", "plugin", "editor"]);
const ACTION_PLACEMENTS = new Set<ActionPlacement>(["menu", "dock", "both"]);

export function normalizeConfiguredActions(value: unknown): ConfiguredAction[] {
  if (!Array.isArray(value)) return DEFAULT_ACTIONS.map((action) => ({ ...action }));
  return value.flatMap((item, index) => {
    if (!item || typeof item !== "object") return [];
    const candidate = item as Partial<ConfiguredAction>;
    const kind = ACTION_KINDS.has(candidate.kind as ActionKind) ? candidate.kind as ActionKind : "system";
    const placement = ACTION_PLACEMENTS.has(candidate.placement as ActionPlacement)
      ? candidate.placement as ActionPlacement
      : "menu";
    const title = typeof candidate.title === "string" ? candidate.title.trim() : "";
    const command = typeof candidate.value === "string" ? candidate.value.trim() : "";
    return [{
      id: typeof candidate.id === "string" && candidate.id.trim()
        ? candidate.id.trim()
        : `custom-action-${index + 1}`,
      title: title || `Custom action ${index + 1}`,
      icon: normalizeIcon(candidate.icon),
      kind,
      value: command,
      placement,
      enabled: candidate.enabled !== false,
    }];
  });
}

export function actionAppearsOn(action: ConfiguredAction, surface: "menu" | "dock"): boolean {
  return action.enabled && (action.placement === surface || action.placement === "both");
}

export function normalizeIcon(icon: unknown): string {
  const value = typeof icon === "string" ? icon.trim() : "";
  return (value.startsWith("#") ? value.slice(1) : value) || "iconMenu";
}

export function resolveActionTitle(action: ConfiguredAction, translations: Record<string, string>): string {
  return translations[action.title] || action.title;
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

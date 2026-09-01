import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobileEntryFrontend } from "@/libs/plugin-entry-settings";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { plugin } from "@/utils";
import { showMessage, type Menu, type TPluginDockPosition } from "siyuan";
import {
  actionAppearsOn,
  DEFAULT_ACTIONS,
  executeConfiguredAction,
  normalizeConfiguredActions,
  resolveActionTitle,
  type ConfiguredAction,
  type ActionPlatformTarget,
} from "./actions";
import { PANEL_LAYOUT_ICON_SYMBOLS } from "./icons";
import { createActionRuntime } from "./runtime";

const DOCK_POSITIONS = new Set<TPluginDockPosition>([
  "LeftTop",
  "LeftBottom",
  "RightTop",
  "RightBottom",
  "BottomLeft",
  "BottomRight",
]);

export default class LayoutActionsPlugin extends SubPluginBase {
  private commandEntries?: UnifiedEntryPoint[];
  private dockEntries: UnifiedEntryPoint[] = [];
  private iconsRegistered = false;

  override onload(): void {
    this.registerIcons();
    this.registerBuiltInCommands();
    for (const entry of this.commandEntries ?? []) {
      entry.setSurfaces({ command: this.isEntryEnabled("command") });
      entry.setEnabled(true);
    }
    this.syncActionDocks();
  }

  onDataChanged(): void {
    this.syncActionDocks();
  }

  override onunload(): void {
    for (const entry of this.commandEntries ?? []) entry.setEnabled(false);
    for (const entry of this.dockEntries) entry.setEnabled(false);
    this.dockEntries = [];
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu")) return;
    const platform: ActionPlatformTarget = isMobileEntryFrontend() ? "mobile" : "desktop";
    const actions = this.actionsFor("menu", platform);
    if (actions.length === 0) return;
    menu.addItem({
      icon: "iconMenu",
      label: this.t("lets-layout-actions.menu"),
      submenu: actions.map((action) => this.entryFor(action).menuItem()),
    });
  }

  private registerBuiltInCommands(): void {
    if (!this.commandEntries) {
      const langKeys = [
        "lets-layout-actions.switchLeft",
        "lets-layout-actions.switchRight",
        "lets-layout-actions.switchBottom",
      ] as const;
      this.commandEntries = DEFAULT_ACTIONS.map((action, index) => new UnifiedEntryPoint({
        id: action.id,
        title: this.t(langKeys[index]),
        icon: action.icon,
        execute: () => this.execute({ ...action, enabled: true }),
        command: { langKey: langKeys[index] },
      }, plugin));
    }
    for (const entry of this.commandEntries) entry.registerCommand();
  }

  private registerIcons(): void {
    if (this.iconsRegistered) return;
    plugin.addIcons(PANEL_LAYOUT_ICON_SYMBOLS);
    this.iconsRegistered = true;
  }

  private syncActionDocks(): void {
    for (const entry of this.dockEntries) entry.setEnabled(false);
    this.dockEntries = [];
    if (isMobileEntryFrontend() || !this.isEntryEnabled("desktopDock")) return;

    this.dockEntries = this.actionsFor("dock", "desktop").map((action, index) => {
      const entry = new UnifiedEntryPoint({
        id: `layout-actions.dock.${action.id}`,
        title: action.title,
        icon: action.icon,
        execute: () => this.execute(action),
        dock: {
          type: actionDockType(action.id),
          activation: "action",
          config: {
            position: this.dockPosition(),
            size: { width: 240, height: 0 },
            icon: action.icon,
            title: action.title,
            show: false,
            index,
          },
          data: {},
          init: (target) => target.replaceChildren(),
        },
      }, plugin);
      entry.registerDock();
      return entry;
    });
  }

  private configuredActions(): ConfiguredAction[] {
    return normalizeConfiguredActions(this.getSetting("actions")).map((action) => ({
      ...action,
      title: resolveActionTitle(action, plugin.i18n ?? {}),
    }));
  }

  private actionsFor(surface: "menu" | "dock", platform: ActionPlatformTarget): ConfiguredAction[] {
    return this.configuredActions().filter((action) =>
      action.value && actionAppearsOn(action, surface, platform)
    );
  }

  private entryFor(action: ConfiguredAction): UnifiedEntryPoint {
    return new UnifiedEntryPoint({
      id: action.id,
      title: action.title,
      icon: action.icon,
      execute: () => this.execute(action),
    }, plugin);
  }

  private execute(action: ConfiguredAction): void {
    if (!this.enabled) return;
    if (!executeConfiguredAction(action, createActionRuntime())) {
      showMessage(this.t("lets-layout-actions.executionFailed"), 5000, "error");
    }
  }

  private dockPosition(): TPluginDockPosition {
    const value = this.getSetting("dockPosition");
    return DOCK_POSITIONS.has(value as TPluginDockPosition) ? value as TPluginDockPosition : "RightBottom";
  }
}

export function actionDockType(actionId: string): string {
  const slug = actionId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "action";
  let hash = 2166136261;
  for (const character of actionId) hash = Math.imul(hash ^ character.codePointAt(0)!, 16777619);
  return `damophus-layout-action-${slug}-${(hash >>> 0).toString(36)}`;
}

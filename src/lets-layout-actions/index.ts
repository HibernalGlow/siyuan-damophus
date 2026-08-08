import { SubPluginBase } from "@/libs/sub-plugin-base";
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
} from "./actions";
import { renderConfiguredActionsDock } from "./dock";
import { createActionRuntime } from "./runtime";
import "./layout-actions.css";

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
  private dockEntry?: UnifiedEntryPoint;
  private dockTarget?: HTMLElement;
  private cleanupDock?: () => void;

  override onload(): void {
    this.registerBuiltInCommands();
    this.ensureOptionalDock();
    this.renderDock();
  }

  onDataChanged(): void {
    if (this.getSetting("showDock") === true) this.ensureOptionalDock();
    this.renderDock();
  }

  override onunload(): void {
    this.cleanupDock?.();
    this.cleanupDock = undefined;
    this.dockTarget = undefined;
    this.dockEntry?.destroyDockContent();
  }

  addMenuItem(menu: Menu): void {
    const actions = this.actionsFor("menu");
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

  private ensureOptionalDock(): void {
    if (this.dockEntry || this.getSetting("showDock") !== true) return;
    const position = this.dockPosition();
    this.dockEntry = new UnifiedEntryPoint({
      id: "layout-actions.dock",
      title: this.t("lets-layout-actions.displayName"),
      icon: "iconMenu",
      execute: () => undefined,
      dock: {
        type: "damophus-layout-actions-dock",
        config: {
          position,
          size: { width: 240, height: 0 },
          icon: "iconMenu",
          title: this.t("lets-layout-actions.displayName"),
          show: false,
        },
        data: {},
        init: (target) => {
          this.dockTarget = target;
          this.renderDock();
        },
        destroy: () => {
          this.cleanupDock?.();
          this.cleanupDock = undefined;
          this.dockTarget = undefined;
        },
      },
    }, plugin);
    this.dockEntry.registerDock();
  }

  private renderDock(): void {
    if (!this.dockTarget) return;
    this.cleanupDock?.();
    this.cleanupDock = undefined;
    if (this.getSetting("showDock") !== true) {
      this.dockTarget.replaceChildren();
      return;
    }
    this.cleanupDock = renderConfiguredActionsDock(
      this.dockTarget,
      this.actionsFor("dock"),
      (action) => this.execute(action),
    );
  }

  private configuredActions(): ConfiguredAction[] {
    const translations = (window as Window & { siyuan?: { languages?: Record<string, string> } }).siyuan?.languages;
    return normalizeConfiguredActions(this.getSetting("actions")).map((action) => ({
      ...action,
      title: resolveActionTitle(action, {
        ...(translations ?? {}),
        "lets-layout-actions.switchLeft": this.t("lets-layout-actions.switchLeft"),
        "lets-layout-actions.switchRight": this.t("lets-layout-actions.switchRight"),
        "lets-layout-actions.switchBottom": this.t("lets-layout-actions.switchBottom"),
      }),
    }));
  }

  private actionsFor(surface: "menu" | "dock"): ConfiguredAction[] {
    return this.configuredActions().filter((action) => action.value && actionAppearsOn(action, surface));
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

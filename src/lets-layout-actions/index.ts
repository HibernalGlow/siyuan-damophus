import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { globalCommand, type IMenu, type Menu } from "siyuan";
import { executeSiyuanCommand, PANEL_LAYOUT_ACTIONS, type PanelLayoutCommand } from "./actions";
import { renderLayoutActionsDock } from "./dock";
import "./layout-actions.css";

export default class LayoutActionsPlugin extends SubPluginBase {
  private commandsRegistered = false;
  private dockRegistered = false;
  private cleanupDock?: () => void;

  override registerModels(): void {
    if (this.dockRegistered) return;
    this.dockRegistered = true;
    const owner = this;
    plugin.addDock({
      config: {
        position: "RightBottom",
        size: { width: 220, height: 0 },
        icon: "iconGrid",
        title: this.t("lets-layout-actions.displayName"),
        show: false,
      },
      data: {},
      type: "damophus-layout-actions-dock",
      init() {
        owner.cleanupDock?.();
        owner.cleanupDock = renderLayoutActionsDock(
          this.element as HTMLElement,
          owner.actionLabels(),
          (command) => owner.execute(command),
        );
      },
      destroy() {
        owner.cleanupDock?.();
        owner.cleanupDock = undefined;
      },
    });
  }

  override onload(): void {
    if (this.commandsRegistered) return;
    this.commandsRegistered = true;
    for (const action of PANEL_LAYOUT_ACTIONS) {
      plugin.addCommand({
        langKey: action.labelKey,
        hotkey: "",
        callback: () => this.execute(action.command),
      });
    }
  }

  override onunload(): void {
    this.cleanupDock?.();
    this.cleanupDock = undefined;
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconGrid",
      label: this.t("lets-layout-actions.menu"),
      submenu: PANEL_LAYOUT_ACTIONS.map((action) => this.menuAction(action.command)),
    });
  }

  private menuAction(command: PanelLayoutCommand): IMenu {
    const action = PANEL_LAYOUT_ACTIONS.find((item) => item.command === command)!;
    return {
      icon: action.icon,
      label: this.t(action.labelKey),
      click: () => this.execute(command),
    };
  }

  private actionLabels(): Record<PanelLayoutCommand, string> {
    return Object.fromEntries(PANEL_LAYOUT_ACTIONS.map((action) => [
      action.command,
      this.t(action.labelKey),
    ])) as Record<PanelLayoutCommand, string>;
  }

  private execute(command: PanelLayoutCommand): void {
    if (!this.enabled) return;
    executeSiyuanCommand(command, (value) => globalCommand(value, plugin.app));
  }
}

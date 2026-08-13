import type { Menu } from "siyuan";
import { showMessage } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { plugin } from "@/utils";
import { ExerciseFocusController, type ExerciseFocusSettings } from "./exercise-focus";

export default class ExerciseFocusPlugin extends SubPluginBase {
  private readonly controller = new ExerciseFocusController();
  private toggleEntry?: UnifiedEntryPoint;

  override onload(): void {
    this.toggleEntry ??= new UnifiedEntryPoint({
      id: "exercise-focus.toggle",
      title: this.t("lets-exercise-focus.toggleCommand"),
      icon: "iconEyeoff",
      execute: () => this.setModeEnabled(!this.isModeEnabled(), true),
      command: { langKey: "lets-exercise-focus.toggleCommand" },
    }, plugin);
    this.toggleEntry.setSurfaces({ menu: false, dock: false, command: true });
    this.toggleEntry.setEnabled(true);
    this.applySetting();
  }

  onDataChanged(): void {
    this.applySetting();
  }

  override onunload(): void {
    this.controller.destroy();
    this.toggleEntry?.setEnabled(false);
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconEyeoff",
      label: this.t("lets-exercise-focus.toggleCommand"),
      checked: this.isModeEnabled(),
      click: () => this.setModeEnabled(!this.isModeEnabled(), false),
    });
  }

  private isModeEnabled(): boolean {
    return this.getSetting("modeEnabled") === true;
  }

  private setModeEnabled(enabled: boolean, notify: boolean): void {
    this.setSetting("modeEnabled", enabled);
    this.applyEnabled(enabled);
    if (notify) {
      showMessage(this.t(enabled ? "lets-exercise-focus.enabledMessage" : "lets-exercise-focus.disabledMessage"), 2500);
    }
  }

  private applySetting(): void {
    this.applyEnabled(this.isModeEnabled());
  }

  private applyEnabled(enabled: boolean): void {
    if (!enabled) {
      this.controller.destroy();
      return;
    }
    const settings: Partial<ExerciseFocusSettings> = {
      headingText: this.getSetting("headingText"),
      headingLevel: this.getSetting("headingLevel"),
      visibleBlockTypes: this.getSetting("visibleBlockTypes"),
      maskHeight: this.getSetting("maskHeight"),
    };
    this.controller.start(settings);
  }
}

import type { Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { SelectionHighlighter } from "./selection-highlight";

export default class SelectionHighlightPlugin extends SubPluginBase {
  private readonly highlighter = new SelectionHighlighter();

  override onload(): void {
    this.applySetting();
  }

  onDataChanged(): void {
    this.applySetting();
  }

  override onunload(): void {
    this.highlighter.destroy();
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconMark",
      label: this.t("lets-selection-highlight.displayName"),
      checked: this.isHighlightEnabled(),
      click: () => this.setHighlightEnabled(!this.isHighlightEnabled()),
    });
  }

  private isHighlightEnabled(): boolean {
    return this.getSetting("highlightEnabled") !== false;
  }

  private setHighlightEnabled(enabled: boolean): void {
    this.setSetting("highlightEnabled", enabled);
    this.applyEnabled(enabled);
  }

  private applySetting(): void {
    this.applyEnabled(this.isHighlightEnabled());
  }

  private applyEnabled(enabled: boolean): void {
    if (enabled) this.highlighter.start();
    else this.highlighter.destroy();
  }
}

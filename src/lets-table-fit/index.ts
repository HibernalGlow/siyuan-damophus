import type { Menu } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { TableFitStyles } from "./table-fit";

export default class TableFitPlugin extends SubPluginBase {
  private readonly styles = new TableFitStyles();

  override onload(): void {
    this.applySetting();
  }

  onDataChanged(): void {
    this.applySetting();
  }

  override onunload(): void {
    this.styles.destroy();
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconTable",
      label: this.t("lets-table-fit.displayName"),
      checked: this.isFitEnabled(),
      click: () => this.setFitEnabled(!this.isFitEnabled()),
    });
  }

  private isFitEnabled(): boolean {
    return this.getSetting("fitEnabled") !== false;
  }

  private setFitEnabled(enabled: boolean): void {
    this.setSetting("fitEnabled", enabled);
    this.applyEnabled(enabled);
  }

  private applySetting(): void {
    this.applyEnabled(this.isFitEnabled());
  }

  private applyEnabled(enabled: boolean): void {
    if (enabled) this.styles.start();
    else this.styles.destroy();
  }
}

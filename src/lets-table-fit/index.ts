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

  private isWideScroll(): boolean {
    return this.getSetting("wideScroll") === true;
  }

  private setFitEnabled(enabled: boolean): void {
    this.setSetting("fitEnabled", enabled);
    this.applySetting();
  }

  private applySetting(): void {
    if (!this.isFitEnabled()) {
      this.styles.destroy();
      return;
    }
    this.styles.start({ wideScroll: this.isWideScroll() });
  }
}

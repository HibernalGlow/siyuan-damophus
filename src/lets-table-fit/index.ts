import { SubPluginBase } from "@/libs/sub-plugin-base";
import { TableFitStyles } from "./table-fit";

export default class TableFitPlugin extends SubPluginBase {
  private readonly styles = new TableFitStyles();

  override onload(): void {
    this.styles.start();
  }

  override onunload(): void {
    this.styles.destroy();
  }
}

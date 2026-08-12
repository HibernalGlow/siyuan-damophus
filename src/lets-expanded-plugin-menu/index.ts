import { SubPluginBase } from "@/libs/sub-plugin-base";
import { ExpandedPluginMenuController } from "./expanded-plugin-menu";

export default class ExpandedPluginMenuPlugin extends SubPluginBase {
  private readonly controller = new ExpandedPluginMenuController();

  override onload(): void {
    this.controller.start();
  }

  onDataChanged(): void {
    this.controller.refresh();
  }

  override onunload(): void {
    this.controller.destroy();
  }
}

import { getAllTabs } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { TabIconController } from "./tab-icon-controller";

export default class TabIconsPlugin extends SubPluginBase {
  private readonly controller = new TabIconController(() => getAllTabs());

  override onLayoutReady(): void {
    this.controller.start(this.readOptions());
  }

  onDataChanged(): void {
    this.controller.updateOptions(this.readOptions());
  }

  override onunload(): void {
    this.controller.destroy();
  }

  private readOptions(): { parentPath: string; icon: string } {
    return {
      parentPath: String(this.getSetting?.("parentPath") ?? ""),
      icon: String(this.getSetting?.("icon") ?? ""),
    };
  }
}

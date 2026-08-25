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

  private readOptions(): { rules: Array<{ notebook: string; parentPath: string; icon: string }> } {
    const configured = this.getSetting?.("rules");
    const rules = Array.isArray(configured)
      ? configured
        .filter((rule): rule is { notebook?: unknown; parentPath?: unknown; icon?: unknown } => Boolean(rule && typeof rule === "object"))
        .map((rule) => ({
          notebook: String(rule.notebook ?? ""),
          parentPath: String(rule.parentPath ?? ""),
          icon: String(rule.icon ?? ""),
        }))
        .filter((rule) => rule.notebook.trim() && rule.parentPath.trim() && rule.icon.trim())
      : [];
    return { rules };
  }
}

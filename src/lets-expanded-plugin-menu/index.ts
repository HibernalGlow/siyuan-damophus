import { SubPluginBase } from "@/libs/sub-plugin-base";
import {
  DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES,
  ExpandedPluginMenuController,
} from "./expanded-plugin-menu";

export default class ExpandedPluginMenuPlugin extends SubPluginBase {
  private readonly controller = new ExpandedPluginMenuController();

  private allowedEntries(): unknown {
    return this.getSetting("allowedEntries") ?? DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES;
  }

  override onload(): void {
    this.controller.start(this.allowedEntries());
  }

  onDataChanged(): void {
    this.controller.updateAllowedEntries(this.allowedEntries());
    this.controller.refresh();
  }

  override onunload(): void {
    this.controller.destroy();
  }
}

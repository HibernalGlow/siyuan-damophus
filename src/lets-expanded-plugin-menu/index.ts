import { SubPluginBase } from "@/libs/sub-plugin-base";
import {
  DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES,
  ExpandedPluginMenuController,
} from "./expanded-plugin-menu";
import { serializeDiscoveredPluginMenuEntries, type DiscoveredPluginMenuEntry } from "./discovered-entries";
import { installPluginMenuIdentityInstrumentation } from "@/libs/menu-identity";
import { plugin } from "@/utils";

export default class ExpandedPluginMenuPlugin extends SubPluginBase {
  private removePluginIdentityInstrumentation?: () => void;
  private readonly controller = new ExpandedPluginMenuController(document, (entries) => {
    this.persistDiscoveredEntries(entries);
  });

  private allowedEntries(): unknown {
    return this.getSetting("allowedEntries") ?? DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES;
  }

  override onload(): void {
    this.removePluginIdentityInstrumentation ??= installPluginMenuIdentityInstrumentation(plugin.eventBus);
    this.controller.start(this.allowedEntries(), this.getSetting("discoveredEntries"));
  }

  onDataChanged(): void {
    this.controller.updateAllowedEntries(this.allowedEntries());
    this.controller.updateDiscoveredEntries(this.getSetting("discoveredEntries"));
    this.controller.refresh();
  }

  override onunload(): void {
    this.controller.destroy();
    this.removePluginIdentityInstrumentation?.();
    this.removePluginIdentityInstrumentation = undefined;
  }

  private persistDiscoveredEntries(entries: readonly DiscoveredPluginMenuEntry[]): void {
    const value = serializeDiscoveredPluginMenuEntries(entries);
    if (this.getSetting("discoveredEntries") === value) return;
    this.setSetting("discoveredEntries", value);
  }
}

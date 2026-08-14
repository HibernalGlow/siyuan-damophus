import { SubPluginBase } from "@/libs/sub-plugin-base";
import {
  DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES,
  ExpandedPluginMenuController,
} from "./expanded-plugin-menu";
import { serializeDiscoveredPluginMenuEntries, type DiscoveredPluginMenuEntry } from "./discovered-entries";
import {
  DEFAULT_PLUGIN_MENU_PLACEMENT,
  serializeDiscoveredPluginMenuAnchors,
  type DiscoveredPluginMenuAnchor,
} from "./settings-model";
import { installPluginMenuIdentityInstrumentation } from "@/libs/menu-identity";
import { plugin } from "@/utils";

export default class ExpandedPluginMenuPlugin extends SubPluginBase {
  private removePluginIdentityInstrumentation?: () => void;
  private readonly controller = new ExpandedPluginMenuController(document, (entries) => {
    this.persistDiscoveredEntries(entries);
  }, (anchors) => {
    this.persistDiscoveredAnchors(anchors);
  });

  private allowedEntries(): unknown {
    return this.getSetting("allowedEntries") ?? DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES;
  }

  override onload(): void {
    this.removePluginIdentityInstrumentation ??= installPluginMenuIdentityInstrumentation(plugin.eventBus);
    this.controller.start(
      this.allowedEntries(),
      this.getSetting("discoveredEntries"),
      this.getSetting("pluginMenuPlacement") ?? DEFAULT_PLUGIN_MENU_PLACEMENT,
      this.getSetting("pluginMenuAnchors"),
      this.getSetting("pluginMenuOrder"),
    );
  }

  onDataChanged(): void {
    this.controller.updateAllowedEntries(this.allowedEntries());
    this.controller.updateDiscoveredEntries(this.getSetting("discoveredEntries"));
    this.controller.updateDiscoveredAnchors(this.getSetting("pluginMenuAnchors"));
    this.controller.updatePlacement(this.getSetting("pluginMenuPlacement") ?? DEFAULT_PLUGIN_MENU_PLACEMENT);
    this.controller.updateMenuOrder(this.getSetting("pluginMenuOrder"));
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

  private persistDiscoveredAnchors(anchors: readonly DiscoveredPluginMenuAnchor[]): void {
    const value = serializeDiscoveredPluginMenuAnchors(anchors);
    if (this.getSetting("pluginMenuAnchors") === value) return;
    this.setSetting("pluginMenuAnchors", value);
  }
}

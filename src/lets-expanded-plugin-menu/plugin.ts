import type { PluginMetadata } from "@/types/plugin";
import { DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES } from "./expanded-plugin-menu";
import { DEFAULT_PLUGIN_MENU_PLACEMENT } from "./settings-model";

export const pluginMetadata: PluginMetadata = {
  name: "expandedPluginMenu",
  displayName: "lets-expanded-plugin-menu.displayName",
  description: "lets-expanded-plugin-menu.description",
  version: "1.0.0",
  enabled: false,
  icon: "layoutGrid",
  settings: [
    {
      type: "textarea",
      title: "lets-expanded-plugin-menu.allowedEntriesTitle",
      description: "lets-expanded-plugin-menu.allowedEntriesDescription",
      key: "allowedEntries",
      value: DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES,
      placeholder: "module:calloutTools\nplugin:other-plugin\n菜单文字",
      height: "150px",
    },
    {
      type: "textarea",
      title: "lets-expanded-plugin-menu.discoveredEntriesTitle",
      description: "lets-expanded-plugin-menu.discoveredEntriesDescription",
      key: "discoveredEntries",
      value: "[]",
    },
    {
      type: "textarea",
      title: "lets-expanded-plugin-menu.menuOrderTitle",
      description: "lets-expanded-plugin-menu.menuOrderDescription",
      key: "pluginMenuOrder",
      value: "[]",
    },
    {
      type: "textarea",
      title: "lets-expanded-plugin-menu.placementTitle",
      description: "lets-expanded-plugin-menu.placementDescription",
      key: "pluginMenuPlacement",
      value: DEFAULT_PLUGIN_MENU_PLACEMENT,
    },
    {
      type: "textarea",
      title: "lets-expanded-plugin-menu.discoveredAnchorsTitle",
      description: "lets-expanded-plugin-menu.discoveredAnchorsDescription",
      key: "pluginMenuAnchors",
      value: "[]",
    },
  ],
};

export default pluginMetadata;

import type { PluginMetadata } from "@/types/plugin";
import { DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES } from "./expanded-plugin-menu";

export const pluginMetadata: PluginMetadata = {
  name: "expandedPluginMenu",
  displayName: "lets-expanded-plugin-menu.displayName",
  description: "lets-expanded-plugin-menu.description",
  version: "1.0.0",
  enabled: true,
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
  ],
};

export default pluginMetadata;

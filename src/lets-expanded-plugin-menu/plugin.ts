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
      placeholder: "转换为 Callout\n从此块打开题库",
      height: "150px",
    },
  ],
};

export default pluginMetadata;

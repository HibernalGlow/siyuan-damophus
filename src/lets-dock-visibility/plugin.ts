import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "dockVisibility",
  displayName: "lets-dock-visibility.displayName",
  description: "lets-dock-visibility.description",
  version: "1.0.0",
  enabled: false,
  icon: "eye",
  settings: [
    {
      type: "list",
      title: "lets-dock-visibility.dockPlatforms",
      description: "lets-dock-visibility.dockPlatformsDescription",
      key: "dockPlatforms",
      value: {},
      columns: [],
    },
  ],
};

export default pluginMetadata;

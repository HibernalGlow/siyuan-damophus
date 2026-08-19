import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "networkAssetsLocal",
  displayName: "lets-network-assets-local.displayName",
  description: "lets-network-assets-local.description",
  version: "1.0.0",
  enabled: false,
  icon: "network",
  settings: createEntrySettings({ contextMenu: true }),
};

export default pluginMetadata;

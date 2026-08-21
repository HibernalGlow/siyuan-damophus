import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";
import { DEFAULT_EXCLUDED_RULES, DEFAULT_NETWORK_ASSET_BLOCK_TYPES } from "./network-assets-local";

const pluginMetadata: PluginMetadata = {
  name: "networkAssetsLocal",
  displayName: "lets-network-assets-local.displayName",
  description: "lets-network-assets-local.description",
  version: "1.0.0",
  enabled: false,
  icon: "globe2",
  settings: [
    ...createEntrySettings({ contextMenu: true, tab: true }, { central: true }),
    {
      type: "excludedRules",
      title: "lets-network-assets-local.excludedPatternTitle",
      description: "lets-network-assets-local.excludedPatternDescription",
      key: "excludedPattern",
      value: DEFAULT_EXCLUDED_RULES,
    },
    {
      type: "blockTypes",
      title: "lets-network-assets-local.blockTypesTitle",
      description: "lets-network-assets-local.blockTypesDescription",
      key: "blockTypes",
      value: DEFAULT_NETWORK_ASSET_BLOCK_TYPES,
    },
  ],
};

export default pluginMetadata;

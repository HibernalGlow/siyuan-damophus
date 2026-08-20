import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";
import { DEFAULT_NETWORK_ASSET_BLOCK_TYPES } from "./network-assets-local";

const pluginMetadata: PluginMetadata = {
  name: "networkAssetsLocal",
  displayName: "lets-network-assets-local.displayName",
  description: "lets-network-assets-local.description",
  version: "1.0.0",
  enabled: false,
  icon: "network",
  settings: [
    ...createEntrySettings({ contextMenu: true, tab: true }, { central: true }),
    {
      type: "textarea",
      title: "lets-network-assets-local.excludedPatternTitle",
      description: "lets-network-assets-local.excludedPatternDescription",
      key: "excludedPattern",
      value: [
        "# InkLoom 动图与文档资源",
        "inkloomer\\.github\\.io/inkloom",
        "",
        "# GitHub Issues 与 Pull Requests",
        "github\\.com/[^/]+/[^/]+/(?:issues|pull)",
      ].join("\n"),
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

import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "databaseEnhancements",
  displayName: "lets-database-enhancements.displayName",
  description: "lets-database-enhancements.description",
  version: "1.0.0",
  enabled: false,
  icon: "database",
  settings: [
    {
      type: "checkbox",
      title: "lets-database-enhancements.inheritCardCoverTitle",
      description: "lets-database-enhancements.inheritCardCoverDescription",
      key: "inheritCardCover",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-database-enhancements.smartRelationSortingTitle",
      description: "lets-database-enhancements.smartRelationSortingDescription",
      key: "smartRelationSorting",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-database-enhancements.highlightRelevantItemTitle",
      description: "lets-database-enhancements.highlightRelevantItemDescription",
      key: "highlightRelevantItem",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-database-enhancements.columnBindingTitle",
      description: "lets-database-enhancements.columnBindingDescription",
      key: "columnBindingEnabled",
      value: false,
    },
    {
      type: "checkbox",
      title: "lets-database-enhancements.assetCutTitle",
      description: "lets-database-enhancements.assetCutDescription",
      key: "assetCutEnabled",
      value: true,
    },
  ],
};

export default pluginMetadata;

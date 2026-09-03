import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "searchGroup",
  displayName: "lets-search-group.displayName",
  description: "lets-search-group.description",
  version: "1.0.0",
  enabled: false,
  icon: "listTree",
  settings: [
    {
      type: "checkbox",
      title: "lets-search-group.globalTitle",
      description: "lets-search-group.globalDescription",
      key: "globalSearch",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-search-group.documentTitle",
      description: "lets-search-group.documentDescription",
      key: "currentDocumentSearch",
      value: false,
    },
    {
      type: "checkbox",
      title: "lets-search-group.openAsTabTitle",
      description: "lets-search-group.openAsTabDescription",
      key: "openSearchAsTab",
      value: false,
    },
    {
      type: "checkbox",
      title: "lets-search-group.tabGlobalTitle",
      description: "lets-search-group.tabGlobalDescription",
      key: "globalSearchAsTab",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-search-group.tabDocumentTitle",
      description: "lets-search-group.tabDocumentDescription",
      key: "documentSearchAsTab",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-search-group.tabReuseTitle",
      description: "lets-search-group.tabReuseDescription",
      key: "reuseSearchTab",
      value: true,
    },
    {
      type: "select",
      title: "lets-search-group.tabPositionTitle",
      description: "lets-search-group.tabPositionDescription",
      key: "searchTabPosition",
      value: "current",
      options: {
        current: "lets-search-group.tabPositionCurrent",
        opposite: "lets-search-group.tabPositionOpposite",
      },
    },
  ],
};

export default pluginMetadata;

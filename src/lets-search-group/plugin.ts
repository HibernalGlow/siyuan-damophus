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
  ],
};

export default pluginMetadata;

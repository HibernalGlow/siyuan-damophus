import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "blockFullwidth",
  displayName: "lets-block-fullwidth.displayName",
  description: "lets-block-fullwidth.description",
  version: "1.1.0",
  enabled: false,
  icon: "layoutGrid",
  settings: [
    {
      type: "blockTypes",
      title: "lets-block-fullwidth.globalExcludedTypesTitle",
      description: "lets-block-fullwidth.globalExcludedTypesDescription",
      key: "globalExcludedTypes",
      value: [],
    },
  ],
  declarations: [
    {
      id: "globalDefault",
      title: "lets-block-fullwidth.globalTitle",
      icon: "layoutGrid",
      settings: [
        {
          type: "checkbox",
          title: "lets-block-fullwidth.globalTitle",
          description: "lets-block-fullwidth.globalDescription",
          key: "globalEnabled",
          value: false,
          menu: true,
        },
      ],
    },
  ],
};

export default pluginMetadata;

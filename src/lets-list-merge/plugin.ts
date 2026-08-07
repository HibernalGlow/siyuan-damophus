import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "listMerge",
  displayName: "lets-list-merge.displayName",
  description: "lets-list-merge.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "select",
      title: "lets-list-merge.defaultMixedSubtypeTitle",
      description: "lets-list-merge.defaultMixedSubtypeDescription",
      key: "defaultMixedSubtype",
      value: "o",
      options: {
        o: "lets-list-merge.defaultMixedSubtypeOrdered",
        u: "lets-list-merge.defaultMixedSubtypeUnordered",
      },
    },
  ],
};

export default pluginMetadata;

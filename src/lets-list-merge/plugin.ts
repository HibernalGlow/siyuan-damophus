import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "../libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "listMerge",
  displayName: "lets-list-merge.displayName",
  description: "lets-list-merge.description",
  version: "1.0.0",
  enabled: false,
  icon: "listTree",
  settings: [
    ...createEntrySettings({ contextMenu: true, command: true }),
    {
      type: "checkbox",
      title: "lets-list-merge.promoteNestedListsTitle",
      description: "lets-list-merge.promoteNestedListsDescription",
      key: "promoteNestedLists",
      value: true,
    },
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

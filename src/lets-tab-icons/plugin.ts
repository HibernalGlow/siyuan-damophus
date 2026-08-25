import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "tabIcons",
  displayName: "lets-tab-icons.displayName",
  description: "lets-tab-icons.description",
  version: "1.0.0",
  enabled: true,
  icon: "tags",
  settings: [
    {
      type: "list",
      title: "lets-tab-icons.rulesTitle",
      description: "lets-tab-icons.rulesDescription",
      key: "rules",
      value: [],
      columns: [
        { key: "notebook", title: "lets-tab-icons.notebookTitle", type: "notebook", width: "180px" },
        { key: "parentPath", title: "lets-tab-icons.parentDocumentTitle", type: "text", width: "1fr" },
        { key: "icon", title: "lets-tab-icons.iconTitle", type: "emoji", width: "120px" },
      ],
    },
  ],
};

export default pluginMetadata;

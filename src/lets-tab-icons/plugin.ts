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
      type: "textinput",
      title: "lets-tab-icons.parentPathTitle",
      description: "lets-tab-icons.parentPathDescription",
      key: "parentPath",
      value: "",
      placeholder: "lets-tab-icons.parentPathPlaceholder",
    },
    {
      type: "textinput",
      title: "lets-tab-icons.iconTitle",
      description: "lets-tab-icons.iconDescription",
      key: "icon",
      value: "\u{1F516}",
      placeholder: "lets-tab-icons.iconPlaceholder",
    },
  ],
};

export default pluginMetadata;

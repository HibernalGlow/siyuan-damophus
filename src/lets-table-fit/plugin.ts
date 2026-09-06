import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "tableFit",
  displayName: "lets-table-fit.displayName",
  description: "lets-table-fit.description",
  version: "1.0.0",
  enabled: false,
  icon: "tableProperties",
  settings: [
    {
      type: "checkbox",
      title: "lets-table-fit.enabledTitle",
      description: "lets-table-fit.enabledDescription",
      key: "fitEnabled",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-table-fit.wideScrollTitle",
      description: "lets-table-fit.wideScrollDescription",
      key: "wideScroll",
      value: false,
    },
  ],
};

export default pluginMetadata;

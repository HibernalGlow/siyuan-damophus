import type { PluginMetadata } from "@/types/plugin";
import { DEFAULT_ACTIONS } from "./actions";

const pluginMetadata: PluginMetadata = {
  name: "layoutActions",
  displayName: "lets-layout-actions.displayName",
  description: "lets-layout-actions.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "checkbox",
      title: "lets-layout-actions.dockEnabled",
      description: "lets-layout-actions.dockEnabledDescription",
      key: "showDock",
      value: false,
    },
    {
      type: "select",
      title: "lets-layout-actions.dockPosition",
      key: "dockPosition",
      value: "RightBottom",
      options: {
        LeftTop: "lets-layout-actions.leftTop",
        LeftBottom: "lets-layout-actions.leftBottom",
        RightTop: "lets-layout-actions.rightTop",
        RightBottom: "lets-layout-actions.rightBottom",
        BottomLeft: "lets-layout-actions.bottomLeft",
        BottomRight: "lets-layout-actions.bottomRight",
      },
    },
    {
      type: "list",
      title: "lets-layout-actions.actions",
      description: "lets-layout-actions.actionsDescription",
      key: "actions",
      value: DEFAULT_ACTIONS,
      columns: [],
    },
  ],
};

export default pluginMetadata;

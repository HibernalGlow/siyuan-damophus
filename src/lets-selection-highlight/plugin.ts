import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "selectionHighlight",
  displayName: "lets-selection-highlight.displayName",
  description: "lets-selection-highlight.description",
  version: "1.0.0",
  enabled: false,
  icon: "highlighter",
  settings: [
    {
      type: "checkbox",
      title: "lets-selection-highlight.enabledTitle",
      description: "lets-selection-highlight.enabledDescription",
      key: "highlightEnabled",
      value: true,
    },
  ],
};

export default pluginMetadata;

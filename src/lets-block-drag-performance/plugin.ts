import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "blockDragPerformance",
  displayName: "lets-block-drag-performance.displayName",
  description: "lets-block-drag-performance.description",
  version: "1.0.0",
  enabled: false,
  icon: "move",
  settings: [
    {
      type: "number",
      title: "lets-block-drag-performance.intervalTitle",
      description: "lets-block-drag-performance.intervalDescription",
      key: "minimumIntervalMs",
      value: 24,
    },
  ],
};

export default pluginMetadata;

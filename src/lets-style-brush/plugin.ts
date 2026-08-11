import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "styleBrush",
  displayName: "lets-style-brush.displayName",
  description: "lets-style-brush.description",
  version: "1.0.0",
  enabled: true,
  icon: "paintbrush",
  settings: [
    ...createEntrySettings({ menu: true }),
  ],
};

export default pluginMetadata;

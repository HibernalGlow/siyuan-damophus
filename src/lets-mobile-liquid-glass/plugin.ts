import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "mobileLiquidGlass",
  displayName: "lets-mobile-liquid-glass.displayName",
  description: "lets-mobile-liquid-glass.description",
  version: "1.0.0",
  enabled: true,
  reference: "https://github.com/QYLexpired/Neo-Plus",
  settings: [
    {
      type: "select",
      title: "lets-mobile-liquid-glass.styleTitle",
      description: "lets-mobile-liquid-glass.styleDescription",
      key: "stylePreset",
      value: "transparent",
      options: {
        transparent: "lets-mobile-liquid-glass.styleTransparent",
        "neo-plus": "lets-mobile-liquid-glass.styleNeoPlus",
      },
    },
  ],
};

export default pluginMetadata;

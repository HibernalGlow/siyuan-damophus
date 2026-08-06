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
      value: "liquid-glass",
      options: {
        blur: "lets-mobile-liquid-glass.styleBlur",
        "frosted-glass": "lets-mobile-liquid-glass.styleFrostedGlass",
        "liquid-glass": "lets-mobile-liquid-glass.styleLiquidGlass",
      },
    },
  ],
};

export default pluginMetadata;

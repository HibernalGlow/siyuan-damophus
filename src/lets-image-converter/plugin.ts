import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "imageConverter",
  displayName: "lets-image-converter.displayName",
  description: "lets-image-converter.description",
  version: "1.0.0",
  enabled: true,
  icon: "imagePlay",
  settings: [
    {
      type: "select",
      title: "lets-image-converter.formatTitle",
      description: "lets-image-converter.formatDescription",
      key: "format",
      value: "avifq60",
      options: {
        avifq60: "lets-image-converter.formatAvifQ60",
        avifq80: "lets-image-converter.formatAvifQ80",
        webpq60: "lets-image-converter.formatWebpQ60",
        webpq80: "lets-image-converter.formatWebpQ80",
      },
    },
    {
      type: "slider",
      title: "lets-image-converter.qualityTitle",
      description: "lets-image-converter.qualityDescription",
      key: "quality",
      value: 60,
      slider: { min: 1, max: 100, step: 1 },
    },
  ],
};

export default pluginMetadata;

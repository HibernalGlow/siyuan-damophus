import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "calloutTools",
  displayName: "lets-callout-tools.displayName",
  description: "lets-callout-tools.description",
  version: "1.0.0",
  enabled: true,
  icon: "messageSquareText",
  settings: [
    {
      type: "checkbox",
      title: "lets-callout-tools.smartInsertTitle",
      description: "lets-callout-tools.smartInsertDescription",
      key: "smartInsert",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-callout-tools.blockMenuConversionTitle",
      description: "lets-callout-tools.blockMenuConversionDescription",
      key: "blockMenuConversion",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-callout-tools.promoteHeadingTitle",
      description: "lets-callout-tools.promoteHeadingDescription",
      key: "promoteHeadingToTitle",
      value: true,
    },
  ],
};

export default pluginMetadata;

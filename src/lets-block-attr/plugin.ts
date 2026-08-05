import type { PluginMetadata } from "@/types/plugin";
import {
  DEFAULT_CUSTOM_PROPERTIES,
  DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
} from "./custom-properties";

export const pluginMetadata: PluginMetadata = {
  name: "quickAttr",
  displayName: "lets-block-attr.displayName",
  description: "lets-block-attr.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "textarea",
      title: "lets-block-attr.customPropertiesTitle",
      description: "lets-block-attr.customPropertiesDescription",
      key: "customProperties",
      value: DEFAULT_CUSTOM_PROPERTIES,
      placeholder: `custom-qb-id|qb-id\ncustom-qb-type|qb-type`,
      height: "220px",
    },
    {
      type: "textarea",
      title: "lets-block-attr.customPropertyBlockTypesTitle",
      description: "lets-block-attr.customPropertyBlockTypesDescription",
      key: "customPropertyBlockTypes",
      value: DEFAULT_CUSTOM_PROPERTY_BLOCK_TYPES,
      placeholder: `NodeDocument\nNodeHeading\nNodeParagraph`,
      height: "180px",
    },
  ],
};

export default pluginMetadata;

import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

export const pluginMetadata: PluginMetadata = {
  name: "tagConvert",
  displayName: "lets-tag-convert.displayName",
  description: "lets-tag-convert.description",
  version: "1.0.0",
  enabled: false,
  icon: "tags",
  settings: [
    ...createEntrySettings({ menu: true, contextMenu: true, command: true }, { central: true }),
    {
      type: "select",
      title: "lets-tag-convert.formatTitle",
      description: "lets-tag-convert.formatDescription",
      key: "targetFormat",
      value: "plain",
      options: {
        plain: "lets-tag-convert.formatPlain",
        code: "lets-tag-convert.formatCode",
      },
    },
    {
      type: "textinput",
      title: "lets-tag-convert.leftWrapTitle",
      description: "lets-tag-convert.leftWrapDescription",
      key: "leftWrap",
      value: "",
    },
    {
      type: "textinput",
      title: "lets-tag-convert.rightWrapTitle",
      description: "lets-tag-convert.rightWrapDescription",
      key: "rightWrap",
      value: "",
    },
  ],
};

export default pluginMetadata;

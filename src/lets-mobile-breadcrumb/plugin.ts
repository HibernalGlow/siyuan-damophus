import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "mobileBreadcrumb",
  displayName: "lets-mobile-breadcrumb.displayName",
  description: "lets-mobile-breadcrumb.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "select",
      title: "lets-mobile-breadcrumb.priorityTitle",
      description: "lets-mobile-breadcrumb.priorityDescription",
      key: "overflowPriority",
      value: "tail",
      options: {
        tail: "lets-mobile-breadcrumb.priorityTail",
        head: "lets-mobile-breadcrumb.priorityHead",
      },
    },
    {
      type: "select",
      title: "lets-mobile-breadcrumb.textDisplayModeTitle",
      description: "lets-mobile-breadcrumb.textDisplayModeDescription",
      key: "textDisplayMode",
      value: "full",
      options: {
        full: "lets-mobile-breadcrumb.textDisplayModeFull",
        characters: "lets-mobile-breadcrumb.textDisplayModeCharacters",
        width: "lets-mobile-breadcrumb.textDisplayModeWidth",
      },
    },
    {
      type: "number",
      title: "lets-mobile-breadcrumb.maxCharactersTitle",
      description: "lets-mobile-breadcrumb.maxCharactersDescription",
      key: "maxCharacters",
      value: 16,
    },
    {
      type: "number",
      title: "lets-mobile-breadcrumb.maxTextWidthTitle",
      description: "lets-mobile-breadcrumb.maxTextWidthDescription",
      key: "maxTextWidth",
      value: 160,
    },
  ],
};

export default pluginMetadata;

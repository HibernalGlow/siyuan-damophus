import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "documentFormat",
  displayName: "lets-document-format.displayName",
  description: "lets-document-format.description",
  version: "1.0.0",
  enabled: false,
  icon: "sparkles",
  settings: [
    ...createEntrySettings({ menu: true, contextMenu: true, command: true }, { central: true }),
    {
      type: "checkbox",
      title: "lets-document-format.enableEmptyParagraphCleanup",
      description: "lets-document-format.enableEmptyParagraphCleanupDescription",
      key: "enableEmptyParagraphCleanup",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-document-format.enableSelfReferenceCleanup",
      description: "lets-document-format.enableSelfReferenceCleanupDescription",
      key: "enableSelfReferenceCleanup",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-document-format.enableEmptyContainerCleanup",
      description: "lets-document-format.enableEmptyContainerCleanupDescription",
      key: "enableEmptyContainerCleanup",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-document-format.enableCodeBlankLineCleanup",
      description: "lets-document-format.enableCodeBlankLineCleanupDescription",
      key: "enableCodeBlankLineCleanup",
      value: true,
    },
  ],
};

export default pluginMetadata;

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
  ],
};

export default pluginMetadata;

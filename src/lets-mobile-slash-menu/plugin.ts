import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "mobileSlashMenu",
  displayName: "lets-mobile-slash-menu.displayName",
  description: "lets-mobile-slash-menu.description",
  version: "1.0.0",
  enabled: false,
  icon: "gripVertical",
  settings: [
    {
      type: "checkbox",
      title: "lets-mobile-slash-menu.mobileEnabledTitle",
      description: "lets-mobile-slash-menu.mobileEnabledDescription",
      key: "mobileEnabled",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-mobile-slash-menu.desktopEnabledTitle",
      description: "lets-mobile-slash-menu.desktopEnabledDescription",
      key: "desktopEnabled",
      value: false,
    },
    {
      type: "textarea",
      title: "lets-mobile-slash-menu.mobileMenuConfigTitle",
      description: "lets-mobile-slash-menu.menuConfigStorageDescription",
      key: "mobileMenuConfig",
      value: "[]",
      height: "80px",
    },
    {
      type: "textarea",
      title: "lets-mobile-slash-menu.desktopMenuConfigTitle",
      description: "lets-mobile-slash-menu.menuConfigStorageDescription",
      key: "desktopMenuConfig",
      value: "[]",
      height: "80px",
    },
    {
      type: "textarea",
      title: "lets-mobile-slash-menu.menuCatalogTitle",
      description: "lets-mobile-slash-menu.menuCatalogDescription",
      key: "menuCatalog",
      value: "[]",
      height: "80px",
    },
  ],
};

export default pluginMetadata;

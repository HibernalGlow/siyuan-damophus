import type { PluginMetadata } from "@/types/plugin";

export const pluginMetadata: PluginMetadata = {
  name: "mobileAppearance",
  displayName: "lets-mobile-appearance.displayName",
  description: "lets-mobile-appearance.description",
  version: "1.0.0",
  enabled: false,
  icon: "sunMoon",
  legacyEnabledSetting: "showMobileAppearanceShortcut",
  settings: [
    {
      type: "checkbox",
      title: "lets-mobile-appearance.topBarShortcutTitle",
      description: "lets-mobile-appearance.topBarShortcutDescription",
      key: "topBarShortcut",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-mobile-appearance.titlePathTitle",
      description: "lets-mobile-appearance.titlePathDescription",
      key: "titlePath",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-mobile-appearance.toolbarActionsTitle",
      description: "lets-mobile-appearance.toolbarActionsDescription",
      key: "toolbarActions",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-mobile-appearance.outlineThemeTitle",
      description: "lets-mobile-appearance.outlineThemeDescription",
      key: "outlineTheme",
      value: true,
    },
  ],
};

export default pluginMetadata;

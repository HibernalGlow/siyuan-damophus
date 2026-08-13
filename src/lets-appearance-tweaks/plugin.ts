import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "appearanceTweaks",
  displayName: "lets-appearance-tweaks.displayName",
  description: "lets-appearance-tweaks.description",
  version: "1.0.0",
  enabled: false,
  icon: "palette",
  settings: [
    { type: "checkbox", title: "lets-appearance-tweaks.browserMobileFontSizeTitle", description: "lets-appearance-tweaks.browserMobileFontSizeDescription", key: "browserMobileFontSize", value: false },
    { type: "slider", title: "lets-appearance-tweaks.browserMobileEditorFontSizeTitle", description: "lets-appearance-tweaks.browserMobileEditorFontSizeDescription", key: "browserMobileEditorFontSize", value: 18, slider: { min: 9, max: 72, step: 1 } },
    { type: "checkbox", title: "lets-appearance-tweaks.workspaceTitle", description: "lets-appearance-tweaks.workspaceDescription", key: "workspace", value: true },
    { type: "checkbox", title: "lets-appearance-tweaks.hideDockSplitTitle", description: "lets-appearance-tweaks.hideDockSplitDescription", key: "hideDockSplit", value: true },
    { type: "checkbox", title: "lets-appearance-tweaks.tagsTitle", description: "lets-appearance-tweaks.tagsDescription", key: "tags", value: true },
    { type: "slider", title: "lets-appearance-tweaks.tagFontSizeTitle", description: "lets-appearance-tweaks.tagFontSizeDescription", key: "tagFontSize", value: 90, slider: { min: 70, max: 120, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.tagRadiusTitle", description: "lets-appearance-tweaks.tagRadiusDescription", key: "tagRadius", value: 3, slider: { min: 0, max: 12, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.tagPaddingXTitle", description: "lets-appearance-tweaks.tagPaddingXDescription", key: "tagPaddingX", value: 6, slider: { min: 0, max: 12, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.tagPaddingBottomTitle", description: "lets-appearance-tweaks.tagPaddingBottomDescription", key: "tagPaddingBottom", value: 2, slider: { min: 0, max: 6, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.tagColorTitle", description: "lets-appearance-tweaks.tagColorDescription", key: "tagColor", value: 7, slider: { min: 1, max: 13, step: 1 } },
    { type: "checkbox", title: "lets-appearance-tweaks.referencesTitle", description: "lets-appearance-tweaks.referencesDescription", key: "references", value: true },
    { type: "slider", title: "lets-appearance-tweaks.referenceFontSizeTitle", description: "lets-appearance-tweaks.referenceFontSizeDescription", key: "referenceFontSize", value: 65, slider: { min: 50, max: 100, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.referenceRadiusTitle", description: "lets-appearance-tweaks.referenceRadiusDescription", key: "referenceRadius", value: 5, slider: { min: 0, max: 12, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.referencePaddingXTitle", description: "lets-appearance-tweaks.referencePaddingXDescription", key: "referencePaddingX", value: 3, slider: { min: 0, max: 10, step: 1 } },
    { type: "slider", title: "lets-appearance-tweaks.referencePaddingYTitle", description: "lets-appearance-tweaks.referencePaddingYDescription", key: "referencePaddingY", value: 1, slider: { min: 0, max: 6, step: 1 } },
    { type: "select", title: "lets-appearance-tweaks.referenceColorModeTitle", description: "lets-appearance-tweaks.referenceColorModeDescription", key: "referenceColorMode", value: "inverse", options: { inverse: "lets-appearance-tweaks.referenceColorInverse", accent: "lets-appearance-tweaks.referenceColorAccent" } },
  ],
};

export default pluginMetadata;

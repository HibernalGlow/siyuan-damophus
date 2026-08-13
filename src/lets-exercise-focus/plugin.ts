import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "exerciseFocus",
  displayName: "lets-exercise-focus.displayName",
  description: "lets-exercise-focus.description",
  version: "1.0.0",
  enabled: false,
  icon: "graduationCap",
  settings: [
    {
      type: "checkbox",
      title: "lets-exercise-focus.modeEnabledTitle",
      description: "lets-exercise-focus.modeEnabledDescription",
      key: "modeEnabled",
      value: false,
    },
    {
      type: "textinput",
      title: "lets-exercise-focus.headingTextTitle",
      description: "lets-exercise-focus.headingTextDescription",
      key: "headingText",
      value: "\u4e60\u9898",
    },
    {
      type: "select",
      title: "lets-exercise-focus.headingLevelTitle",
      description: "lets-exercise-focus.headingLevelDescription",
      key: "headingLevel",
      value: "h6",
      options: {
        h1: "lets-exercise-focus.level1",
        h2: "lets-exercise-focus.level2",
        h3: "lets-exercise-focus.level3",
        h4: "lets-exercise-focus.level4",
        h5: "lets-exercise-focus.level5",
        h6: "lets-exercise-focus.level6",
      },
    },
    {
      type: "blockTypes",
      title: "lets-exercise-focus.visibleBlockTypesTitle",
      description: "lets-exercise-focus.visibleBlockTypesDescription",
      key: "visibleBlockTypes",
      value: ["NodeCodeBlock"],
    },
    {
      type: "slider",
      title: "lets-exercise-focus.maskHeightTitle",
      description: "lets-exercise-focus.maskHeightDescription",
      key: "maskHeight",
      value: 72,
      slider: { min: 48, max: 160, step: 8 },
    },
  ],
};

export default pluginMetadata;

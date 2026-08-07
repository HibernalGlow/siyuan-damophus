import type { PluginMetadata } from "@/types/plugin";

const pluginMetadata: PluginMetadata = {
  name: "kramdownExport",
  displayName: "lets-kramdown-export.displayName",
  description: "lets-kramdown-export.description",
  version: "1.0.0",
  enabled: true,
  settings: [
    {
      type: "select",
      title: "lets-kramdown-export.ialModeTitle",
      description: "lets-kramdown-export.ialModeDescription",
      key: "ialMode",
      value: "portable",
      options: {
        portable: "lets-kramdown-export.ialModePortable",
        all: "lets-kramdown-export.ialModeAll",
        none: "lets-kramdown-export.ialModeNone",
      },
    },
    {
      type: "textinput",
      title: "lets-kramdown-export.ialIncludeTitle",
      description: "lets-kramdown-export.ialIncludeDescription",
      key: "ialInclude",
      value: "",
    },
    {
      type: "textinput",
      title: "lets-kramdown-export.ialExcludeTitle",
      description: "lets-kramdown-export.ialExcludeDescription",
      key: "ialExclude",
      value: "",
    },
  ],
};

export default pluginMetadata;

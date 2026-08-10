import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "../libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "agentSurface",
  displayName: "lets-agent-surface.displayName",
  description: "lets-agent-surface.description",
  version: "1.0.0",
  enabled: true,
  icon: "sparkles",
  settings: [
    ...createEntrySettings({ menu: true, tab: true }, { central: true }),
    {
      type: "select",
      title: "lets-agent-surface.displayModeTitle",
      description: "lets-agent-surface.displayModeDescription",
      key: "displayMode",
      value: "tab",
      options: {
        floating: "lets-agent-surface.displayModeFloating",
        tab: "lets-agent-surface.displayModeTab",
      },
    },
    {
      type: "checkbox",
      title: "lets-agent-surface.interceptAddToAgentTitle",
      description: "lets-agent-surface.interceptAddToAgentDescription",
      key: "interceptAddToAgent",
      value: true,
    },
  ],
};

export default pluginMetadata;

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
      type: "checkbox",
      title: "lets-agent-surface.openInNewTabTitle",
      description: "lets-agent-surface.openInNewTabDescription",
      key: "openInNewTab",
      value: true,
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

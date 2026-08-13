import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "snippetAudit",
  displayName: "lets-snippet-audit.displayName",
  description: "lets-snippet-audit.description",
  version: "1.0.0",
  enabled: false,
  icon: "boxes",
  settings: [
    ...createEntrySettings({ menu: true, tab: true }, { central: true }),
  ],
};

export default pluginMetadata;

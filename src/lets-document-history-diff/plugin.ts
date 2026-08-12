import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "documentHistoryDiff",
  displayName: "lets-document-history-diff.displayName",
  description: "lets-document-history-diff.description",
  version: "1.0.0",
  enabled: true,
  icon: "film",
  settings: [
    ...createEntrySettings({ menu: true, command: true }, { central: true }),
  ],
};

export default pluginMetadata;

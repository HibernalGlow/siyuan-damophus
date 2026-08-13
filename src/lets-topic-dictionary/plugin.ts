import type { PluginIconName } from "../libs/plugin-icons";
import { createEntrySettings } from "../libs/plugin-entry-settings";
import type { PluginMetadata } from "../types/plugin";

export const topicDictionaryAppearance = {
  displayName: "lets-topic-dictionary.displayName",
  icon: "bookA",
} as const satisfies {displayName: string; icon: PluginIconName};

const pluginMetadata: PluginMetadata = {
  name: "topicDictionary",
  displayName: topicDictionaryAppearance.displayName,
  description: "lets-topic-dictionary.description",
  version: "1.0.0",
  enabled: false,
  icon: topicDictionaryAppearance.icon,
  settings: [
    ...createEntrySettings({menu: true, dock: true, command: true, tab: true}, {central: true}),
    {
      type: "checkbox",
      title: "lets-topic-dictionary.autoScanOnOpenTitle",
      description: "lets-topic-dictionary.autoScanOnOpenDescription",
      key: "autoScanOnOpen",
      value: false,
    },
  ],
};

export default pluginMetadata;

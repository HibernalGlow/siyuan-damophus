import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "@/libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "flashcard",
  displayName: "lets-flashcard.displayName",
  description: "lets-flashcard.description",
  version: "1.0.0",
  author: "HibernalGlow",
  enabled: true,
  icon: "layers",
  settings: [
    ...createEntrySettings({
      menu: true,
      command: true,
      tab: true,
    }, { central: true }),
    {
      type: "button",
      title: "lets-flashcard.openSettings",
      description: "lets-flashcard.openSettingsDescription",
      key: "openSettingsButton",
      value: "lets-flashcard.openSettings",
    },
  ],
};

export default pluginMetadata;

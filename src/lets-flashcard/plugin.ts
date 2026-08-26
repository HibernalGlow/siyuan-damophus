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
      contextMenu: true,
      command: true,
      desktopDock: true,
      mobileDock: true,
      tab: true,
    }, { central: true }),
  ],
};

export default pluginMetadata;

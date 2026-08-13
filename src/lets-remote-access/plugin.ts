import type { PluginMetadata } from "@/types/plugin";
import { createEntrySettings } from "../libs/plugin-entry-settings";

const pluginMetadata: PluginMetadata = {
  name: "remoteAccess",
  displayName: "lets-remote-access.displayName",
  description: "lets-remote-access.description",
  version: "1.0.0",
  enabled: false,
  icon: "plug",
  settings: [
    ...createEntrySettings({ menu: true, command: true }, { central: true }),
    {
      type: "textinput",
      title: "lets-remote-access.publicHost",
      description: "lets-remote-access.publicHostDescription",
      key: "publicHost",
      value: "",
      placeholder: "lets-remote-access.publicHostPlaceholder",
    },
  ],
};

export default pluginMetadata;

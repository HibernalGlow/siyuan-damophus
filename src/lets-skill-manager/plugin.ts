import type { PluginMetadata } from "@/types/plugin";
import type { PluginIconName } from "@/libs/plugin-icons";
import { createEntrySettings } from "../libs/plugin-entry-settings";

export const skillManagerAppearance = {
  displayName: "lets-skill-manager.displayName",
  icon: "brain",
} as const satisfies { displayName: string; icon: PluginIconName };

const pluginMetadata: PluginMetadata = {
  name: "skillManager",
  displayName: skillManagerAppearance.displayName,
  description: "lets-skill-manager.description",
  version: "1.0.0",
  enabled: false,
  icon: skillManagerAppearance.icon,
  settings: [
    ...createEntrySettings({ menu: true, dock: true, command: true, tab: true }, { central: true }),
    {
      type: "select",
      title: "lets-skill-manager.syncBackendTitle",
      description: "lets-skill-manager.syncBackendDescription",
      key: "syncBackend",
      value: "chezmoi",
      options: {
        chezmoi: "lets-skill-manager.syncBackendChezmoi",
        builtin: "lets-skill-manager.syncBackendBuiltin",
      },
    },
    {
      type: "textinput",
      title: "lets-skill-manager.chezmoiCommandTitle",
      description: "lets-skill-manager.chezmoiCommandDescription",
      key: "chezmoiCommand",
      value: "chezmoi",
      placeholder: "chezmoi",
    },
    {
      type: "textinput",
      title: "lets-skill-manager.sourceRootTitle",
      description: "lets-skill-manager.sourceRootDescription",
      key: "sourceRoot",
      value: "",
      placeholder: "~/.skills-manager/skills",
    },
    {
      type: "checkbox",
      title: "lets-skill-manager.detectUpdatesTitle",
      description: "lets-skill-manager.detectUpdatesDescription",
      key: "detectUpdates",
      value: true,
    },
    {
      type: "checkbox",
      title: "lets-skill-manager.syncOnStartupTitle",
      description: "lets-skill-manager.syncOnStartupDescription",
      key: "syncOnStartup",
      value: false,
    },
    {
      type: "select",
      title: "lets-skill-manager.updateModeTitle",
      description: "lets-skill-manager.updateModeDescription",
      key: "updateMode",
      value: "changed",
      options: {
        changed: "lets-skill-manager.updateModeChanged",
        all: "lets-skill-manager.updateModeAll",
      },
    },
  ],
};

export default pluginMetadata;

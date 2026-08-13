import { globalCommand } from "siyuan";
import type { Config, Plugin } from "siyuan";
import { plugin } from "@/utils";
import {
  editorCategoryLabel,
  pluginCommandLabel,
  systemCommandLabel,
  type ActionKind,
  type ActionRuntime,
} from "./actions";

export interface CommandOption {
  value: string;
  label: string;
  available: boolean;
}

/**
 * The subset of the global `window.siyuan` state that layout actions reads,
 * typed from the official siyuan package shapes instead of duplicating them.
 */
interface SiyuanRuntimeState {
  languages?: Record<string, string>;
  config?: { keymap?: Config.IKeymap };
  ws?: { app?: { plugins?: Plugin[] } };
}

function siyuanState(): SiyuanRuntimeState {
  return (window.siyuan ?? {}) as SiyuanRuntimeState;
}

export function collectCommandOptions(): Record<ActionKind, CommandOption[]> {
  const siyuan = siyuanState();
  const languages = siyuan.languages;

  const system = Object.keys(siyuan.config?.keymap?.general ?? {}).map((key) => ({
    value: key,
    label: systemCommandLabel(languages, key),
    available: true,
  }));

  const editor = Object.entries(
    (siyuan.config?.keymap?.editor ?? {}) as Record<string, Record<string, Config.IKey>>,
  ).flatMap(([category, commands]) =>
    Object.entries(commands).map(([key, keymap]) => ({
      value: `editor::${category}::${key}`,
      label: `${systemCommandLabel(languages, key)} (${editorCategoryLabel(languages, category)})`,
      available: Boolean(keymap.custom),
    })),
  );

  const pluginCommands = (siyuan.ws?.app?.plugins ?? []).flatMap((item) =>
    (item.commands ?? []).map((command) => ({
      value: `plugin::${item.name}::${command.langKey}`,
      label: `${item.displayName || item.name}: ${pluginCommandLabel(item, command)}`,
      available: Boolean(command.callback || command.globalCallback),
    })),
  );

  return {
    system: system.sort((left, right) => left.label.localeCompare(right.label)),
    plugin: pluginCommands.sort((left, right) => left.label.localeCompare(right.label)),
    editor: editor.sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function createActionRuntime(): ActionRuntime {
  return {
    executeSystem(command) {
      globalCommand(command, plugin.app);
    },
    executePlugin(pluginName, commandKey) {
      const target = (siyuanState().ws?.app?.plugins ?? []).find((item) => item.name === pluginName);
      const command = target?.commands?.find((item) =>
        item.langKey === commandKey || item.customHotkey === commandKey,
      );
      if (command?.callback) {
        command.callback();
        return true;
      }
      if (command?.globalCallback) {
        command.globalCallback();
        return true;
      }
      return false;
    },
    getEditorHotkey(category, commandKey) {
      const editor = (siyuanState().config?.keymap?.editor ?? {}) as Record<string, Record<string, Config.IKey>>;
      const direct = editor[category]?.[commandKey]?.custom;
      if (direct) return direct;
      for (const [otherCategory, commands] of Object.entries(editor)) {
        if (otherCategory === category) continue;
        const fallback = commands[commandKey]?.custom;
        if (fallback) return fallback;
      }
      return undefined;
    },
    simulateHotkey,
  };
}

export function simulateHotkey(hotkey: string): void {
  if (!hotkey) return;
  const ctrlKey = hotkey.includes("⌃") || hotkey.includes("Ctrl+");
  const metaKey = hotkey.includes("⌘");
  const shiftKey = hotkey.includes("⇧") || hotkey.includes("Shift+");
  const altKey = hotkey.includes("⌥") || hotkey.includes("Alt+");
  const key = hotkey.replace(/(⌘|⇧|⌥|⌃|Ctrl\+|Shift\+|Alt\+)/gu, "").trim();
  const event = new KeyboardEvent("keydown", {
    key,
    ctrlKey,
    metaKey,
    shiftKey,
    altKey,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(event);
}

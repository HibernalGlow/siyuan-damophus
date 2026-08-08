import { globalCommand } from "siyuan";
import { plugin } from "@/utils";
import type { ActionKind, ActionRuntime } from "./actions";

export interface CommandOption {
  value: string;
  label: string;
  available: boolean;
}

type SiyuanWindow = Window & {
  siyuan?: {
    languages?: Record<string, string>;
    config?: {
      keymap?: {
        general?: Record<string, unknown>;
        editor?: Record<string, Record<string, { custom?: string }>>;
      };
    };
    ws?: {
      app?: {
        plugins?: Array<{
          name: string;
          displayName?: string;
          commands?: Array<{
            langKey: string;
            langText?: string;
            customHotkey?: string;
            callback?: () => void;
            globalCallback?: () => void;
          }>;
        }>;
      };
    };
  };
};

function siyuanWindow(): SiyuanWindow {
  return window as SiyuanWindow;
}

export function collectCommandOptions(): Record<ActionKind, CommandOption[]> {
  const siyuan = siyuanWindow().siyuan;
  const languages = siyuan?.languages ?? {};
  const system = Object.keys(siyuan?.config?.keymap?.general ?? {}).map((key) => ({
    value: key,
    label: languages[key] || key,
    available: true,
  }));

  const editor = Object.entries(siyuan?.config?.keymap?.editor ?? {}).flatMap(([category, commands]) =>
    Object.entries(commands).map(([key, keymap]) => ({
      value: `editor::${category}::${key}`,
      label: `${languages[key] || key} (${category})`,
      available: Boolean(keymap.custom),
    })),
  );

  const pluginCommands = (siyuan?.ws?.app?.plugins ?? []).flatMap((item) =>
    (item.commands ?? []).map((command) => ({
      value: `plugin::${item.name}::${command.langKey}`,
      label: `${item.displayName || item.name}: ${command.langText || command.langKey}`,
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
      const target = (siyuanWindow().siyuan?.ws?.app?.plugins ?? []).find((item) => item.name === pluginName);
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
      const editor = siyuanWindow().siyuan?.config?.keymap?.editor;
      const direct = editor?.[category]?.[commandKey]?.custom;
      if (direct) return direct;
      for (const [otherCategory, commands] of Object.entries(editor ?? {})) {
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

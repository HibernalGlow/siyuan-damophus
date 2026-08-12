import type { ICommand, Menu } from "siyuan";
import { showMessage } from "siyuan";
import { SubPluginBase } from "../libs/sub-plugin-base";
import { getLogger } from "@/libs/logger";
import { plugin } from "../utils";
import { copyText } from "./interaction";
import {
  PublicHostCache,
  readHostConfig,
  readServePort,
  resolveRemoteAccess,
} from "./remote-access";

const log = getLogger("lets-remote-access");
const COPY_COMMAND_LANG_KEY = "lets-remote-access.copyRemoteUrl" as const;

export default class RemoteAccessPlugin extends SubPluginBase {
  private commandRegistered = false;
  private readonly cache = new PublicHostCache();

  override onload(): void {
    this.syncCommand();
  }

  onDataChanged(): void {
    this.syncCommand();
  }

  override onunload(): void {
    this.removeCommand();
    this.cache.invalidate();
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu")) return;
    menu.addItem({
      icon: "iconLink",
      label: this.t(COPY_COMMAND_LANG_KEY),
      click: () => void this.copyRemoteUrl(),
    });
  }

  private syncCommand(): void {
    if (this.isEntryEnabled("command")) {
      if (!this.commandRegistered) this.registerCommand();
    } else {
      this.removeCommand();
    }
  }

  private registerCommand(): void {
    if (this.commandRegistered) return;
    const command: ICommand = {
      langKey: COPY_COMMAND_LANG_KEY,
      hotkey: "",
      callback: () => void this.copyRemoteUrl(),
    };
    plugin.addCommand(command);
    this.commandRegistered = true;
  }

  private removeCommand(): void {
    if (!this.commandRegistered) return;
    for (let index = plugin.commands.length - 1; index >= 0; index -= 1) {
      if (plugin.commands[index]?.langKey === COPY_COMMAND_LANG_KEY) {
        plugin.commands.splice(index, 1);
      }
    }
    this.commandRegistered = false;
  }

  async copyRemoteUrl(): Promise<void> {
    try {
      const resolution = await resolveRemoteAccess(readHostConfig(), {
        manualHost: String(this.getSetting("publicHost") ?? ""),
        locationPort: readServePort(),
        cache: this.cache,
      });
      if (!resolution.plan.serveEnabled) {
        showMessage(this.t("lets-remote-access.serveDisabledMessage"), 5000, "error");
        return;
      }
      if (!resolution.remoteUrl) {
        showMessage(this.t("lets-remote-access.detectFailedMessage"), 5000, "error");
        return;
      }
      await copyText(resolution.remoteUrl);
      showMessage(
        `${this.t("lets-remote-access.copiedMessage")}: ${resolution.remoteUrl}`,
        3000,
      );
    } catch (error) {
      log.warn("copy failed", error);
      showMessage(this.t("lets-remote-access.copyFailedMessage"), 5000, "error");
    }
  }
}

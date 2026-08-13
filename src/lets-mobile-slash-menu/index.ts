import { getFrontend } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { MobileSlashMenuShortcut } from "./mobile-slash-menu";

export function supportsMobileSlashMenu(frontend: string): boolean {
  return frontend === "mobile" || frontend === "browser-mobile";
}

export default class MobileSlashMenuPlugin extends SubPluginBase {
  private shortcut?: MobileSlashMenuShortcut;

  override onload(): void {
    if (!supportsMobileSlashMenu(getFrontend())) return;
    this.shortcut ??= new MobileSlashMenuShortcut();
    this.shortcut.start(this.t("lets-mobile-slash-menu.buttonLabel"));
  }

  override onunload(): void {
    this.shortcut?.stop();
    this.shortcut = undefined;
  }
}

import { getFrontend } from "siyuan";
import type { IEventBusMap } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { MobileSlashMenuShortcut } from "./mobile-slash-menu";

export function supportsMobileSlashMenu(frontend: string): boolean {
  return ["mobile", "browser-mobile", "desktop", "browser-desktop"].includes(frontend);
}

export function isMobileSlashMenuFrontend(frontend: string): boolean {
  return frontend === "mobile" || frontend === "browser-mobile";
}

export default class MobileSlashMenuPlugin extends SubPluginBase {
  private shortcut?: MobileSlashMenuShortcut;
  private listening = false;
  private frontend = "";
  private surfaceEnabled = false;

  private readonly handleProtyle = (
    event: CustomEvent<
      IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["loaded-protyle-dynamic"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    if (this.surfaceEnabled) this.shortcut?.attach(event.detail.protyle);
    else this.shortcut?.scan(event.detail.protyle);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.shortcut?.detach(event.detail.protyle);
  };

  override onload(): void {
    this.frontend = getFrontend();
    this.applySettings();
  }

  onLayoutReady(): void {
    this.applySettings();
  }

  onDataChanged(): void {
    this.applySettings();
  }

  refreshCatalog(): string | undefined {
    this.frontend ||= getFrontend();
    this.ensureShortcut(isMobileSlashMenuFrontend(this.frontend));
    return this.shortcut?.scanEditors();
  }

  override onunload(): void {
    this.stopShortcut();
  }

  private applySettings(): void {
    if (!supportsMobileSlashMenu(this.frontend)) return;
    const mobile = isMobileSlashMenuFrontend(this.frontend);
    this.surfaceEnabled = mobile
      ? this.getSetting("mobileEnabled") !== false
      : this.getSetting("desktopEnabled") === true;
    this.ensureShortcut(mobile);
    this.bindEvents();
    if (!this.surfaceEnabled) {
      this.shortcut?.scanEditors();
      this.shortcut?.stop();
      return;
    }
    this.shortcut?.start(this.t("lets-mobile-slash-menu.buttonLabel"));
  }

  private ensureShortcut(mobile: boolean): void {
    this.shortcut ??= new MobileSlashMenuShortcut(
      document,
      undefined,
      {
        enableDirectSlash: mobile,
        getConfig: () => String(this.getSetting(mobile ? "mobileMenuConfig" : "desktopMenuConfig") ?? "[]"),
        onDiscovered: (value) => this.setSetting(mobile ? "mobileMenuConfig" : "desktopMenuConfig", value),
        getCatalog: () => String(this.getSetting("menuCatalog") ?? "[]"),
        onCatalog: (value) => this.setSetting("menuCatalog", value),
      },
    );
  }

  private stopShortcut(): void {
    this.unbindEvents();
    this.shortcut?.stop();
    this.shortcut = undefined;
  }

  private bindEvents(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.on("loaded-protyle-dynamic", this.handleProtyle);
    plugin.eventBus.on("switch-protyle", this.handleProtyle);
    plugin.eventBus.on("destroy-protyle", this.handleProtyleDestroyed);
  }

  private unbindEvents(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.off("loaded-protyle-dynamic", this.handleProtyle);
    plugin.eventBus.off("switch-protyle", this.handleProtyle);
    plugin.eventBus.off("destroy-protyle", this.handleProtyleDestroyed);
  }
}

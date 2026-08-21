import { SubPluginBase } from "../libs/sub-plugin-base";
import { plugin } from "../utils";
import { openMobileAppearanceMenu } from "./appearance-menu";
import { MobileOutlineThemeCompatibility } from "./mobile-outline-theme";
import { MobileTitlePath } from "./mobile-title-path";
import { type IEventBusMap } from "siyuan";

export default class MobileAppearancePlugin extends SubPluginBase {
  private topBarElement?: HTMLElement;
  private listening = false;
  private syncTimer?: number;
  private readonly titlePath = new MobileTitlePath();
  private readonly outlineTheme = new MobileOutlineThemeCompatibility();
  private readonly handleProtyle = (event: CustomEvent<IEventBusMap["loaded-protyle-static"] | IEventBusMap["switch-protyle"]>): void => {
    void this.titlePath.show(event.detail.protyle);
  };

  override onLayoutReady(): void {
    if (!this.isMobileFrontend()) return;
    this.applySettings();
  }

  onDataChanged(): void {
    if (!this.isMobileFrontend()) return;
    this.applySettings();
  }

  override onunload(): void {
    this.removeTopBar();
    this.stopTitlePath();
    this.stopOutlineTheme();
  }

  private applySettings(): void {
    const isTopBarEnabled = this.getSetting?.("topBarShortcut") ?? true;
    const isTitlePathEnabled = this.getSetting?.("titlePath") ?? true;
    const isOutlineThemeEnabled = this.getSetting?.("outlineTheme") ?? true;

    if (isTopBarEnabled) {
      this.ensureTopBar();
    } else {
      this.removeTopBar();
    }

    if (isTitlePathEnabled) {
      this.startTitlePath();
    } else {
      this.stopTitlePath();
    }

    if (isOutlineThemeEnabled) {
      this.outlineTheme.start();
    } else {
      this.stopOutlineTheme();
    }
  }

  private ensureTopBar(): void {
    if (this.topBarElement) return;
    const title = window.siyuan?.languages?.appearanceMode ?? "Appearance mode";
    this.topBarElement = plugin.addTopBar({
      icon: "iconTheme",
      title,
      position: "right",
      callback: openMobileAppearanceMenu,
    });
  }

  private removeTopBar(): void {
    this.topBarElement?.remove();
    this.topBarElement = undefined;
  }

  private startTitlePath(): void {
    this.titlePath.start();
    void this.titlePath.showCardsFromDatabase();
    window.setTimeout(() => {
      void this.titlePath.showCardsFromDatabase();
    }, 500);
    this.syncTimer ??= window.setInterval(() => {
      void this.titlePath.showAll(getAllEditor() as never);
    }, 1000);
    if (!this.listening && plugin.eventBus) {
      this.listening = true;
      plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
      plugin.eventBus.on("switch-protyle", this.handleProtyle);
    }
  }

  private stopTitlePath(): void {
    if (this.syncTimer !== undefined) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = undefined;
    }
    if (this.listening && plugin.eventBus) {
      plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
      plugin.eventBus.off("switch-protyle", this.handleProtyle);
      this.listening = false;
    }
    this.titlePath.destroy();
  }

  private stopOutlineTheme(): void {
    this.outlineTheme.destroy();
  }

  private isMobileFrontend(): boolean {
    if (typeof document === "undefined") return false;
    const frontend = document.documentElement?.dataset?.frontend;
    return frontend === "mobile" || frontend === "browser-mobile";
  }
}

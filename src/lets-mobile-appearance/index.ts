import { SubPluginBase } from "../libs/sub-plugin-base";
import { plugin } from "../utils";
import { openMobileAppearanceMenu } from "./appearance-menu";
import { MobileOutlineThemeCompatibility } from "./mobile-outline-theme";
import { MobileTitlePath } from "./mobile-title-path";
import type { IEventBusMap } from "siyuan";

export default class MobileAppearancePlugin extends SubPluginBase {
  private topBarElement?: HTMLElement;
  private listening = false;
  private readonly titlePath = new MobileTitlePath();
  private readonly outlineTheme = new MobileOutlineThemeCompatibility();
  private readonly handleProtyle = (event: CustomEvent<IEventBusMap["loaded-protyle-static"] | IEventBusMap["switch-protyle"]>): void => {
    void this.titlePath.show(event.detail.protyle);
  };

  override onLayoutReady(): void {
    if (!this.isMobileFrontend() || this.topBarElement) return;

    const title = window.siyuan?.languages?.appearanceMode ?? "Appearance mode";
    this.topBarElement = plugin.addTopBar({
      icon: "iconTheme",
      title,
      position: "right",
      callback: openMobileAppearanceMenu,
    });
    this.titlePath.start();
    this.outlineTheme.start();
    if (!this.listening) {
      this.listening = true;
      plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
      plugin.eventBus.on("switch-protyle", this.handleProtyle);
    }
  }

  override onunload(): void {
    this.topBarElement?.remove();
    this.topBarElement = undefined;
    if (this.listening) {
      plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
      plugin.eventBus.off("switch-protyle", this.handleProtyle);
      this.listening = false;
    }
    this.titlePath.destroy();
    this.outlineTheme.destroy();
  }

  private isMobileFrontend(): boolean {
    const frontend = document.documentElement.dataset.frontend;
    return frontend === "mobile" || frontend === "browser-mobile";
  }
}

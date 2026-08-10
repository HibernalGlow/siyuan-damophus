import { SubPluginBase } from "../libs/sub-plugin-base";
import { isMobile, plugin } from "../utils";
import { openMobileAppearanceMenu } from "./appearance-menu";

export default class MobileAppearancePlugin extends SubPluginBase {
  private topBarElement?: HTMLElement;

  override onLayoutReady(): void {
    if (!isMobile || this.topBarElement) return;

    const title = window.siyuan?.languages?.appearanceMode ?? "Appearance mode";
    this.topBarElement = plugin.addTopBar({
      icon: "iconTheme",
      title,
      position: "right",
      callback: openMobileAppearanceMenu,
    });
  }

  override onunload(): void {
    this.topBarElement?.remove();
    this.topBarElement = undefined;
  }
}

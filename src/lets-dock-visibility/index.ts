import { SubPluginBase } from "@/libs/sub-plugin-base";
import { normalizeDockPlatformMap, buildDockVisibilityCss } from "./visibility";

const STYLE_ELEMENT_ID = "damophus-dock-visibility";

export default class DockVisibilityPlugin extends SubPluginBase {
  onload(): void {
    this.applyVisibility();
  }

  onDataChanged(): void {
    this.applyVisibility();
  }

  onunload(): void {
    document.getElementById(STYLE_ELEMENT_ID)?.remove();
  }

  private applyVisibility(): void {
    let style = document.getElementById(STYLE_ELEMENT_ID) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ELEMENT_ID;
      document.head.append(style);
    }
    style.textContent = buildDockVisibilityCss(normalizeDockPlatformMap(this.getSetting("dockPlatforms")));
  }
}

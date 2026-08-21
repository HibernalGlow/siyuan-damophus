import { SubPluginBase } from "@/libs/sub-plugin-base";
import { MobileOutlineThemeCompatibility } from "./mobile-outline-theme";

export default class MobileOutlineThemePlugin extends SubPluginBase {
  private readonly compatibility = new MobileOutlineThemeCompatibility();

  override onload(): void {
    this.compatibility.start();
  }

  override onunload(): void {
    this.compatibility.destroy();
  }
}

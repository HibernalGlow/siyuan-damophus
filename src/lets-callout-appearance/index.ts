import { SubPluginBase } from "@/libs/sub-plugin-base";
import {
  CalloutAppearanceStyles,
  type CalloutAppearanceSettings,
} from "./callout-appearance";

export default class CalloutAppearancePlugin extends SubPluginBase {
  private readonly styles = new CalloutAppearanceStyles();

  override onload(): void {
    this.styles.start(this.currentSettings());
  }

  onDataChanged(): void {
    this.styles.start(this.currentSettings());
  }

  override onunload(): void {
    this.styles.destroy();
  }

  private currentSettings(): Partial<Record<keyof CalloutAppearanceSettings, unknown>> {
    if (typeof this.getSetting !== "function") return {};
    return {
      paddingTop: this.getSetting("paddingTop"),
      paddingX: this.getSetting("paddingX"),
      paddingBottom: this.getSetting("paddingBottom"),
      radius: this.getSetting("radius"),
      surfaceOpacity: this.getSetting("surfaceOpacity"),
      outlineOpacity: this.getSetting("outlineOpacity"),
      titleSize: this.getSetting("titleSize"),
      titleWeight: this.getSetting("titleWeight"),
    };
  }
}

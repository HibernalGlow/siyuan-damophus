import { SubPluginBase } from "@/libs/sub-plugin-base";
import { AppearanceTweaksStyles, type AppearanceTweaksSettings } from "./appearance-tweaks";

export default class AppearanceTweaksPlugin extends SubPluginBase {
  private readonly styles = new AppearanceTweaksStyles();

  override onload(): void { this.apply(); }
  onDataChanged(): void { this.apply(); }
  override onunload(): void { this.styles.destroy(); }

  private apply(): void {
    const settings: Partial<AppearanceTweaksSettings> = {
      browserMobileFontSize: this.getSetting("browserMobileFontSize"),
      browserMobileEditorFontSize: this.getSetting("browserMobileEditorFontSize"),
      browserDesktopFontSize: this.getSetting("browserDesktopFontSize"),
      browserDesktopEditorFontSize: this.getSetting("browserDesktopEditorFontSize"),
      workspace: this.getSetting("workspace"),
      hideDockSplit: this.getSetting("hideDockSplit"),
      tags: this.getSetting("tags"),
      references: this.getSetting("references"),
      tagFontSize: this.getSetting("tagFontSize"),
      tagRadius: this.getSetting("tagRadius"),
      tagPaddingX: this.getSetting("tagPaddingX"),
      tagPaddingBottom: this.getSetting("tagPaddingBottom"),
      tagColor: this.getSetting("tagColor"),
      referenceFontSize: this.getSetting("referenceFontSize"),
      referenceRadius: this.getSetting("referenceRadius"),
      referencePaddingX: this.getSetting("referencePaddingX"),
      referencePaddingY: this.getSetting("referencePaddingY"),
      referenceColorMode: this.getSetting("referenceColorMode"),
    };
    this.styles.start(settings);
  }
}

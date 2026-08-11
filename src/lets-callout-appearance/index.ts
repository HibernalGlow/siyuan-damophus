import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { getAllEditor, type IEventBusMap, type IProtyle } from "siyuan";
import {
  CalloutAppearanceStyles,
  type CalloutAppearanceSettings,
} from "./callout-appearance";
import { CalloutSmartInsert } from "./callout-smart-insert";

export default class CalloutAppearancePlugin extends SubPluginBase {
  private readonly styles = new CalloutAppearanceStyles();
  private readonly smartInsert = new CalloutSmartInsert();
  private layoutReady = false;
  private listening = false;

  private readonly handleProtyle = (
    event: CustomEvent<
      IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["loaded-protyle-dynamic"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    if (this.smartInsertEnabled()) this.smartInsert.attach(event.detail.protyle);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.smartInsert.detach(event.detail.protyle);
  };

  override onload(): void {
    this.styles.start(this.currentSettings());
  }

  onDataChanged(): void {
    this.styles.start(this.currentSettings());
    if (this.layoutReady) this.syncSmartInsert();
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    this.syncSmartInsert();
  }

  override onunload(): void {
    this.unbindEvents();
    this.smartInsert.dispose();
    this.styles.destroy();
    this.layoutReady = false;
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

  private syncSmartInsert(): void {
    const protyles = getAllEditor()
      .map((editor) => editor.protyle)
      .filter((protyle): protyle is IProtyle => Boolean(protyle));
    if (this.smartInsertEnabled()) {
      for (const protyle of protyles) this.smartInsert.attach(protyle);
      return;
    }
    this.smartInsert.dispose();
  }

  private smartInsertEnabled(): boolean {
    return typeof this.getSetting !== "function" || this.getSetting("smartInsert") !== false;
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

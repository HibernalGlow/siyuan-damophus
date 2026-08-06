import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { getAllEditor, type IEventBusMap } from "siyuan";
import {
  startAnimatedImageReplay,
  type AnimatedImageReplayHandle,
  type AnimatedImageReplayOptions,
} from "./animated-image-replay";

export default class AnimatedImageReplayPlugin extends SubPluginBase {
  private player?: AnimatedImageReplayHandle;
  private listening = false;
  private layoutReady = false;
  private activeOptionsSignature?: string;

  private readonly handleProtyle = (
    event: CustomEvent<
      IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["loaded-protyle-dynamic"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    this.player?.scanRoot(event.detail.protyle.element);
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    this.player?.disposeRoot(event.detail.protyle.element);
  };

  override onload(): void {
    // The editor roots do not exist reliably until SiYuan finishes its layout.
  }

  onDataChanged(): void {
    if (this.layoutReady) this.startPlayerIfNeeded();
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    this.startPlayerIfNeeded(true);
  }

  override onunload(): void {
    this.unbindEvents();
    this.player?.dispose();
    this.player = undefined;
    this.activeOptionsSignature = undefined;
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

  private startPlayerIfNeeded(force = false): void {
    const options = this.options();
    const signature = JSON.stringify(options);
    if (!force && signature === this.activeOptionsSignature) return;
    this.player?.dispose();
    this.player = startAnimatedImageReplay(options);
    this.activeOptionsSignature = signature;
    for (const editor of getAllEditor()) {
      this.player.scanRoot(editor.protyle.element);
    }
  }

  private options(): AnimatedImageReplayOptions {
    return {
      showReplayButton: this.getSetting("showReplayButton") !== false,
      replayOnHover: this.getSetting("replayOnHover") !== false,
      replayLabel: this.t("lets-animated-image-replay.replay"),
      hoverReplayDelayMs: this.settingNumber("hoverReplayDelayMs", 700, 100, 5000),
      replayBlobCacheSize: this.settingNumber("replayBlobCacheSize", 4, 1, 16),
      replayWhenOpenedLarge: this.getSetting("replayWhenOpenedLarge") !== false,
      scanDocument: false,
    };
  }

  private settingNumber(key: string, fallback: number, minimum: number, maximum: number): number {
    const value = Number(this.getSetting(key));
    if (!Number.isFinite(value)) return fallback;
    return Math.min(maximum, Math.max(minimum, Math.round(value)));
  }
}

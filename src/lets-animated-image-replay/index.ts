import { SubPluginBase } from "@/libs/sub-plugin-base";
import {
  startAnimatedImageReplay,
  type AnimatedImageReplayHandle,
} from "./animated-image-replay";

export default class AnimatedImageReplayPlugin extends SubPluginBase {
  private player?: AnimatedImageReplayHandle;

  override onload(): void {
    this.restartPlayer();
  }

  onDataChanged(): void {
    this.restartPlayer();
  }

  override onunload(): void {
    this.player?.dispose();
    this.player = undefined;
  }

  private restartPlayer(): void {
    this.player?.dispose();
    this.player = startAnimatedImageReplay({
      showReplayButton: this.getSetting("showReplayButton") !== false,
      replayOnHover: this.getSetting("replayOnHover") !== false,
      replayLabel: this.t("lets-animated-image-replay.replay"),
    });
  }
}

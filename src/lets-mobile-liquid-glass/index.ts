import { SubPluginBase } from "@/libs/sub-plugin-base";
import { MobileLiquidGlass } from "./liquid-glass";
import {
  buildMobileLiquidGlassCss,
  normalizeMobileLiquidGlassPreset,
} from "./liquid-glass-style";

export default class MobileLiquidGlassPlugin extends SubPluginBase {
  private readonly liquidGlass = new MobileLiquidGlass();

  override onload(): void {
    this.applyPreset();
  }

  onDataChanged(): void {
    this.applyPreset();
  }

  override onunload(): void {
    this.liquidGlass.destroy();
  }

  private applyPreset(): void {
    const preset = normalizeMobileLiquidGlassPreset(this.getSetting("stylePreset"));
    this.liquidGlass.start(buildMobileLiquidGlassCss(preset));
  }
}

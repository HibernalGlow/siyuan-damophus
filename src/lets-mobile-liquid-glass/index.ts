import { SubPluginBase } from "@/libs/sub-plugin-base";
import { MobileLiquidGlass } from "./liquid-glass";

export default class MobileLiquidGlassPlugin extends SubPluginBase {
  private readonly liquidGlass = new MobileLiquidGlass();

  override onload(): void {
    this.liquidGlass.start();
  }

  override onunload(): void {
    this.liquidGlass.destroy();
  }
}

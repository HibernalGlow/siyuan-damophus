import { SubPluginBase } from "@/libs/sub-plugin-base";
import { LegacyBlockSelectionBridge } from "./legacy-block-selection";

export default class LegacyBlockSelectionPlugin extends SubPluginBase {
  private readonly bridge = new LegacyBlockSelectionBridge();

  override onload(): void {
    this.bridge.start();
  }

  override onunload(): void {
    this.bridge.destroy();
  }
}

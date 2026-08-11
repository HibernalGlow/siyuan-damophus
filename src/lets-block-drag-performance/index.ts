import { SubPluginBase } from "@/libs/sub-plugin-base";
import {
  DEFAULT_DRAG_OVER_INTERVAL_MS,
  NativeBlockDragOverGovernor,
} from "./drag-over-governor";

export default class BlockDragPerformancePlugin extends SubPluginBase {
  private readonly governor = new NativeBlockDragOverGovernor();

  override onload(): void {
    this.governor.start(this.getSetting("minimumIntervalMs") ?? DEFAULT_DRAG_OVER_INTERVAL_MS);
  }

  onDataChanged(): void {
    this.governor.updateMinimumInterval(
      this.getSetting("minimumIntervalMs") ?? DEFAULT_DRAG_OVER_INTERVAL_MS,
    );
  }

  override onunload(): void {
    this.governor.destroy();
  }
}

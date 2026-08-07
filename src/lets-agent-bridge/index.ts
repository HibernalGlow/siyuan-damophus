import { SubPluginBase } from "@/libs/sub-plugin-base";
import { AgentBridgeWorker } from "./worker";

export default class AgentBridgePlugin extends SubPluginBase {
  private readonly worker = new AgentBridgeWorker();

  override onload(): void {
    this.worker.start();
  }

  override onunload(): void {
    this.worker.stop();
  }
}

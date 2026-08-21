import { getHPathByID } from "@/api";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import { getAllEditor, type IEventBusMap, type IProtyle } from "siyuan";
import { MobileTitlePath } from "./mobile-title-path";

export default class MobileTitlePathPlugin extends SubPluginBase {
  private listening = false;
  private readonly titlePath = new MobileTitlePath(getHPathByID);

  private readonly handleProtyle = (
    event: CustomEvent<
      IEventBusMap["loaded-protyle-static"] | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    if (isMobile) void this.enhance(event.detail.protyle);
  };

  override onload(): void {
    if (!isMobile) return;
    this.titlePath.start();
    if (!this.listening) {
      this.listening = true;
      plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
      plugin.eventBus.on("switch-protyle", this.handleProtyle);
    }
    const editor = getAllEditor().find((item) => item.protyle.block.rootID);
    if (editor) void this.enhance(editor.protyle);
  }

  override onunload(): void {
    if (this.listening) {
      plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
      plugin.eventBus.off("switch-protyle", this.handleProtyle);
      this.listening = false;
    }
    this.titlePath.destroy();
  }

  private async enhance(protyle: IProtyle): Promise<void> {
    await this.titlePath.show(protyle.block.rootID);
  }
}

import { showMessage, type IEventBusMap } from "siyuan";
import { convertNetworkAssetsToLocalStrict } from "@/api";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import {
  convertDocumentTreeNetworkAssets,
  hasRemoteResource,
} from "./network-assets-local";

export default class NetworkAssetsLocalPlugin extends SubPluginBase {
  private listening = false;

  private readonly handleBlockMenu = (event: CustomEvent<IEventBusMap["click-blockicon"]>): void => {
    if (!this.isEntryEnabled("contextMenu") || !hasRemoteResource(event.detail.blockElements)) return;
    const blockId = event.detail.blockElements[0]?.dataset.nodeId;
    if (!blockId) return;
    event.detail.menu.addItem({
      icon: "iconDownloadAssets",
      label: this.t("lets-network-assets-local.blockMenuLabel"),
      click: () => void this.convertBlock(blockId),
    });
  };

  private readonly handleDocumentTitleMenu = (event: CustomEvent<IEventBusMap["click-editortitleicon"]>): void => {
    if (!this.isEntryEnabled("contextMenu")) return;
    const documentId = event.detail.data.id;
    if (!documentId) return;
    event.detail.menu.addItem({
      icon: "iconDownloadAssets",
      label: this.t("lets-network-assets-local.documentMenuLabel"),
      click: () => void this.convertDocumentTree(documentId),
    });
  };

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
  }

  override onunload(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
  }

  private async convertBlock(blockId: string): Promise<void> {
    try {
      await convertNetworkAssetsToLocalStrict(blockId);
    } catch {
      showMessage(this.t("lets-network-assets-local.failed"), 5000, "error");
    }
  }

  private async convertDocumentTree(documentId: string): Promise<void> {
    try {
      const result = await convertDocumentTreeNetworkAssets(documentId, (completed, total) => {
        if (completed < total) {
          showMessage(this.t("lets-network-assets-local.progress")
            .replace("{current}", String(completed + 1)).replace("{total}", String(total),), 3000);
        }
      });
      showMessage(this.t("lets-network-assets-local.completed").replace("{count}", String(result.documents)), 5000);
    } catch {
      showMessage(this.t("lets-network-assets-local.failed"), 5000, "error");
    }
  }
}

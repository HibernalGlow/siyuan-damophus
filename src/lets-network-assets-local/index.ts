import { mount, unmount } from "svelte";
import { openTab, showMessage, type IEventBusMap } from "siyuan";
import { convertNetworkAssetsToLocalStrict } from "@/api";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { hasRemoteResource } from "./network-assets-local";
import NetworkAssetsLocalPreview from "./NetworkAssetsLocalPreview.svelte";
import { networkAssetsLocalTabTarget, networkAssetsLocalTabType } from "./tab-contract";

export default class NetworkAssetsLocalPlugin extends SubPluginBase {
  private listening = false;
  private tabRegistered = false;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();

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
    this.addDocumentTreeMenuItem(event.detail.menu, documentId);
  };

  private readonly handleDocumentTreeMenu = (event: CustomEvent<IEventBusMap["open-menu-doctree"]>): void => {
    if (!this.isEntryEnabled("contextMenu") || event.detail.type !== "doc") return;
    const documentId = event.detail.elements[0]?.dataset.nodeId;
    this.addDocumentTreeMenuItem(event.detail.menu, documentId);
  };

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: networkAssetsLocalTabType,
      init() {
        const element = this.element as HTMLElement;
        const documentId = typeof this.data?.documentId === "string" ? this.data.documentId : "";
        element.classList.add("damophus-theme-root", "damophus-question-bank-theme", "h-full", "overflow-auto", "bg-background", "text-foreground");
        owner.mountedTabs.set(element, mount(NetworkAssetsLocalPreview, {
          target: element,
          props: { documentId, labels: owner.labels() },
        }));
      },
      destroy() {
        const element = this.element as HTMLElement;
        const app = owner.mountedTabs.get(element);
        if (app) void unmount(app);
        owner.mountedTabs.delete(element);
      },
    });
  }

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.on("open-menu-doctree", this.handleDocumentTreeMenu);
  }

  override onunload(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
  }

  private async convertBlock(blockId: string): Promise<void> {
    try {
      await convertNetworkAssetsToLocalStrict(blockId);
    } catch {
      showMessage(this.t("lets-network-assets-local.failed"), 5000, "error");
    }
  }

  private addDocumentTreeMenuItem(menu: IEventBusMap["open-menu-doctree"]["menu"], documentId?: string): void {
    if (!documentId || !this.isEntryEnabled("tab")) return;
    menu.addItem({
      icon: "iconDownloadAssets",
      label: this.t("lets-network-assets-local.documentMenuLabel"),
      click: () => this.openPreview(documentId),
    });
  }

  private openPreview(documentId: string): void {
    void openTab({
      app: plugin.app,
      custom: {
        icon: "iconDownloadAssets",
        title: this.t("lets-network-assets-local.tabTitle"),
        ...networkAssetsLocalTabTarget(plugin.name, documentId),
      },
    });
  }

  private labels(): Record<string, string> {
    const translate = (key: string) => plugin.i18n[key] ?? key;
    return {
      title: translate("lets-network-assets-local.tabTitle"),
      description: translate("lets-network-assets-local.previewDescription"),
      refresh: translate("lets-network-assets-local.refresh"),
      scanning: translate("lets-network-assets-local.scanning"),
      summary: translate("lets-network-assets-local.summary"),
      scope: translate("lets-network-assets-local.scope"),
      empty: translate("lets-network-assets-local.empty"),
      documents: translate("lets-network-assets-local.documents"),
      resourceCount: translate("lets-network-assets-local.resourceCount"),
      convert: translate("lets-network-assets-local.convert"),
      running: translate("lets-network-assets-local.running"),
      progress: translate("lets-network-assets-local.progress"),
      completed: translate("lets-network-assets-local.previewCompleted"),
    };
  }
}

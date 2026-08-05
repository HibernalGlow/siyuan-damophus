import { getBlockBreadcrumb } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import { getAllEditor, openMobileFileById, type IEventBusMap, type IProtyle } from "siyuan";
import {
  findMobileFlashcardBreadcrumbs,
  normalizeBreadcrumbPriority,
  normalizeBreadcrumbTextDisplay,
  ScrollableBreadcrumb,
} from "./breadcrumb-scroll";

const log = getLogger("lets-mobile-breadcrumb");

export default class MobileBreadcrumbPlugin extends SubPluginBase {
  private flashcardFrame?: number;
  private flashcardObserver?: MutationObserver;
  private listening = false;
  private readonly scrollers = new Map<HTMLElement, ScrollableBreadcrumb>();
  private readonly requestVersions = new WeakMap<HTMLElement, number>();
  private readonly renderedBlockIds = new WeakMap<HTMLElement, string>();

  private readonly handleLoaded = (
    event: CustomEvent<IEventBusMap["loaded-protyle-static"]>,
  ): void => {
    void this.enhance(event.detail.protyle);
  };

  private readonly handleSwitch = (
    event: CustomEvent<IEventBusMap["switch-protyle"]>,
  ): void => {
    void this.enhance(event.detail.protyle, undefined, true);
  };

  private readonly handleEditorClick = (
    event: CustomEvent<IEventBusMap["click-editorcontent"]>,
  ): void => {
    const target = event.detail.event.target;
    void this.enhance(
      event.detail.protyle,
      target instanceof Element ? target : undefined,
    );
  };

  private readonly handleFlashcardMutation = (): void => {
    this.scheduleFlashcardEnhancement();
  };

  override onload(): void {
    if (!this.listening) {
      this.listening = true;
      plugin.eventBus.on("loaded-protyle-static", this.handleLoaded);
      plugin.eventBus.on("switch-protyle", this.handleSwitch);
      plugin.eventBus.on("click-editorcontent", this.handleEditorClick);
    }

    if (isMobile && typeof MutationObserver !== "undefined" && document.body) {
      this.flashcardObserver = new MutationObserver(this.handleFlashcardMutation);
      this.flashcardObserver.observe(document.body, { childList: true, subtree: true });
      this.scheduleFlashcardEnhancement();
    }

    for (const editor of getAllEditor()) {
      void this.enhance(editor.protyle, undefined, true);
    }
  }

  override onunload(): void {
    this.flashcardObserver?.disconnect();
    this.flashcardObserver = undefined;
    if (this.flashcardFrame !== undefined) cancelAnimationFrame(this.flashcardFrame);
    this.flashcardFrame = undefined;
    if (this.listening) {
      plugin.eventBus.off("loaded-protyle-static", this.handleLoaded);
      plugin.eventBus.off("switch-protyle", this.handleSwitch);
      plugin.eventBus.off("click-editorcontent", this.handleEditorClick);
      this.listening = false;
    }
    for (const scroller of this.scrollers.values()) scroller.destroy();
    this.scrollers.clear();
  }

  private scheduleFlashcardEnhancement(): void {
    if (this.flashcardFrame !== undefined) cancelAnimationFrame(this.flashcardFrame);
    this.flashcardFrame = requestAnimationFrame(() => {
      this.flashcardFrame = undefined;
      this.enhanceFlashcardBreadcrumbs();
    });
  }

  private enhanceFlashcardBreadcrumbs(): void {
    for (const [element, scroller] of this.scrollers) {
      if (element.isConnected) continue;
      scroller.destroy();
      this.scrollers.delete(element);
    }

    const priority = normalizeBreadcrumbPriority(this.getSetting("overflowPriority"));
    for (const { element, blockId } of findMobileFlashcardBreadcrumbs(document)) {
      const scroller = this.getScroller(element, priority);
      if (this.renderedBlockIds.get(element) === blockId) continue;
      void this.renderPath(
        element,
        scroller,
        blockId,
        blockId,
        undefined,
        ["NodeTextMark-mark"],
      );
    }
  }

  private async enhance(
    protyle: IProtyle,
    eventTarget?: Element,
    force = false,
  ): Promise<void> {
    const element = protyle.breadcrumb?.element;
    if (!element) return;

    const priority = normalizeBreadcrumbPriority(this.getSetting("overflowPriority"));
    const scroller = this.getScroller(element, priority);

    if (!isMobile) return;
    const blockId = this.findBlockId(protyle, eventTarget);
    if (!blockId || (!force && this.renderedBlockIds.get(element) === blockId)) return;

    const activeId = protyle.block.showAll ? protyle.block.id : protyle.block.parentID;
    await this.renderPath(element, scroller, blockId, activeId, protyle.notebookId);
  }

  private getScroller(
    element: HTMLElement,
    priority: ReturnType<typeof normalizeBreadcrumbPriority>,
  ): ScrollableBreadcrumb {
    let scroller = this.scrollers.get(element);
    if (!scroller) {
      scroller = new ScrollableBreadcrumb(element, {
        priority,
        onNavigate: (id) => openMobileFileById(plugin.app, id, ["cb-get-focus", "cb-get-all"]),
      });
      this.scrollers.set(element, scroller);
    } else {
      scroller.setPriority(priority);
    }
    return scroller;
  }

  private async renderPath(
    element: HTMLElement,
    scroller: ScrollableBreadcrumb,
    blockId: string,
    activeId: string | undefined,
    notebookId?: string,
    excludeTypes: string[] = [],
  ): Promise<void> {
    const requestVersion = (this.requestVersions.get(element) ?? 0) + 1;
    this.requestVersions.set(element, requestVersion);
    try {
      const items = await getBlockBreadcrumb(blockId, notebookId, excludeTypes);
      if (this.requestVersions.get(element) !== requestVersion || items.length === 0) return;
      const textDisplay = normalizeBreadcrumbTextDisplay(
        this.getSetting("textDisplayMode"),
        this.getSetting("maxCharacters"),
        this.getSetting("maxTextWidth"),
      );
      scroller.renderMobileItems(
        items,
        activeId,
        this.t("lets-mobile-breadcrumb.expand"),
        textDisplay,
      );
      this.renderedBlockIds.set(element, blockId);
    } catch (error) {
      log.warn("Failed to load the mobile breadcrumb path", error);
    }
  }

  private findBlockId(protyle: IProtyle, eventTarget?: Element): string | undefined {
    const wysiwyg = protyle.wysiwyg?.element;
    const eventBlock = eventTarget?.closest<HTMLElement>("[data-node-id]");
    if (eventBlock && wysiwyg?.contains(eventBlock)) return eventBlock.dataset.nodeId;

    const selection = document.getSelection();
    if (selection?.rangeCount && wysiwyg) {
      const container = selection.getRangeAt(0).startContainer;
      const selectionElement = container instanceof Element ? container : container.parentElement;
      const selectionBlock = selectionElement?.closest<HTMLElement>("[data-node-id]");
      if (selectionBlock && wysiwyg.contains(selectionBlock)) return selectionBlock.dataset.nodeId;
    }

    const firstBlock = wysiwyg?.querySelector<HTMLElement>("[data-node-id]");
    return firstBlock?.dataset.nodeId
      ?? (protyle.block.showAll ? protyle.block.id : protyle.block.parentID)
      ?? protyle.block.rootID;
  }
}

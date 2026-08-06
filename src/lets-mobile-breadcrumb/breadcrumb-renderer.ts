import { getBlockBreadcrumb } from "@/api";
import { getLogger } from "@/libs/logger";
import type { IProtyle } from "siyuan";
import {
  normalizeBreadcrumbPriority,
  normalizeBreadcrumbTextDisplay,
  ScrollableBreadcrumb,
  type BreadcrumbOverflowPriority,
} from "./breadcrumb-scroll";

const log = getLogger("lets-mobile-breadcrumb-renderer");

export interface BreadcrumbRendererOptions {
  getSetting: (key: string) => unknown;
  getExpandLabel: () => string;
  openMobileFile: (id: string) => void;
}

export class MobileBreadcrumbRenderer {
  private readonly scrollers = new Map<HTMLElement, ScrollableBreadcrumb>();
  private readonly requestVersions = new WeakMap<HTMLElement, number>();
  private readonly renderedBlockIds = new WeakMap<HTMLElement, string>();

  constructor(private readonly options: BreadcrumbRendererOptions) {}

  async enhance(protyle: IProtyle, eventTarget?: Element, force = false): Promise<void> {
    const element = protyle.breadcrumb?.element;
    if (!element) return;
    const scroller = this.getScroller(element);
    const blockId = this.findBlockId(protyle, eventTarget);
    if (!blockId || (!force && this.renderedBlockIds.get(element) === blockId)) return;
    const activeId = protyle.block.showAll ? protyle.block.id : protyle.block.parentID;
    await this.renderPath(element, scroller, blockId, activeId, protyle.notebookId);
  }

  async enhanceFlashcard(
    element: HTMLElement,
    blockId: string,
  ): Promise<void> {
    const scroller = this.getScroller(element);
    if (this.renderedBlockIds.get(element) === blockId) return;
    await this.renderPath(element, scroller, blockId, blockId, undefined, ["NodeTextMark-mark"]);
  }

  cleanupDisconnected(): void {
    for (const [element, scroller] of this.scrollers) {
      if (element.isConnected) continue;
      scroller.destroy();
      this.scrollers.delete(element);
    }
  }

  destroy(): void {
    for (const scroller of this.scrollers.values()) scroller.destroy();
    this.scrollers.clear();
  }

  private getPriority(): BreadcrumbOverflowPriority {
    return normalizeBreadcrumbPriority(this.options.getSetting("overflowPriority"));
  }

  private getScroller(element: HTMLElement): ScrollableBreadcrumb {
    const priority = this.getPriority();
    let scroller = this.scrollers.get(element);
    if (!scroller) {
      scroller = new ScrollableBreadcrumb(element, {
        priority,
        onNavigate: this.options.openMobileFile,
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
      const display = normalizeBreadcrumbTextDisplay(
        this.options.getSetting("textDisplayMode"),
        this.options.getSetting("maxCharacters"),
        this.options.getSetting("maxTextWidth"),
      );
      scroller.renderMobileItems(items, activeId, this.options.getExpandLabel(), display);
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

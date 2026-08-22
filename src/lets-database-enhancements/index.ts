import { getAllEditor, type IEventBusMap } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { AvCoverInheritManager } from "./av-cover-inherit";
import { AvRelationReorderManager } from "./av-relation-reorder";

export default class DatabaseEnhancementsPlugin extends SubPluginBase {
  private readonly coverManager = new AvCoverInheritManager();
  private readonly relationManager = new AvRelationReorderManager();
  private listening = false;
  private layoutReady = false;
  private readonly watchedRoots = new Map<HTMLElement, () => void>();

  override onload(): void {
    this.relationManager.updateOptions({
      enabled: this.isSmartRelationEnabled(),
      highlightEnabled: this.isHighlightEnabled(),
    });
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    this.startServices();
  }

  onDataChanged(): void {
    this.relationManager.updateOptions({
      enabled: this.isSmartRelationEnabled(),
      highlightEnabled: this.isHighlightEnabled(),
    });

    if (this.layoutReady) {
      this.rescanAllEditors();
    }
  }

  override onunload(): void {
    this.unbindEvents();
    this.stopServices();
    this.layoutReady = false;
  }

  private isCoverInheritEnabled(): boolean {
    return this.getSetting("inheritCardCover") !== false;
  }

  private isSmartRelationEnabled(): boolean {
    return this.getSetting("smartRelationSorting") !== false;
  }

  private isHighlightEnabled(): boolean {
    return this.getSetting("highlightRelevantItem") !== false;
  }

  private startServices(): void {
    this.relationManager.start();
    this.rescanAllEditors();
  }

  private stopServices(): void {
    for (const [, cleanup] of this.watchedRoots) {
      cleanup();
    }
    this.watchedRoots.clear();
    this.coverManager.clearCache();
    this.relationManager.destroy();
  }

  private bindEvents(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.on("switch-protyle", this.handleProtyle);
    plugin.eventBus.on("destroy-protyle", this.handleProtyleDestroyed);
  }

  private unbindEvents(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.off("switch-protyle", this.handleProtyle);
    plugin.eventBus.off("destroy-protyle", this.handleProtyleDestroyed);
  }

  private readonly handleProtyle = (
    event: CustomEvent<
      | IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    const el = event.detail?.protyle?.element;
    if (el) {
      this.scanEditorRoot(el);
    }
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    const el = event.detail?.protyle?.element;
    if (el) {
      this.disposeEditorRoot(el);
    }
  };

  private scanEditorRoot(root: HTMLElement): void {
    this.disposeEditorRoot(root);
    if (!this.isCoverInheritEnabled()) return;

    const wysiwyg = root.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (wysiwyg) {
      const cleanup = this.coverManager.observe(wysiwyg);
      this.watchedRoots.set(root, cleanup);
    }
  }

  private disposeEditorRoot(root: HTMLElement): void {
    const cleanup = this.watchedRoots.get(root);
    if (cleanup) {
      cleanup();
      this.watchedRoots.delete(root);
    }
  }

  private rescanAllEditors(): void {
    for (const [, cleanup] of this.watchedRoots) {
      cleanup();
    }
    this.watchedRoots.clear();

    if (this.isCoverInheritEnabled()) {
      for (const editor of getAllEditor()) {
        if (editor.protyle?.element) {
          this.scanEditorRoot(editor.protyle.element);
        }
      }
      if (typeof document !== "undefined") {
        const protyles = document.querySelectorAll<HTMLElement>(".protyle");
        protyles.forEach((el) => {
          if (!this.watchedRoots.has(el)) {
            this.scanEditorRoot(el);
          }
        });
      }
    }
  }
}

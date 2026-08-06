import { findMobileFlashcardBreadcrumbs } from "./breadcrumb-scroll";
import { MobileBreadcrumbRenderer } from "./breadcrumb-renderer";

export class MobileFlashcardBreadcrumbController {
  private frame?: number;
  private observer?: MutationObserver;

  constructor(
    private readonly renderer: MobileBreadcrumbRenderer,
    private readonly root: Document,
  ) {}

  start(): void {
    if (typeof MutationObserver === "undefined" || !this.root.body) return;
    this.observer?.disconnect();
    this.observer = new MutationObserver(() => this.schedule());
    this.observer.observe(this.root.body, { childList: true, subtree: true });
    this.schedule();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = undefined;
  }

  private schedule(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => {
      this.frame = undefined;
      this.renderer.cleanupDisconnected();
      for (const { element, blockId } of findMobileFlashcardBreadcrumbs(this.root)) {
        void this.renderer.enhanceFlashcard(element, blockId);
      }
    });
  }
}

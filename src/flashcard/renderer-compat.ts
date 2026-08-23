import type { FlashcardRenderer } from "./types";

export interface RendererCompatStatus {
  installed: boolean;
  reason?: string;
}

export type RendererVisibility = {
  mark: boolean;
  list: boolean;
  heading: boolean;
  superBlock: boolean;
  blockquote: boolean;
  callout: boolean;
  tag: boolean;
};

const rendererFlags: Record<FlashcardRenderer, string> = {
  mark: "mark",
  list: "list",
  heading: "heading",
  superBlock: "superBlock",
  blockquote: "blockquote",
  callout: "callout",
};

export class FlashcardRendererCompat {
  private readonly rendererByBlockId = new Map<string, FlashcardRenderer | "unknown">();
  private originalFetch?: typeof window.fetch;
  private installed = false;
  private activeBlockId?: string;
  private notifiedBlockId?: string;
  private domObserver?: MutationObserver;
  private visibility: RendererVisibility = { mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false };
  private styleElement?: HTMLStyleElement;

  onCardRender?: (blockId: string) => void;

  setVisibility(visibility: RendererVisibility): void {
    this.visibility = { ...this.visibility, ...visibility };
    this.applyNativeVisibilityFallback();
  }

  refresh(): void {
    this.applyNativeVisibilityFallback();
  }

  preload(blockId: string, renderer: FlashcardRenderer): void {
    this.rendererByBlockId.set(blockId, renderer);
  }

  preloadMany(entries: readonly { blockId: string; renderer: FlashcardRenderer | "unknown" }[]): void {
    for (const entry of entries) {
      this.rendererByBlockId.set(entry.blockId, entry.renderer);
    }
  }

  install(): RendererCompatStatus {
    if (this.installed) return { installed: true };
    const owner = this;
    // Keep the exact function object so unloading the sub-plugin restores the
    // host's fetch hook rather than a newly-created bound wrapper.
    this.originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url.endsWith("/api/block/getDocInfo") && init?.body && typeof init.body === "string") {
        try {
          const payload = JSON.parse(init.body) as { id?: unknown };
          if (typeof payload.id === "string") {
            owner.activeBlockId = undefined;
            owner.notifiedBlockId = undefined;
          }
        } catch {
          // Leave the native request untouched when its body is not JSON.
        }
      }
      return Reflect.apply(owner.originalFetch!, window, [input, init]);
    };
    if (typeof document !== "undefined" && document.body && typeof MutationObserver !== "undefined") {
      this.ensureVisibilityStyle();
      this.domObserver = new MutationObserver(() => this.applyNativeVisibilityFallback());
      this.domObserver.observe(document.body, { childList: true, subtree: true });
      this.applyNativeVisibilityFallback();
    }
    this.installed = true;
    return { installed: true };
  }

  uninstall(): void {
    if (!this.installed) return;
    this.clearNativeVisibilityFallback();
    if (this.originalFetch) window.fetch = this.originalFetch;
    this.domObserver?.disconnect();
    this.domObserver = undefined;
    this.styleElement?.remove();
    this.styleElement = undefined;
    this.originalFetch = undefined;
    this.activeBlockId = undefined;
    this.notifiedBlockId = undefined;
    this.rendererByBlockId.clear();
    this.installed = false;
  }

  /**
   * SiYuan 3.8 can read flashcard config before getDocInfo finishes. Its
   * native renderer already has the correct hide classes, so apply those same
   * classes from the card's DAMO IAL as a narrow timing fallback.
   */
  private applyNativeVisibilityFallback(): void {
    const blocks = document.querySelectorAll<HTMLElement>(
      '[data-key="dialog-opencard"] .card__block, .card__block',
    );
    for (const block of blocks) {
      const root = block.matches('[data-node-id][custom-dm-card-renderer]')
        ? block
        : block.querySelector<HTMLElement>('[data-node-id][custom-dm-card-renderer]');
      if (root?.dataset.nodeId && this.rendererByBlockId.has(root.dataset.nodeId)) {
        this.activeBlockId = root.dataset.nodeId;
        if (this.notifiedBlockId !== root.dataset.nodeId) {
          this.notifiedBlockId = root.dataset.nodeId;
          this.onCardRender?.(root.dataset.nodeId);
        }
      }
      const activeRoot = this.activeBlockId
        ? block.querySelector<HTMLElement>(`[data-node-id="${this.activeBlockId}"]`)
        : undefined;
      const renderer = (root?.getAttribute("custom-dm-card-renderer")
        ?? this.rendererByBlockId.get(activeRoot ? (this.activeBlockId ?? "") : "")) as FlashcardRenderer | "unknown" | null;
      if (!renderer || !Object.prototype.hasOwnProperty.call(rendererFlags, renderer)) continue;
      const hideClasses = [
        "card__block--hidemark",
        "card__block--hideli",
        "card__block--hideh",
        "card__block--hidesb",
      ];
      const actions = block.parentElement?.querySelectorAll<HTMLElement>(".card__action") ?? [];
      const answerShown = actions.length > 1 && !actions[1].classList.contains("fn__none");
      const enabledClasses = new Set<string>();
      if (this.visibility.mark) enabledClasses.add("card__block--hidemark");
      if (this.visibility.list) enabledClasses.add("card__block--hideli");
      if (this.visibility.heading) enabledClasses.add("card__block--hideh");
      if (this.visibility.superBlock) enabledClasses.add("card__block--hidesb");
      block.classList.toggle("damophus-card--hideblockquote", !answerShown && this.visibility.blockquote);
      block.classList.toggle("damophus-card--hidecallout", !answerShown && this.visibility.callout);
      block.classList.toggle("damophus-card--hidetag", !answerShown && this.visibility.tag);
      for (const className of hideClasses) {
        const shouldHave = !answerShown && enabledClasses.has(className);
        if (block.classList.contains(className) !== shouldHave) {
          block.classList.toggle(className, shouldHave);
        }
      }
    }
  }

  private clearNativeVisibilityFallback(): void {
    if (typeof document === "undefined") return;
    for (const block of document.querySelectorAll<HTMLElement>(".card__block")) {
      block.classList.remove(
        "card__block--hidemark",
        "card__block--hideli",
        "card__block--hideh",
        "card__block--hidesb",
      );
      block.classList.remove(
        "damophus-card--hideblockquote",
        "damophus-card--hidecallout",
        "damophus-card--hidetag",
      );
    }
  }

  private ensureVisibilityStyle(): void {
    if (this.styleElement || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.dataset.damophusFlashcardVisibility = "true";
    style.textContent = `
      .damophus-card--hidetag span[data-type~="tag"] { display: none !important; }
      .damophus-card--hideblockquote .bq > :not(:first-child),
      .damophus-card--hideblockquote blockquote > :not(:first-child) { display: none !important; }
      .damophus-card--hidecallout .callout-content { display: none !important; }
    `;
    document.head?.append(style);
    this.styleElement = style;
  }
}

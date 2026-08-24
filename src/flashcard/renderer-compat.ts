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
  topicRelations: boolean;
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
  private applyingVisibilityFallback = false;
  private domObserver?: MutationObserver;
  private readonly initializedAnswerByBlockId = new Set<string>();
  private readonly initialAnswerByBlockId = new Set<string>();
  private readonly forcedAnswerActions = new Map<HTMLElement, { firstHidden: boolean; secondHidden: boolean }>();
  private visibility: RendererVisibility = { mark: true, list: true, heading: true, superBlock: true, blockquote: true, callout: true, tag: false, topicRelations: false };
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
            owner.resetCardLifecycle();
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
    for (const [block, original] of this.forcedAnswerActions) {
      const actions = block.parentElement?.querySelectorAll<HTMLElement>(".card__action") ?? [];
      if (actions[0]) actions[0].classList.toggle("fn__none", original.firstHidden);
      if (actions[1]) actions[1].classList.toggle("fn__none", original.secondHidden);
    }
    this.forcedAnswerActions.clear();
    this.initializedAnswerByBlockId.clear();
    this.initialAnswerByBlockId.clear();
    this.rendererByBlockId.clear();
    this.installed = false;
  }

  /**
   * SiYuan 3.8 can read flashcard config before getDocInfo finishes. Its
   * native renderer already has the correct hide classes, so apply those same
   * classes from the card's DAMO IAL as a narrow timing fallback.
   */
  private applyNativeVisibilityFallback(): void {
    if (this.applyingVisibilityFallback || typeof document === "undefined") return;
    this.applyingVisibilityFallback = true;
    try {
    const blocks = document.querySelectorAll<HTMLElement>(
      '[data-key="dialog-opencard"] .card__block, .card__block',
    );
    for (const block of blocks) {
      // SiYuan may strip DAMO IAL attributes while materializing the card
      // editor. Resolve the rendered root by block ID first, then use the
      // preloaded renderer map as the portable source of truth.
      const candidateRoots = [
        ...(block.matches("[data-node-id]") ? [block] : []),
        ...block.querySelectorAll<HTMLElement>("[data-node-id]"),
      ];
      const root = candidateRoots.find((candidate) => {
        const mapped = candidate.dataset.nodeId ? this.rendererByBlockId.get(candidate.dataset.nodeId) : undefined;
        return Boolean(mapped && Object.prototype.hasOwnProperty.call(rendererFlags, mapped));
      })
        ?? candidateRoots.find((candidate) => candidate.hasAttribute("custom-dm-card-renderer"))
        ?? candidateRoots.find((candidate) => this.rendererByBlockId.has(candidate.dataset.nodeId ?? ""));
      if (root?.dataset.nodeId && (this.rendererByBlockId.has(root.dataset.nodeId) || root.hasAttribute("custom-dm-card-renderer"))) {
        if (this.activeBlockId !== root.dataset.nodeId) this.notifiedBlockId = undefined;
        this.activeBlockId = root.dataset.nodeId;
        if (this.notifiedBlockId !== root.dataset.nodeId) {
          this.notifiedBlockId = root.dataset.nodeId;
          this.onCardRender?.(root.dataset.nodeId);
        }
        if (!this.initializedAnswerByBlockId.has(root.dataset.nodeId)) {
          this.initializedAnswerByBlockId.add(root.dataset.nodeId);
          this.initialAnswerByBlockId.add(root.dataset.nodeId);
        }
      }
      // Resolve the renderer from the selected root itself. The root can be
      // the `.card__block` element, so querying only its descendants would
      // miss the preloaded renderer map for native materialized cards.
      const renderer = (root?.getAttribute("custom-dm-card-renderer")
        ?? (root?.dataset.nodeId ? this.rendererByBlockId.get(root.dataset.nodeId) : undefined)) as FlashcardRenderer | "unknown" | null;
      if (!renderer || !Object.prototype.hasOwnProperty.call(rendererFlags, renderer)) continue;
      const hideClasses = [
        "card__block--hidemark",
        "card__block--hideli",
        "card__block--hideh",
        "card__block--hidesb",
      ];
      const actions = block.parentElement?.querySelectorAll<HTMLElement>(".card__action") ?? [];
      // A DAMO renderer selects the card's primary answer boundary, while the
      // native visibility switches still apply to any enabled structures that
      // are actually present in the materialized card.
      const enabledClasses = new Set<string>();
      const rendererKey = renderer && Object.prototype.hasOwnProperty.call(rendererFlags, renderer)
        ? rendererFlags[renderer as FlashcardRenderer]
        : undefined;
      const nativeClass: Partial<Record<FlashcardRenderer, string>> = {
        mark: "card__block--hidemark",
        list: "card__block--hideli",
        heading: "card__block--hideh",
        superBlock: "card__block--hidesb",
      };
      // SiYuan hides every enabled answer structure present in the card, not
      // only the structure selected by a DAMO renderer. Keep that behavior so
      // a list card containing an explicit mark still honors "隐藏高亮".
      const hasMark = Boolean(block.querySelector('span[data-type~="mark"]'));
      const hasList = Boolean(block.querySelector(".list, .li"));
      const hasHeading = Boolean(block.querySelector('[data-type="NodeHeading"]'));
      const hasSuperBlock = Boolean(block.querySelector(":scope > .sb, .sb"));
      const nativeVisibility: Array<[FlashcardRenderer, boolean]> = [
        ["mark", hasMark || renderer === "mark"],
        ["list", hasList || renderer === "list"],
        ["heading", hasHeading || renderer === "heading"],
        ["superBlock", hasSuperBlock || renderer === "superBlock"],
      ];
      for (const [kind, present] of nativeVisibility) {
        if (this.visibility[kind] && present) enabledClasses.add(nativeClass[kind]!);
      }
      const shouldHideInitialAnswer = Boolean(rendererKey && this.visibility[rendererKey]);
      const rootId = root?.dataset.nodeId;
      const forced = this.forcedAnswerActions.get(block);
      if (rootId && !shouldHideInitialAnswer && forced && actions.length > 1) {
        actions[0].classList.toggle("fn__none", forced.firstHidden);
        actions[1].classList.toggle("fn__none", forced.secondHidden);
        this.forcedAnswerActions.delete(block);
        this.initialAnswerByBlockId.delete(rootId);
      }
      if (rootId && shouldHideInitialAnswer && this.initialAnswerByBlockId.has(rootId) && actions.length > 1) {
        const currentAnswerShown = !actions[1].classList.contains("fn__none");
        const initialForced = this.forcedAnswerActions.get(block);
        if (!initialForced) {
          this.forcedAnswerActions.set(block, {
            firstHidden: actions[0].classList.contains("fn__none"),
            secondHidden: actions[1].classList.contains("fn__none"),
          });
          if (currentAnswerShown) {
            actions[0].classList.remove("fn__none");
            actions[1].classList.add("fn__none");
          }
        } else if (currentAnswerShown) {
          // The native "显示答案" action made the second action visible.
          // Treat that as an intentional reveal instead of hiding it again.
          this.initialAnswerByBlockId.delete(rootId);
          this.forcedAnswerActions.delete(block);
        }
      }
      const answerShown = actions.length > 1 && !actions[1].classList.contains("fn__none");
      const customClasses: Array<[string, boolean]> = [
        ["damophus-card--hideblockquote", !answerShown && renderer === "blockquote" && this.visibility.blockquote],
        ["damophus-card--hidecallout", !answerShown && renderer === "callout" && this.visibility.callout],
        ["damophus-card--hidetag", !answerShown && this.visibility.tag],
        ["damophus-card--hidetopicrelations", !answerShown && this.visibility.topicRelations],
      ];
      for (const [className, shouldHave] of customClasses) {
        if (block.classList.contains(className) !== shouldHave) block.classList.toggle(className, shouldHave);
      }
      for (const className of hideClasses) {
        const shouldHave = !answerShown && enabledClasses.has(className);
        if (block.classList.contains(className) !== shouldHave) {
          block.classList.toggle(className, shouldHave);
        }
      }
    }
    } finally {
      this.applyingVisibilityFallback = false;
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
        "damophus-card--hidetopicrelations",
      );
    }
  }

  private resetCardLifecycle(): void {
    this.activeBlockId = undefined;
    this.notifiedBlockId = undefined;
    for (const [block, original] of this.forcedAnswerActions) {
      const actions = block.parentElement?.querySelectorAll<HTMLElement>(".card__action") ?? [];
      if (actions[0]) actions[0].classList.toggle("fn__none", original.firstHidden);
      if (actions[1]) actions[1].classList.toggle("fn__none", original.secondHidden);
    }
    this.forcedAnswerActions.clear();
    this.initializedAnswerByBlockId.clear();
    this.initialAnswerByBlockId.clear();
  }

  private ensureVisibilityStyle(): void {
    if (this.styleElement || typeof document === "undefined") return;
    const style = document.createElement("style");
    style.dataset.damophusFlashcardVisibility = "true";
    style.textContent = `
      .damophus-card--hidetag span[data-type~="tag"] { display: none !important; }
      .damophus-card--hidetopicrelations .damophus-topic-relations,
      .damophus-card--hidetopicrelations + .damophus-topic-relations { display: none !important; }
      .damophus-card--hideblockquote .bq > :not(:first-child),
      .damophus-card--hideblockquote blockquote > :not(:first-child) { display: none !important; }
      .damophus-card--hidecallout .callout-content { display: none !important; }
    `;
    document.head?.append(style);
    this.styleElement = style;
  }
}

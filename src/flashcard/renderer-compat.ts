import { getLogger } from "@/libs/logger";
import type { FlashcardRenderer } from "./types";

const log = getLogger("flashcard-renderer");

type FlashcardConfig = Record<string, unknown>;
type SiyuanWindow = Window & {
  siyuan?: { config?: { flashcard?: FlashcardConfig } };
};

export interface RendererCompatStatus {
  installed: boolean;
  reason?: string;
}

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
  private originalConfigDescriptor?: PropertyDescriptor;
  private originalFetch?: typeof window.fetch;
  private installed = false;
  private pendingBlockId?: string;
  private activeBlockId?: string;

  onCardRender?: (blockId: string) => void;

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
    const host = window as SiyuanWindow;
    const config = host.siyuan?.config;
    if (!config || !Object.prototype.hasOwnProperty.call(config, "flashcard")) {
      return { installed: false, reason: "window.siyuan.config.flashcard is unavailable" };
    }
    const descriptor = Object.getOwnPropertyDescriptor(config, "flashcard");
    if (!descriptor || descriptor.configurable !== true || (typeof descriptor.get !== "function" && !("value" in descriptor))) {
      return { installed: false, reason: "flashcard descriptor is not configurable" };
    }
    this.originalConfigDescriptor = descriptor;
    const owner = this;
    let currentValue = "value" in descriptor ? descriptor.value : undefined;
    Object.defineProperty(config, "flashcard", {
      configurable: descriptor.configurable,
      enumerable: descriptor.enumerable,
      get() {
        const original = typeof descriptor.get === "function"
          ? descriptor.get.call(config)
          : currentValue as FlashcardConfig;
        const blockId = owner.pendingBlockId ?? owner.activeBlockId;
        const renderer = owner.rendererByBlockId.get(blockId ?? "");
        if (blockId && renderer !== undefined) {
          owner.activeBlockId = blockId;
          owner.pendingBlockId = undefined;
          owner.onCardRender?.(blockId);
        }
        if (!renderer || renderer === "unknown") return original;
        const next = { ...original };
        for (const key of Object.values(rendererFlags)) {
          if (key in next) next[key] = false;
        }
        const target = rendererFlags[renderer];
        if (target in next) next[target] = true;
        return next;
      },
      set(value: FlashcardConfig) {
        if (typeof descriptor.set === "function") descriptor.set.call(config, value);
        else currentValue = value;
      },
    });
    // Keep the exact function object so unloading the sub-plugin restores the
    // host's fetch hook rather than a newly-created bound wrapper.
    this.originalFetch = window.fetch;
    window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
      if (url.endsWith("/api/block/getDocInfo") && init?.body && typeof init.body === "string") {
        try {
          const payload = JSON.parse(init.body) as { id?: unknown };
          if (typeof payload.id === "string") {
            owner.pendingBlockId = payload.id;
            owner.activeBlockId = undefined;
          }
        } catch {
          // Leave the native request untouched when its body is not JSON.
        }
      }
      return Reflect.apply(owner.originalFetch!, window, [input, init]);
    };
    this.installed = true;
    return { installed: true };
  }

  uninstall(): void {
    if (!this.installed) return;
    const host = window as SiyuanWindow;
    const config = host.siyuan?.config;
    if (config && this.originalConfigDescriptor) {
      try {
        Object.defineProperty(config, "flashcard", this.originalConfigDescriptor);
      } catch (error) {
        log.warn("flashcard-config-restore-failed", error);
      }
    }
    if (this.originalFetch) window.fetch = this.originalFetch;
    this.originalConfigDescriptor = undefined;
    this.originalFetch = undefined;
    this.pendingBlockId = undefined;
    this.activeBlockId = undefined;
    this.rendererByBlockId.clear();
    this.installed = false;
  }
}

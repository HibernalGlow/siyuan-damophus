import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobileEntryFrontend } from "@/libs/plugin-entry-settings";
import { plugin } from "@/utils";
import { openTab } from "siyuan";
import type { IEventBusMap } from "siyuan";

type SearchInputEvent = IEventBusMap["input-search"];
type SearchConfig = SearchInputEvent["config"];
/** Configs lifted out of a Ctrl+F dialog carry this flag so grouping rules keep applying inside the tab. */
type TaggedSearchConfig = SearchConfig & { damophusDocSearch?: true };

type SearchDialogInstance = {
  element: HTMLElement;
  data?: SearchConfig;
  destroy?: (options?: unknown) => void;
};

/** Duck-typed view of a SiYuan Wnd; only the pieces needed for tab placement. */
type WndLike = {
  element: HTMLElement;
  headersElement: unknown;
  children: Array<{ headElement?: HTMLElement }>;
  switchTab?: (headElement: HTMLElement, pushBack?: boolean, update?: boolean, resize?: boolean, isSaveLayout?: boolean) => void;
};

const DOCUMENT_SEARCH_DIALOG = "dialog-search";
const GLOBAL_SEARCH_DIALOG = "dialog-globalsearch";
const DOCUMENT_SEARCH_SOURCE = "damophusDocSearch";
const SEARCH_DIALOG_SELECTOR = `[data-key="${DOCUMENT_SEARCH_DIALOG}"],[data-key="${GLOBAL_SEARCH_DIALOG}"]`;

export default class SearchGroupPlugin extends SubPluginBase {
  private listening = false;
  private observing = false;
  private observer?: MutationObserver;

  private readonly handleSearchInput = (
    event: CustomEvent<SearchInputEvent>,
  ): void => {
    const detail = event.detail;
    const dialogKey = detail.searchElement.closest<HTMLElement>("[data-key]")?.dataset.key;
    const isCurrentDocumentSearch = dialogKey === DOCUMENT_SEARCH_DIALOG
      || (detail.config as TaggedSearchConfig)[DOCUMENT_SEARCH_SOURCE] === true;
    const enabled = isCurrentDocumentSearch
      ? this.getSetting("currentDocumentSearch") === true
      : this.getSetting("globalSearch") !== false;
    if (!enabled) return;

    detail.config.group = 1;
    const searchRoot = detail.searchElement.closest<HTMLElement>(".b3-dialog, .search")
      ?? detail.searchElement.parentElement?.parentElement?.parentElement;
    const collapse = searchRoot?.querySelector<HTMLElement>("#searchCollapse");
    collapse?.parentElement?.classList.remove("fn__none");
  };

  override onload(): void {
    if (!this.listening) {
      this.listening = true;
      plugin.eventBus.on("input-search", this.handleSearchInput);
    }
    if (!this.observing && typeof document !== "undefined" && document.body && !isMobileEntryFrontend()) {
      this.observer ??= new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              this.convertSearchDialog(node as Element);
            }
          }
        }
      });
      this.observer.observe(document.body, { childList: true });
      this.observing = true;
    }
  }

  override onunload(): void {
    if (this.listening) {
      plugin.eventBus.off("input-search", this.handleSearchInput);
      this.listening = false;
    }
    this.observer?.disconnect();
    this.observing = false;
  }

  // Search dialogs are appended directly to document.body, so watching body children only
  // catches every entry point (top bar, command panel, hotkeys, context menus).
  private convertSearchDialog(node: Element): void {
    if (!node.matches?.(SEARCH_DIALOG_SELECTOR)) return;
    if (!node.querySelector("#searchList")) return;
    const isDocumentSearch = node.getAttribute("data-key") === DOCUMENT_SEARCH_DIALOG;
    const scopeEnabled = isDocumentSearch
      ? this.getSetting("documentSearchAsTab") !== false
      : this.getSetting("globalSearchAsTab") !== false;
    if (this.getSetting("openSearchAsTab") !== true || !scopeEnabled) return;

    const dialogs = (window.siyuan as unknown as { dialogs?: SearchDialogInstance[] } | undefined)?.dialogs ?? [];
    const instance = dialogs.find((item) => item.element === node);
    if (!instance?.data) return;

    // destroy() defers element removal by an animation timer (~190ms), so the dialog
    // would visibly pop up before the tab opens. It was appended this task and has not
    // painted yet: hide it now and drop it from the reuse registry, or re-triggering
    // the search inside that window would update the hidden dialog instead.
    (node as HTMLElement).style.display = "none";
    const dialogIndex = dialogs.indexOf(instance);
    if (dialogIndex >= 0) {
      dialogs.splice(dialogIndex, 1);
    }

    const config = instance.data as TaggedSearchConfig;
    if (isDocumentSearch) {
      config[DOCUMENT_SEARCH_SOURCE] = true;
    }
    try {
      this.openSearchTab(config);
    } finally {
      // Same sequence as the native "open in tab" button; the focus option keeps
      // destroyCallback from handing focus back to the editor.
      instance.destroy?.({ focus: "false" });
    }
  }

  private openSearchTab(config: TaggedSearchConfig): void {
    if (this.getSetting("searchTabPosition") !== "opposite") {
      void openTab({ app: plugin.app, search: config });
      return;
    }
    const wnds: WndLike[] = [];
    this.collectWnds((window.siyuan as unknown as { layout?: { centerLayout?: unknown } } | undefined)?.layout?.centerLayout, wnds);
    const activeElement = document.querySelector<HTMLElement>(".layout__wnd--active");
    if (wnds.length < 2 || !activeElement) {
      // Nothing to mirror into: split to the right on wide screens (same guard as the
      // native global search), otherwise fall back to the current area.
      if (wnds.length === 1 && window.innerWidth > 1024) {
        void openTab({ app: plugin.app, search: config, position: "right" });
      } else {
        void openTab({ app: plugin.app, search: config });
      }
      return;
    }
    const left = (wnd: WndLike) => wnd.element.getBoundingClientRect().left;
    wnds.sort((a, b) => left(a) - left(b));
    const currentIndex = wnds.findIndex((wnd) => wnd.element === activeElement);
    const mirror = currentIndex >= 0 ? wnds[wnds.length - 1 - currentIndex] : undefined;
    if (!mirror || mirror.element === activeElement) {
      void openTab({ app: plugin.app, search: config });
      return;
    }
    // Activating the mirror's own focused tab moves .layout__wnd--active there,
    // so a position-less openTab lands in the mirrored area.
    const tabs = Array.isArray(mirror.children) ? mirror.children : [];
    const focused = tabs.find((tab) => tab.headElement?.classList.contains("item--focus")) ?? tabs[0];
    if (focused?.headElement && typeof mirror.switchTab === "function") {
      mirror.switchTab(focused.headElement);
    }
    void openTab({ app: plugin.app, search: config });
  }

  private collectWnds(node: unknown, acc: WndLike[]): void {
    if (!node || typeof node !== "object") return;
    if ("headersElement" in node && "children" in node) {
      acc.push(node as WndLike);
      return;
    }
    const children = (node as { children?: unknown }).children;
    if (Array.isArray(children)) {
      for (const child of children) {
        this.collectWnds(child, acc);
      }
    }
  }
}

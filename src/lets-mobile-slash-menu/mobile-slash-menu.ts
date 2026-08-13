import { getAllEditor } from "siyuan";

interface SlashHint {
  element?: HTMLElement;
  enableExtend?: boolean;
  enableSlash?: boolean;
  lastIndex?: number;
  splitChar?: string;
  timeId?: number;
  genHTML?: (...args: unknown[]) => void;
  render: (protyle: SlashProtyle) => void;
}

interface SlashProtyle {
  hint?: SlashHint;
  wysiwyg?: { element: HTMLElement };
}

interface SlashEditor {
  protyle: SlashProtyle;
}

interface PatchedHint {
  originalGenHTML?: NonNullable<SlashHint["genHTML"]>;
  wrappedGenHTML?: NonNullable<SlashHint["genHTML"]>;
  original: SlashHint["render"];
  wrapped: SlashHint["render"];
}

export interface MobileSlashMenuRuntime {
  getEditors: () => SlashEditor[];
}

const defaultRuntime: MobileSlashMenuRuntime = {
  getEditors: () => getAllEditor() as unknown as SlashEditor[],
};

/**
 * SiYuan's Hint.render() deliberately suppresses slash hints when #sidebar
 * exists. Mobile browser mode still uses the desktop editor input pipeline,
 * so temporarily hiding that marker lets the native synchronous slash list
 * render and continue filtering as the user types.
 */
export class MobileSlashMenuShortcut {
  private readonly patchedHints = new Map<SlashHint, PatchedHint>();
  private observer?: MutationObserver;

  constructor(
    private readonly targetDocument: Document = document,
    private readonly runtime: MobileSlashMenuRuntime = defaultRuntime,
  ) {}

  start(_label?: string): void {
    this.patchEditors();
    this.targetDocument.addEventListener("input", this.handleInput, true);
    if (this.observer || !this.targetDocument.body) return;
    const MutationObserverConstructor = this.targetDocument.defaultView?.MutationObserver;
    if (!MutationObserverConstructor) return;
    this.observer = new MutationObserverConstructor(() => this.patchEditors());
    this.observer.observe(this.targetDocument.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    this.targetDocument.removeEventListener("input", this.handleInput, true);
    for (const [hint, patch] of this.patchedHints) {
      if (hint.render === patch.wrapped) hint.render = patch.original;
      if (patch.originalGenHTML && hint.genHTML === patch.wrappedGenHTML) {
        hint.genHTML = patch.originalGenHTML;
      }
    }
    this.patchedHints.clear();
  }

  private patchEditors(): void {
    for (const editor of this.runtime.getEditors()) {
      const hint = editor.protyle.hint;
      if (hint) this.patchHint(hint);
    }
  }

  private readonly handleInput = (event: Event): void => {
    const inputEvent = event as InputEvent;
    const editors = this.runtime.getEditors();
    for (const editor of editors) {
      const hint = editor.protyle.hint;
      if (hint) this.patchHint(hint);
    }
    if (inputEvent.data !== "/" && inputEvent.data !== "、") return;
    const target = event.target as Node | null;
    const editor = editors.find((item) => target && item.protyle.wysiwyg?.element.contains(target));
    const hint = editor?.protyle.hint;
    if (!hint) return;
    hint.enableExtend = true;
    hint.enableSlash = true;
    hint.splitChar = "";
    hint.lastIndex = -1;
    if (typeof hint.timeId === "number") this.targetDocument.defaultView?.clearTimeout(hint.timeId);
    if (hint.element) {
      hint.element.classList.add("fn__none");
      hint.element.innerHTML = "";
    }
  };

  private patchHint(hint: SlashHint): void {
    if (this.patchedHints.has(hint)) return;
    const original = hint.render;
    const originalGenHTML = hint.genHTML;
    const targetDocument = this.targetDocument;
    let rendering = false;
    let wrappedGenHTML: NonNullable<SlashHint["genHTML"]> | undefined;
    if (originalGenHTML) {
      wrappedGenHTML = function (this: SlashHint, ...args: unknown[]): void {
        const isStaleAsyncResult = !rendering && (this.splitChar === "/" || this.splitChar === "、");
        if (!isStaleAsyncResult) originalGenHTML.apply(this, args);
      };
      hint.genHTML = wrappedGenHTML;
    }
    const wrapped: SlashHint["render"] = function (this: SlashHint, protyle): void {
      const sidebar = targetDocument.getElementById("sidebar");
      if (!sidebar) {
        original.call(this, protyle);
        return;
      }
      const originalId = sidebar.id;
      sidebar.id = "damophus-mobile-slash-sidebar-bypass";
      rendering = true;
      try {
        original.call(this, protyle);
      } finally {
        rendering = false;
        sidebar.id = originalId;
      }
    };
    hint.render = wrapped;
    this.patchedHints.set(hint, { original, wrapped, originalGenHTML, wrappedGenHTML });
  }
}

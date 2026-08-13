import { getAllEditor } from "siyuan";

export const MOBILE_SLASH_MENU_ATTRIBUTE = "data-damophus-mobile-slash-menu";

interface SlashHint {
  element: HTMLElement;
  enableExtend: boolean;
  enableSlash: boolean;
  lastIndex: number;
  splitChar: string;
  timeId?: number;
  genHTML?: (...args: unknown[]) => void;
  render: (protyle: SlashProtyle) => void;
}

interface SlashProtyle {
  disabled?: boolean;
  hint?: SlashHint;
  toolbar?: { range?: Range };
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

interface DecoratedButton {
  ariaLabel: string | null;
  title: string | null;
}

export interface MobileSlashMenuRuntime {
  getEditors: () => SlashEditor[];
}

const defaultRuntime: MobileSlashMenuRuntime = {
  getEditors: () => getAllEditor() as unknown as SlashEditor[],
};

function rangeBelongsTo(range: Range | undefined, root: HTMLElement): range is Range {
  return Boolean(range && root.contains(range.startContainer) && root.contains(range.endContainer));
}

export class MobileSlashMenuShortcut {
  private readonly decoratedButtons = new Map<HTMLButtonElement, DecoratedButton>();
  private readonly patchedHints = new Map<SlashHint, PatchedHint>();
  private readonly slashSessions = new WeakSet<SlashHint>();
  private observer?: MutationObserver;
  private label = "Insert / and open slash menu";
  private lastActivation = 0;

  constructor(
    private readonly targetDocument: Document = document,
    private readonly runtime: MobileSlashMenuRuntime = defaultRuntime,
  ) {}

  start(label: string): void {
    this.label = label;
    this.decorate();
    if (this.observer || !this.targetDocument.body) return;
    const MutationObserverConstructor = this.targetDocument.defaultView?.MutationObserver;
    if (!MutationObserverConstructor) return;
    this.observer = new MutationObserverConstructor(() => this.decorate());
    this.observer.observe(this.targetDocument.body, { childList: true, subtree: true });
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const [button, previous] of this.decoratedButtons) {
      button.removeEventListener("click", this.handleActivation, true);
      button.removeEventListener("touchend", this.handleActivation, true);
      button.removeAttribute(MOBILE_SLASH_MENU_ATTRIBUTE);
      this.restoreAttribute(button, "aria-label", previous.ariaLabel);
      this.restoreAttribute(button, "title", previous.title);
    }
    this.decoratedButtons.clear();
    for (const [hint, patch] of this.patchedHints) {
      if (hint.render === patch.wrapped) hint.render = patch.original;
      if (patch.originalGenHTML && hint.genHTML === patch.wrappedGenHTML) {
        hint.genHTML = patch.originalGenHTML;
      }
    }
    this.patchedHints.clear();
  }

  private decorate(): void {
    const nativeButtons = this.targetDocument.querySelectorAll<HTMLButtonElement>(
      '#keyboardToolbar .keyboard__action[data-type="add"]',
    );
    for (const button of nativeButtons) {
      if (this.decoratedButtons.has(button)) continue;
      this.decoratedButtons.set(button, {
        ariaLabel: button.getAttribute("aria-label"),
        title: button.getAttribute("title"),
      });
      button.setAttribute(MOBILE_SLASH_MENU_ATTRIBUTE, "true");
      button.setAttribute("aria-label", this.label);
      button.setAttribute("title", this.label);
      button.addEventListener("click", this.handleActivation, true);
      button.addEventListener("touchend", this.handleActivation, true);
    }
  }

  private readonly handleActivation = (event: Event): void => {
    const now = Date.now();
    if (now - this.lastActivation < 350) return;
    if (!this.insertSlash()) return;
    this.lastActivation = now;
    event.preventDefault();
    event.stopPropagation();
  };

  private insertSlash(): boolean {
    const editor = this.activeEditor();
    const protyle = editor?.protyle;
    const root = protyle?.wysiwyg?.element;
    const range = protyle?.toolbar?.range;
    const hint = protyle?.hint;
    if (!protyle || protyle.disabled || !root || !rangeBelongsTo(range, root) || !hint) return false;

    this.enableFilterableSlashHint(hint);
    this.prepareSlashHint(hint);

    const selection = this.targetDocument.getSelection();
    if (!selection) return false;
    const editable = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as HTMLElement
      : range.startContainer.parentElement;
    editable?.closest<HTMLElement>('[contenteditable="true"]')?.focus({ preventScroll: true });
    selection.removeAllRanges();
    selection.addRange(range);

    const beforeText = root.textContent ?? "";
    const executed = typeof this.targetDocument.execCommand === "function"
      && this.targetDocument.execCommand("insertText", false, "/");
    const afterText = root.textContent ?? "";
    if (!executed || afterText === beforeText || !this.selectionFollowsSlash(selection)) {
      this.insertSlashFallback(range, root, selection);
    }

    const currentRange = selection.rangeCount > 0 ? selection.getRangeAt(0) : range;
    protyle.toolbar!.range = currentRange;
    hint.enableExtend = true;
    hint.render(protyle);

    // Slash hints are synchronous. A loading node here can only belong to an
    // earlier reference/search hint and must not replace the command list.
    if (hint.element.querySelector(".fn__loading")) {
      this.resetHintElement(hint);
      hint.render(protyle);
    }
    return true;
  }

  private selectionFollowsSlash(selection: Selection): boolean {
    if (selection.rangeCount === 0) return false;
    const currentRange = selection.getRangeAt(0);
    if (currentRange.startContainer.nodeType !== Node.TEXT_NODE) return false;
    const text = currentRange.startContainer.textContent ?? "";
    return currentRange.startOffset > 0 && text[currentRange.startOffset - 1] === "/";
  }

  private insertSlashFallback(range: Range, root: HTMLElement, selection: Selection): void {
    range.deleteContents();
    const text = this.targetDocument.createTextNode("/");
    range.insertNode(text);
    range.setStartAfter(text);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    (text.parentElement ?? root).dispatchEvent(new InputEvent("input", {
      bubbles: true,
      data: "/",
      inputType: "insertText",
    }));
  }

  private activeEditor(): SlashEditor | undefined {
    const editors = this.runtime.getEditors();
    const focusNode = this.targetDocument.getSelection()?.focusNode;
    const focused = focusNode && editors.find((editor) => editor.protyle.wysiwyg?.element.contains(focusNode));
    if (focused) return focused;
    return [...editors].reverse().find((editor) => {
      const root = editor.protyle.wysiwyg?.element;
      return Boolean(root && rangeBelongsTo(editor.protyle.toolbar?.range, root));
    });
  }

  private prepareSlashHint(hint: SlashHint): void {
    this.slashSessions.add(hint);
    hint.enableExtend = true;
    hint.enableSlash = true;
    hint.splitChar = "";
    hint.lastIndex = -1;
    if (typeof hint.timeId === "number") this.targetDocument.defaultView?.clearTimeout(hint.timeId);
    this.resetHintElement(hint);
  }

  private resetHintElement(hint: SlashHint): void {
    hint.element.classList.add("fn__none");
    hint.element.innerHTML = "";
  }

  private enableFilterableSlashHint(hint: SlashHint): void {
    if (this.patchedHints.has(hint)) return;
    const original = hint.render;
    const originalGenHTML = hint.genHTML;
    const targetDocument = this.targetDocument;
    const slashSessions = this.slashSessions;
    let renderingCurrentHint = false;
    let wrappedGenHTML: NonNullable<SlashHint["genHTML"]> | undefined;
    if (originalGenHTML) {
      wrappedGenHTML = function (this: SlashHint, ...args: unknown[]): void {
        const staleAsyncResult = slashSessions.has(this)
          && (this.splitChar === "/" || this.splitChar === "、")
          && !renderingCurrentHint;
        if (!staleAsyncResult) originalGenHTML.apply(this, args);
      };
      hint.genHTML = wrappedGenHTML;
    }
    const wrapped: SlashHint["render"] = function (this: SlashHint, protyle): void {
      const sidebar = slashSessions.has(this) ? targetDocument.getElementById("sidebar") : null;
      if (!sidebar) {
        original.call(this, protyle);
        return;
      }
      const originalId = sidebar.id;
      sidebar.id = "damophus-mobile-sidebar-during-slash-hint";
      renderingCurrentHint = true;
      try {
        original.call(this, protyle);
      } finally {
        renderingCurrentHint = false;
        sidebar.id = originalId;
      }
    };
    hint.render = wrapped;
    this.patchedHints.set(hint, { original, wrapped, originalGenHTML, wrappedGenHTML });
  }

  private restoreAttribute(element: HTMLElement, name: string, value: string | null): void {
    if (value === null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  }
}

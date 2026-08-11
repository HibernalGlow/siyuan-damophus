export const SELECTION_RESULTS_HIGHLIGHT = "damophus-selection-results";
export const SELECTION_FOCUS_HIGHLIGHT = "damophus-selection-focus";
export const SELECTION_HIGHLIGHT_STYLE_ID = "damophus-selection-highlight-style";

export const SELECTION_HIGHLIGHT_CSS = `
::highlight(${SELECTION_RESULTS_HIGHLIGHT}) {
  background-color: #39c5bb;
  color: #000;
}

::highlight(${SELECTION_FOCUS_HIGHLIGHT}) {
  background-color: #66ccff;
  color: #000;
}
`;

interface TextNodeSpan {
  node: Text;
  start: number;
  end: number;
}

interface SelectionContext {
  root: HTMLElement;
  term: string;
  selectionStart: number;
}

interface MatchRange {
  range: Range;
  start: number;
}

const MODIFIER_KEYS = new Set(["Alt", "Control", "Meta", "Shift"]);

function supportsCustomHighlights(): boolean {
  return typeof CSS !== "undefined"
    && "highlights" in CSS
    && typeof Highlight !== "undefined";
}

function textNodeSpans(root: HTMLElement): { spans: TextNodeSpan[]; text: string } {
  const spans: TextNodeSpan[] = [];
  const chunks: string[] = [];
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let length = 0;
  let node = walker.nextNode();

  while (node) {
    const textNode = node as Text;
    const value = textNode.data;
    if (value.length > 0) {
      spans.push({ node: textNode, start: length, end: length + value.length });
      chunks.push(value);
      length += value.length;
    }
    node = walker.nextNode();
  }

  return { spans, text: chunks.join("") };
}

function findSpan(spans: TextNodeSpan[], offset: number, endBoundary: boolean): TextNodeSpan | undefined {
  let low = 0;
  let high = spans.length - 1;

  while (low <= high) {
    const middle = (low + high) >>> 1;
    const span = spans[middle];
    const contains = endBoundary
      ? span.start < offset && offset <= span.end
      : span.start <= offset && offset < span.end;
    if (contains) return span;
    if (offset < span.start || (endBoundary && offset === span.start)) high = middle - 1;
    else low = middle + 1;
  }

  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function buildMatchRanges(root: HTMLElement, term: string): MatchRange[] {
  const { spans, text } = textNodeSpans(root);
  if (spans.length === 0 || text.length === 0) return [];

  const matches: MatchRange[] = [];
  const pattern = new RegExp(escapeRegExp(term), "giu");
  let match = pattern.exec(text);

  while (match) {
    const start = match.index;
    const end = start + match[0].length;
    const startSpan = findSpan(spans, start, false);
    const endSpan = findSpan(spans, end, true);
    if (startSpan && endSpan) {
      const range = root.ownerDocument.createRange();
      range.setStart(startSpan.node, start - startSpan.start);
      range.setEnd(endSpan.node, end - endSpan.start);
      matches.push({ range, start });
    }
    match = pattern.exec(text);
  }

  return matches;
}

function selectionOffset(root: HTMLElement, range: Range, leadingWhitespace: number): number | undefined {
  if (!root.contains(range.commonAncestorContainer)) return undefined;
  const prefix = root.ownerDocument.createRange();
  try {
    prefix.setStart(root, 0);
    prefix.setEnd(range.startContainer, range.startOffset);
    return prefix.toString().length + leadingWhitespace;
  } catch {
    return undefined;
  } finally {
    prefix.detach();
  }
}

function editorRootForRange(range: Range): HTMLElement | undefined {
  const common = range.commonAncestorContainer;
  const element = common.nodeType === Node.ELEMENT_NODE
    ? common as Element
    : common.parentElement;
  return element?.closest<HTMLElement>(".protyle-wysiwyg") ?? undefined;
}

function isMacPlatform(): boolean {
  return /Mac|iPhone|iPad|iPod/u.test(navigator.platform);
}

export class SelectionHighlighter {
  private active = false;
  private root?: HTMLElement;
  private term = "";
  private ranges: Range[] = [];
  private currentIndex = -1;
  private dirty = false;
  private observer?: MutationObserver;

  private readonly handleMouseDown = () => this.clear();
  private readonly handleMouseUp = () => this.highlightCurrentSelection();
  private readonly handleKeyDown = (event: KeyboardEvent) => {
    const primary = isMacPlatform() ? event.metaKey : event.ctrlKey;
    const secondary = isMacPlatform() ? event.ctrlKey : event.metaKey;
    const isNavigation = primary && event.altKey && event.code === "KeyP" && !secondary;

    if (isNavigation) {
      event.preventDefault();
      event.stopPropagation();
      this.navigate(event.shiftKey ? -1 : 1);
    } else if (!MODIFIER_KEYS.has(event.key)) {
      this.clear();
    }
  };

  constructor(private readonly documentRef: Document = document) {}

  start(): void {
    if (this.active || !supportsCustomHighlights()) return;
    this.active = true;
    this.ensureStyle();
    this.documentRef.addEventListener("mousedown", this.handleMouseDown);
    this.documentRef.addEventListener("mouseup", this.handleMouseUp);
    this.documentRef.addEventListener("keydown", this.handleKeyDown, true);
  }

  destroy(): void {
    if (this.active) {
      this.documentRef.removeEventListener("mousedown", this.handleMouseDown);
      this.documentRef.removeEventListener("mouseup", this.handleMouseUp);
      this.documentRef.removeEventListener("keydown", this.handleKeyDown, true);
    }
    this.active = false;
    this.clear();
    this.documentRef.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)?.remove();
  }

  private ensureStyle(): void {
    if (this.documentRef.getElementById(SELECTION_HIGHLIGHT_STYLE_ID)) return;
    const style = this.documentRef.createElement("style");
    style.id = SELECTION_HIGHLIGHT_STYLE_ID;
    style.textContent = SELECTION_HIGHLIGHT_CSS;
    this.documentRef.head.append(style);
  }

  private getSelectionContext(): SelectionContext | undefined {
    const selection = this.documentRef.defaultView?.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return undefined;

    const rawTerm = selection.toString();
    const term = rawTerm.trim();
    if (!term) return undefined;

    const selectedRange = selection.getRangeAt(0);
    const root = editorRootForRange(selectedRange);
    if (!root || !root.isConnected) return undefined;

    const leadingWhitespace = rawTerm.length - rawTerm.trimStart().length;
    const start = selectionOffset(root, selectedRange, leadingWhitespace);
    if (start === undefined) return undefined;
    return { root, term, selectionStart: start };
  }

  private highlightCurrentSelection(): void {
    const context = this.getSelectionContext();
    if (context) this.rebuild(context);
  }

  private rebuild(context: SelectionContext): void {
    this.removeOwnedHighlights();
    this.observer?.disconnect();

    const matches = buildMatchRanges(context.root, context.term);
    this.root = context.root;
    this.term = context.term;
    this.ranges = matches.map(({ range }) => range);
    this.currentIndex = matches.findIndex(({ start }) => start === context.selectionStart);
    this.dirty = false;

    if (this.ranges.length > 0) {
      CSS.highlights.set(SELECTION_RESULTS_HIGHLIGHT, new Highlight(...this.ranges));
    }

    this.observer = new MutationObserver(() => {
      this.dirty = true;
    });
    this.observer.observe(context.root, { childList: true, characterData: true, subtree: true });
  }

  private navigate(direction: 1 | -1): void {
    const context = this.getSelectionContext();
    if (context && (context.root !== this.root || context.term !== this.term)) {
      this.rebuild(context);
    } else if (this.dirty && this.root?.isConnected && this.term) {
      this.rebuild({
        root: this.root,
        term: this.term,
        selectionStart: context?.selectionStart ?? -1,
      });
    } else if (!this.root && context) {
      this.rebuild(context);
    }

    if (this.ranges.length === 0) return;
    this.currentIndex = (this.currentIndex + direction + this.ranges.length) % this.ranges.length;
    const range = this.ranges[this.currentIndex];
    CSS.highlights.set(SELECTION_FOCUS_HIGHLIGHT, new Highlight(range));
    this.scrollToRange(range);
  }

  private scrollToRange(range: Range): void {
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement;
    if (!startElement) return;

    const scroller = startElement.closest<HTMLElement>(".protyle-content");
    if (!scroller) {
      startElement.scrollIntoView({ block: "center" });
      return;
    }

    const rangeRect = range.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    scroller.scrollBy({
      top: rangeRect.top + rangeRect.height / 2 - scrollerRect.top - scrollerRect.height / 2,
      behavior: "smooth",
    });
  }

  private removeOwnedHighlights(): void {
    if (!supportsCustomHighlights()) return;
    CSS.highlights.delete(SELECTION_RESULTS_HIGHLIGHT);
    CSS.highlights.delete(SELECTION_FOCUS_HIGHLIGHT);
  }

  private clear(): void {
    this.removeOwnedHighlights();
    this.observer?.disconnect();
    this.observer = undefined;
    this.root = undefined;
    this.term = "";
    this.ranges = [];
    this.currentIndex = -1;
    this.dirty = false;
  }
}

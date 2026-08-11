const SIYUAN_GUTTER_DRAG_PREFIX = "application/siyuan-gutter";
const SIYUAN_ATTRIBUTE_VIEW_DRAG_PREFIX = `${SIYUAN_GUTTER_DRAG_PREFIX}nodeattributeview`;

export const DEFAULT_DRAG_OVER_INTERVAL_MS = 24;
export const MIN_DRAG_OVER_INTERVAL_MS = 16;
export const MAX_DRAG_OVER_INTERVAL_MS = 80;

const AUTO_SCROLL_EDGE_PX = 48;

function asElement(target: EventTarget | null): Element | undefined {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement ?? undefined;
  return undefined;
}

function modifierSignature(event: DragEvent): string {
  return `${Number(event.altKey)}${Number(event.ctrlKey)}${Number(event.metaKey)}${Number(event.shiftKey)}`;
}

function gutterDragType(event: DragEvent): string | undefined {
  return Array.from(event.dataTransfer?.types ?? [])
    .map((type) => type.toLowerCase())
    .find((type) => type.startsWith(SIYUAN_GUTTER_DRAG_PREFIX));
}

function isOrdinaryBlockDrag(event: DragEvent): boolean {
  const type = gutterDragType(event);
  return Boolean(type && !type.startsWith(SIYUAN_ATTRIBUTE_VIEW_DRAG_PREFIX));
}

export function normalizeDragOverInterval(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_DRAG_OVER_INTERVAL_MS;
  return Math.min(MAX_DRAG_OVER_INTERVAL_MS, Math.max(MIN_DRAG_OVER_INTERVAL_MS, Math.round(parsed)));
}

export class NativeBlockDragOverGovernor {
  private active = false;
  private minimumIntervalMs = DEFAULT_DRAG_OVER_INTERVAL_MS;
  private lastAllowedAt = Number.NEGATIVE_INFINITY;
  private lastTarget?: Element;
  private lastModifiers = "";
  private activeEditor?: HTMLElement;
  private scrollRect?: DOMRect;

  private readonly handleDragStart = () => this.resetDragState();
  private readonly handleDragEnd = () => this.resetDragState();
  private readonly handleDrop = () => this.resetDragState();
  private readonly handleBlur = () => this.resetDragState();

  private readonly handleDragOver = (event: DragEvent) => {
    const eventTarget = asElement(event.target);
    const editor = eventTarget?.closest<HTMLElement>(".protyle-wysiwyg");
    if (!eventTarget || !editor || !isOrdinaryBlockDrag(event) || eventTarget.closest(".av")) {
      this.resetDragState();
      return;
    }

    this.refreshEditor(editor);
    const target = eventTarget.closest<HTMLElement>("[data-node-id]") ?? editor;
    const modifiers = modifierSignature(event);
    const now = this.now();
    const elapsed = now - this.lastAllowedAt;
    const shouldAllow = !this.lastTarget
      || target !== this.lastTarget
      || modifiers !== this.lastModifiers
      || this.isNearAutoScrollEdge(event)
      || elapsed < 0
      || elapsed >= this.minimumIntervalMs;

    if (shouldAllow) {
      this.lastAllowedAt = now;
      this.lastTarget = target;
      this.lastModifiers = modifiers;
      return;
    }

    // Keep the editor a valid drop target while skipping its expensive bubble listeners.
    event.preventDefault();
    event.stopPropagation();
  };

  constructor(
    private readonly documentRef: Document = document,
    private readonly now: () => number = () => performance.now(),
  ) {}

  start(minimumIntervalMs = this.minimumIntervalMs): void {
    this.minimumIntervalMs = normalizeDragOverInterval(minimumIntervalMs);
    if (this.active) return;
    this.active = true;
    this.documentRef.addEventListener("dragstart", this.handleDragStart, true);
    this.documentRef.addEventListener("dragover", this.handleDragOver, true);
    this.documentRef.addEventListener("drop", this.handleDrop, true);
    this.documentRef.addEventListener("dragend", this.handleDragEnd, true);
    this.documentRef.defaultView?.addEventListener("blur", this.handleBlur);
  }

  updateMinimumInterval(value: unknown): void {
    this.minimumIntervalMs = normalizeDragOverInterval(value);
  }

  destroy(): void {
    if (this.active) {
      this.documentRef.removeEventListener("dragstart", this.handleDragStart, true);
      this.documentRef.removeEventListener("dragover", this.handleDragOver, true);
      this.documentRef.removeEventListener("drop", this.handleDrop, true);
      this.documentRef.removeEventListener("dragend", this.handleDragEnd, true);
      this.documentRef.defaultView?.removeEventListener("blur", this.handleBlur);
    }
    this.active = false;
    this.resetDragState();
  }

  private refreshEditor(editor: HTMLElement): void {
    if (editor === this.activeEditor) return;
    this.activeEditor = editor;
    const protyle = editor.closest<HTMLElement>(".protyle");
    const scroller = protyle?.querySelector<HTMLElement>(".protyle-content");
    const rect = scroller?.getBoundingClientRect();
    this.scrollRect = rect && rect.height > 0 ? rect : undefined;
  }

  private isNearAutoScrollEdge(event: DragEvent): boolean {
    if (!this.scrollRect) return false;
    return event.clientY - this.scrollRect.top <= AUTO_SCROLL_EDGE_PX
      || this.scrollRect.bottom - event.clientY <= AUTO_SCROLL_EDGE_PX;
  }

  private resetDragState(): void {
    this.lastAllowedAt = Number.NEGATIVE_INFINITY;
    this.lastTarget = undefined;
    this.lastModifiers = "";
    this.activeEditor = undefined;
    this.scrollRect = undefined;
  }
}

const EDITOR_SELECTOR = ".protyle-wysiwyg";
const BLOCK_SELECTOR = "[data-node-id]";

interface DragOrigin {
  editor: HTMLElement;
  block: HTMLElement;
  clientX: number;
  clientY: number;
  screenX: number;
  screenY: number;
  bridged: boolean;
}

function asElement(target: EventTarget | Node | null): Element | undefined {
  if (target instanceof Element) return target;
  if (target instanceof Node) return target.parentElement ?? undefined;
  return undefined;
}

function blockInEditor(target: EventTarget | Node | null, editor: HTMLElement): HTMLElement | undefined {
  const block = asElement(target)?.closest<HTMLElement>(BLOCK_SELECTOR);
  return block && editor.contains(block) ? block : undefined;
}

function isPlainPrimaryMouseDown(event: MouseEvent): boolean {
  return event.button === 0
    && !event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey;
}

function isTextSelectionSurface(target: Element): boolean {
  return !target.closest(".av, table, .code-block, .render-node, .protyle-action, .sb__resize");
}

export class LegacyBlockSelectionBridge {
  private active = false;
  private dispatchingBridge = false;
  private origin?: DragOrigin;

  private readonly handleMouseDown = (event: MouseEvent) => {
    if (this.dispatchingBridge || !isPlainPrimaryMouseDown(event)) {
      this.origin = undefined;
      return;
    }

    const target = asElement(event.target);
    const editor = target?.closest<HTMLElement>(EDITOR_SELECTOR);
    const block = editor && target && isTextSelectionSurface(target)
      ? blockInEditor(target, editor)
      : undefined;
    if (!editor || !block) {
      this.origin = undefined;
      return;
    }

    this.origin = {
      editor,
      block,
      clientX: event.clientX,
      clientY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
      bridged: false,
    };
  };

  private readonly handleMouseMove = (event: MouseEvent) => {
    const origin = this.origin;
    if (!origin || origin.bridged) return;
    if ((event.buttons & 1) === 0 || !origin.editor.isConnected) {
      this.origin = undefined;
      return;
    }

    // Older SiYuan releases already own content-area block selection.
    if (typeof this.documentRef.onmousemove === "function") {
      origin.bridged = true;
      return;
    }

    const selection = this.documentRef.defaultView?.getSelection();
    const currentBlock = blockInEditor(event.target, origin.editor)
      ?? blockInEditor(selection?.focusNode ?? null, origin.editor);
    if (!currentBlock || currentBlock === origin.block) return;

    origin.bridged = true;
    this.dispatchNativePaddingMouseDown(origin);
  };

  private readonly handleMouseUp = () => {
    this.origin = undefined;
  };

  private readonly handleBlur = () => {
    this.origin = undefined;
  };

  constructor(private readonly documentRef: Document = document) {}

  start(): void {
    if (this.active) return;
    this.active = true;
    this.documentRef.addEventListener("mousedown", this.handleMouseDown, true);
    this.documentRef.addEventListener("mousemove", this.handleMouseMove, true);
    this.documentRef.addEventListener("mouseup", this.handleMouseUp, true);
    this.documentRef.defaultView?.addEventListener("blur", this.handleBlur);
  }

  destroy(): void {
    if (this.active) {
      this.documentRef.removeEventListener("mousedown", this.handleMouseDown, true);
      this.documentRef.removeEventListener("mousemove", this.handleMouseMove, true);
      this.documentRef.removeEventListener("mouseup", this.handleMouseUp, true);
      this.documentRef.defaultView?.removeEventListener("blur", this.handleBlur);
    }
    this.active = false;
    this.origin = undefined;
  }

  private dispatchNativePaddingMouseDown(origin: DragOrigin): void {
    const editorRect = origin.editor.getBoundingClientRect();
    const bridgeEvent = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
      composed: true,
      view: this.documentRef.defaultView ?? undefined,
      button: 0,
      buttons: 1,
      clientX: editorRect.left + 1,
      clientY: origin.clientY,
      screenX: origin.screenX,
      screenY: origin.screenY,
    });

    this.dispatchingBridge = true;
    try {
      origin.editor.dispatchEvent(bridgeEvent);
    } finally {
      this.dispatchingBridge = false;
    }

    // SiYuan checks the padding coordinate synchronously, then keeps this event
    // for the drag rectangle. Restore the real origin before mousemove uses it.
    Object.defineProperty(bridgeEvent, "clientX", {
      configurable: true,
      value: origin.clientX,
    });
  }
}

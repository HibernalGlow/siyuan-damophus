export type AgentPanelModel = {
  panelElement?: HTMLElement;
};

type PanelOrigin = {
  parent: Node;
  nextSibling: ChildNode | null;
};

type ScrollPosition = {
  element: HTMLElement;
  top: number;
  left: number;
};

function movePanel(panel: HTMLElement, move: () => void): void {
  const scrollPositions = [panel, ...panel.querySelectorAll<HTMLElement>("*")]
    .filter((element) => element.scrollTop !== 0 || element.scrollLeft !== 0)
    .map((element): ScrollPosition => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
  move();
  for (const position of scrollPositions) {
    position.element.scrollTop = position.top;
    position.element.scrollLeft = position.left;
  }
}

export class AgentPanelPortal {
  private generation = 0;
  private target?: HTMLElement;
  private panel?: HTMLElement;
  private origin?: PanelOrigin;

  constructor(
    private readonly resolveModel: () => Promise<AgentPanelModel | undefined>,
    private readonly onAttached?: () => void,
    private readonly onCancelled?: () => void,
  ) {}

  async attach(target: HTMLElement): Promise<boolean> {
    const generation = ++this.generation;
    this.target = target;
    target.classList.add("damophus-agent-mobile-dock-host");
    const model = await this.resolveModel();
    if (generation !== this.generation || this.target !== target) {
      this.onCancelled?.();
      return false;
    }

    const panel = model?.panelElement;
    if (!panel) {
      target.classList.remove("damophus-agent-mobile-dock-host");
      this.target = undefined;
      this.onCancelled?.();
      return false;
    }
    if (panel.parentNode && panel.parentElement !== target) {
      this.origin = { parent: panel.parentNode, nextSibling: panel.nextSibling };
    }
    this.panel = panel;
    if (panel.parentElement !== target) movePanel(panel, () => target.replaceChildren(panel));
    this.onAttached?.();
    return true;
  }

  detach(target: HTMLElement): void {
    if (this.target !== target) return;
    ++this.generation;
    if (this.panel?.parentElement === target) this.restorePanel(this.panel);
    target.classList.remove("damophus-agent-mobile-dock-host");
    this.target = undefined;
  }

  stop(): void {
    const target = this.target;
    if (target) this.detach(target);
    else ++this.generation;
    this.panel = undefined;
    this.origin = undefined;
  }

  private restorePanel(panel: HTMLElement): void {
    const origin = this.origin;
    if (!origin) return;
    const nextSibling = origin.nextSibling?.parentNode === origin.parent ? origin.nextSibling : null;
    movePanel(panel, () => origin.parent.insertBefore(panel, nextSibling));
  }
}

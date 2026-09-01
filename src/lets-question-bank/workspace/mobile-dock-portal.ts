type ScrollPosition = {
  element: HTMLElement;
  top: number;
  left: number;
};

export type PersistentMobileDockPortalOptions<App> = {
  mount(host: HTMLElement): App;
  unmount(app: App): void;
};

function captureScroll(host: HTMLElement): ScrollPosition[] {
  return [host, ...host.querySelectorAll<HTMLElement>("*")]
    .filter((element) => element.scrollTop !== 0 || element.scrollLeft !== 0)
    .map((element): ScrollPosition => ({
      element,
      top: element.scrollTop,
      left: element.scrollLeft,
    }));
}

function restoreScroll(positions: readonly ScrollPosition[]): void {
  for (const position of positions) {
    position.element.scrollTop = position.top;
    position.element.scrollLeft = position.left;
  }
}

/** Keeps one mounted question-bank instance alive while SiYuan swaps mobile Docks. */
export class PersistentMobileDockPortal<App> {
  private readonly parkingLot = document.createDocumentFragment();
  private host?: HTMLElement;
  private app?: App;
  private target?: HTMLElement;
  private parkedScroll: ScrollPosition[] = [];

  constructor(private readonly options: PersistentMobileDockPortalOptions<App>) {}

  attach(target: HTMLElement): HTMLElement {
    if (!this.host) return this.mountInto(target);

    this.target = target;
    if (this.host.parentNode !== target) {
      const positions = this.parkedScroll.length > 0
        ? this.parkedScroll
        : captureScroll(this.host);
      target.replaceChildren(this.host);
      restoreScroll(positions);
      this.parkedScroll = [];
    }
    return this.host;
  }

  detach(target: HTMLElement): void {
    if (this.target !== target) return;
    if (this.host?.parentNode === target) {
      this.parkedScroll = captureScroll(this.host);
      this.parkingLot.append(this.host);
    }
    this.target = undefined;
  }

  dispose(): void {
    const app = this.app;
    this.app = undefined;
    this.target = undefined;
    this.parkedScroll = [];
    if (app !== undefined) this.options.unmount(app);
    this.host?.remove();
    this.host = undefined;
  }

  private mountInto(target: HTMLElement): HTMLElement {
    const host = document.createElement("div");
    target.replaceChildren(host);
    this.host = host;
    this.target = target;
    try {
      this.app = this.options.mount(host);
    } catch (error) {
      host.remove();
      this.host = undefined;
      this.target = undefined;
      throw error;
    }
    return host;
  }
}

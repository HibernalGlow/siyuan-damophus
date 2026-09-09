export async function fetchSyncPost(): Promise<{ code: number; data: unknown; msg: string }> {
  return { code: 0, data: undefined, msg: "" };
}

export class Dialog {}

/**
 * Native SiYuan menus live outside the component tree, so tests can only reach
 * them through this recorder: the last built menu is published on
 * `globalThis.__damophusLastMenu`, and its items keep the real `click` handlers.
 */
export interface RecordedMenuItem {
  icon?: string;
  label?: string;
  type?: string;
  submenu?: RecordedMenuItem[];
  click?: (element?: HTMLElement, event?: Event) => void;
}

export interface RecordedMenu {
  items: RecordedMenuItem[];
  opened: boolean;
  closed: boolean;
}

export class Menu implements RecordedMenu {
  items: RecordedMenuItem[] = [];
  opened = false;
  closed = false;
  private readonly closeCB?: () => void;

  constructor(_id?: string, closeCB?: () => void) {
    this.closeCB = closeCB;
    (globalThis as typeof globalThis & { __damophusLastMenu?: Menu }).__damophusLastMenu = this;
  }

  addItem(item: RecordedMenuItem): Menu {
    this.items.push(item);
    return this;
  }

  addSeparator(): Menu {
    return this;
  }

  showSubMenu(): void {}

  open(): void {
    this.opened = true;
  }

  fullscreen(): void {
    this.opened = true;
  }

  close(): void {
    this.closed = true;
    this.closeCB?.();
  }
}
export class Plugin {}
export class ProtyleMethod {
  static highlightRender(): void {}
  static mathRender(): void {}
  static mermaidRender(): void {}
  static flowchartRender(): void {}
  static graphvizRender(): void {}
  static chartRender(): void {}
  static abcRender(): void {}
  static mindmapRender(): void {}
  static plantumlRender(): void {}
  static htmlRender(): void {}
}

export function showMessage(): void {}
export function confirm(_title: string, _content: string, callback?: () => void): void {
  callback?.();
}
export async function openTab(): Promise<void> {}
export function openEmoji(_options: { position: unknown; selectedCB?: (emoji: string) => void }): void {}
export function expandDocTree(): void {}
export function globalCommand(): void {}

export function getFrontend(): string {
  return "desktop";
}

export function getAllEditor(): never[] {
  return [];
}

export function getAllTabs(): never[] {
  return [];
}

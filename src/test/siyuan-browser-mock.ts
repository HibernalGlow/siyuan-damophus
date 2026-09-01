export async function fetchSyncPost(): Promise<{ code: number; data: unknown; msg: string }> {
  return { code: 0, data: undefined, msg: "" };
}

export class Dialog {}
export class Menu {
  addItem(): Menu {
    return this;
  }

  open(): void {}
  close(): void {}
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

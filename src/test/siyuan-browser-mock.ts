export async function fetchSyncPost(): Promise<{ code: number; data: unknown; msg: string }> {
  return { code: 0, data: undefined, msg: "" };
}

export class Dialog {}
export class Menu {}
export class Plugin {}

export function showMessage(): void {}

export function getFrontend(): string {
  return "desktop";
}

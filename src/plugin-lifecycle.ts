import type { SubPlugin } from "./types/plugin";

export async function beginSubPlugin(plugin: SubPlugin): Promise<void> {
  plugin.enabled = true;
  await plugin.onload();
  await plugin.onLayoutReady?.();
}

export function unloadSubPlugin(plugin: SubPlugin): void {
  plugin.enabled = false;
  void plugin.onunload();
}

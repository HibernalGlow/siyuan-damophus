import type { SubPlugin } from "./types/plugin";

export function registerPluginModels(
  plugins: readonly SubPlugin[],
  onError: (plugin: SubPlugin, error: unknown) => void,
): void {
  for (const plugin of plugins) {
    try {
      plugin.registerModels?.();
    } catch (error) {
      onError(plugin, error);
    }
  }
}

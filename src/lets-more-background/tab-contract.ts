export const moreBackgroundTabType = "more-background";

export function moreBackgroundCustomTabId(pluginName: string): string {
  return `${pluginName}${moreBackgroundTabType}`;
}

export function moreBackgroundTabTarget(pluginName: string): {
  id: string;
  data: Record<string, never>;
} {
  return {
    id: moreBackgroundCustomTabId(pluginName),
    data: {},
  };
}

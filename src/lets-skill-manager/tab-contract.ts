export const skillManagerTabType = "skill-manager";

export function skillManagerTabTarget(pluginName: string): { id: string; data: Record<string, never> } {
  return {
    id: `${pluginName}${skillManagerTabType}`,
    data: {},
  };
}

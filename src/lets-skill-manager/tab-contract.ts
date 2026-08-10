export const skillManagerTabType = "skill-manager";
export const skillManagerIcon = "iconListTree";

export function skillManagerTabTarget(pluginName: string): { id: string; data: Record<string, never> } {
  return {
    id: `${pluginName}${skillManagerTabType}`,
    data: {},
  };
}

export const skillManagerTabType = "skill-manager";
export const skillManagerDockType = "damophus-skill-manager-dock-v2";

export function skillManagerTabTarget(pluginName: string): { id: string; data: Record<string, never> } {
  return {
    id: `${pluginName}${skillManagerTabType}`,
    data: {},
  };
}

export const snippetAuditTabType = "snippet-audit";

export function snippetAuditTabTarget(pluginName: string): { id: string; data: Record<string, never> } {
  return { id: `${pluginName}${snippetAuditTabType}`, data: {} };
}

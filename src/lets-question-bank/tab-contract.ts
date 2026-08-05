export const questionBankTabType = "question-bank";

export function questionBankCustomTabId(pluginName: string, blockId?: string): string {
  return `${pluginName}${questionBankTabType}${blockId ? `-${blockId}` : ""}`;
}

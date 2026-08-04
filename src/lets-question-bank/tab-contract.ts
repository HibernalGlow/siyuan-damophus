export const questionBankTabType = "question-bank";

export function questionBankCustomTabId(pluginName: string): string {
  return `${pluginName}${questionBankTabType}`;
}

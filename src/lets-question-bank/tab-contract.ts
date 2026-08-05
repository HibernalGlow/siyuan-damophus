export const questionBankTabType = "question-bank";

export function questionBankCustomTabId(pluginName: string): string {
  return `${pluginName}${questionBankTabType}`;
}

export function questionBankTabTarget(pluginName: string, documentId?: string): {
  id: string;
  data: { documentId?: string };
} {
  return {
    id: questionBankCustomTabId(pluginName),
    data: { documentId },
  };
}

import type { Tab } from "siyuan";

type TabModel = {
  type?: unknown;
  data?: unknown;
};

type ClosableTab = Tab & {
  parent: {
    removeTab(id: string, isBatchClose?: boolean, animate?: boolean): void;
  };
};

function isQuestionBankTab(tab: Tab, tabType: string): boolean {
  const model = tab.model as TabModel | undefined;
  return model?.type === tabType;
}

/**
 * Removes existing question-bank tabs before a replacement is created. The
 * return value distinguishes "no existing tab" from a previously unpinned tab.
 */
export function replaceQuestionBankTabs(tabs: readonly Tab[], tabType: string): boolean | undefined {
  const existing = tabs.filter((tab) => isQuestionBankTab(tab, tabType)) as ClosableTab[];
  if (existing.length === 0) return undefined;
  const pinned = existing.some((tab) => tab.headElement.classList.contains("item--pin"));
  existing.forEach((tab) => tab.parent.removeTab(tab.id, false, false));
  return pinned;
}

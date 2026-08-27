import type { RiffCardRecord } from "./siyuan-adapter";
import { registerFlashcardContribution, getFlashcardContributions, clearFlashcardContributionsByKind, getFlashcardContributionRevision, type FlashcardContribution } from "./contribution-registry";

export interface ReviewToolbarActionContext {
  root: HTMLElement;
  toolbar: HTMLElement;
  trigger: Element;
  documentRef: Document;
  resolveCard(): Promise<RiffCardRecord | undefined>;
  click(selector: string): boolean;
}

export interface ReviewToolbarAction {
  id: string;
  icon: string;
  label: string;
  source?: string;
  execute(context: ReviewToolbarActionContext): void | Promise<void>;
}

export function registerReviewToolbarAction(action: ReviewToolbarAction): () => void {
  const id = action.id.trim();
  if (!id) throw new Error("Review toolbar action id cannot be empty");
  if (id !== action.id) throw new Error("Review toolbar action id cannot have surrounding whitespace");
  return registerFlashcardContribution({ id: `toolbar-action:${id}`, kind: "toolbar-action", owner: action.source ?? "legacy", value: action } satisfies FlashcardContribution<ReviewToolbarAction>);
}

export function getReviewToolbarActions(): ReviewToolbarAction[] {
  return getFlashcardContributions("toolbar-action").map((item) => item.value as ReviewToolbarAction);
}

export function getReviewToolbarAction(id: string): ReviewToolbarAction | undefined {
  return getReviewToolbarActions().find((action) => action.id === id);
}

export function clearReviewToolbarActions(): void {
  clearFlashcardContributionsByKind("toolbar-action");
}

export function getReviewToolbarActionRevision(): number {
  return getFlashcardContributionRevision();
}

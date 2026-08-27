export type FlashcardContributionKind = "review-stage" | "toolbar-action" | "filter" | "batch-operation";

export interface FlashcardReviewStage {
  getRank(blockId: string, root: unknown): number;
}

export interface FlashcardContribution<T = unknown> {
  id: string;
  kind: FlashcardContributionKind;
  owner: string;
  value: T;
  order?: number;
}

const contributions = new Map<string, FlashcardContribution>();
let revision = 0;

export function registerFlashcardContribution<T>(contribution: FlashcardContribution<T>): () => void {
  const id = contribution.id.trim();
  if (!id || id !== contribution.id) throw new Error("Flashcard contribution id must be non-empty and trimmed");
  if (contributions.has(id)) throw new Error(`Flashcard contribution '${id}' is already registered`);
  contributions.set(id, contribution);
  revision += 1;
  return () => {
    if (contributions.get(id) === contribution) {
      contributions.delete(id);
      revision += 1;
    }
  };
}

export function getFlashcardContributions(kind?: FlashcardContributionKind): FlashcardContribution[] {
  return [...contributions.values()]
    .filter((item) => !kind || item.kind === kind)
    .sort((left, right) => (left.order ?? 0) - (right.order ?? 0));
}

export function unregisterFlashcardContributions(owner: string): void {
  let changed = false;
  for (const [id, contribution] of contributions) {
    if (contribution.owner !== owner) continue;
    contributions.delete(id);
    changed = true;
  }
  if (changed) revision += 1;
}

export function getFlashcardContributionRevision(): number { return revision; }

export function clearFlashcardContributionsByOwner(owner: string): void {
  unregisterFlashcardContributions(owner);
}

export function clearFlashcardContributionsByKind(kind: FlashcardContributionKind): void {
  let changed = false;
  for (const [id, contribution] of contributions) {
    if (contribution.kind !== kind) continue;
    contributions.delete(id);
    changed = true;
  }
  if (changed) revision += 1;
}

export function clearFlashcardContributions(): void {
  if (!contributions.size) return;
  contributions.clear();
  revision += 1;
}

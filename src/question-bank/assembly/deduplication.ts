import type {
  CatalogDeduplicationResult,
  QuestionCatalogEntry,
} from "./types";

function canonicalEntry(entries: readonly QuestionCatalogEntry[]): QuestionCatalogEntry {
  return [...entries].sort((left, right) => {
    const leftHasHistory = (left.history?.attempts ?? 0) > 0 ? 1 : 0;
    const rightHasHistory = (right.history?.attempts ?? 0) > 0 ? 1 : 0;
    if (leftHasHistory !== rightHasHistory) return rightHasHistory - leftHasHistory;
    const indexed = (left.indexedAt ?? "").localeCompare(right.indexedAt ?? "");
    if (indexed !== 0) return indexed;
    return left.blockId.localeCompare(right.blockId);
  })[0];
}

export function deduplicateQuestionCatalog(
  source: readonly QuestionCatalogEntry[],
): CatalogDeduplicationResult {
  const byQuestionId = new Map<string, QuestionCatalogEntry[]>();
  for (const entry of source) {
    byQuestionId.set(entry.questionId, [...(byQuestionId.get(entry.questionId) ?? []), entry]);
  }
  const entries: QuestionCatalogEntry[] = [];
  const aliases: CatalogDeduplicationResult["aliases"] = [];
  const conflicts: CatalogDeduplicationResult["conflicts"] = [];
  for (const [questionId, group] of byQuestionId) {
    if (group.length === 1) {
      entries.push(group[0]);
      continue;
    }
    const signatures = new Set(group.map((entry) => entry.contentSignature).filter(Boolean));
    const allSigned = group.every((entry) => Boolean(entry.contentSignature));
    if (!allSigned || signatures.size !== 1) {
      conflicts.push({ questionId, entries: [...group] });
      continue;
    }
    const canonical = canonicalEntry(group);
    entries.push(canonical);
    aliases.push({
      questionId,
      canonical,
      aliases: group.filter((entry) => entry !== canonical),
    });
  }
  return { entries, aliases, conflicts };
}


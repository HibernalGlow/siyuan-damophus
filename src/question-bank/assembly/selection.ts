import type {
  QuestionSetBlueprint,
  QuestionSetFilter,
  QuestionSetQuota,
  QuestionSetQuotaDimension,
} from "./schema";
import type {
  FrozenQuestionSet,
  QuestionCatalogEntry,
  QuestionSetDeficit,
} from "./types";

export interface AssembleQuestionSetInput {
  blueprint: QuestionSetBlueprint;
  catalog: readonly QuestionCatalogEntry[];
  sourceRevision: string;
  setId: string;
  seed: string;
  generatedAt?: string;
  random?: () => number;
}

function matches(values: readonly string[], value: string | undefined): boolean {
  return values.length === 0 || (value !== undefined && values.includes(value));
}

function accuracy(entry: QuestionCatalogEntry): number | undefined {
  const attempts = entry.history?.objectiveCorrect ?? 0;
  const incorrect = entry.history?.objectiveIncorrect ?? 0;
  return attempts + incorrect === 0 ? undefined : attempts / (attempts + incorrect);
}

function matchesHistory(entry: QuestionCatalogEntry, filter: QuestionSetFilter): boolean {
  const history = entry.history;
  if (filter.history === "unattempted" && (history?.attempts ?? 0) > 0) return false;
  if (filter.history === "wrong" && (history?.objectiveIncorrect ?? 0) === 0) return false;
  if (filter.history === "review" && (history?.consecutiveReviewCount ?? 0) === 0) return false;
  if (filter.history === "again-hard" && !["again", "hard"].includes(history?.latestRating ?? "")) return false;
  const ratio = accuracy(entry);
  if (filter.minimum_accuracy !== undefined && (ratio === undefined || ratio < filter.minimum_accuracy)) return false;
  if (filter.maximum_accuracy !== undefined && (ratio === undefined || ratio > filter.maximum_accuracy)) return false;
  const answeredAt = history?.lastAnsweredAt ? Date.parse(history.lastAnsweredAt) : undefined;
  if (filter.answered_before && (answeredAt === undefined || answeredAt >= Date.parse(filter.answered_before))) return false;
  if (filter.answered_after && (answeredAt === undefined || answeredAt <= Date.parse(filter.answered_after))) return false;
  return true;
}

function matchesSource(entry: QuestionCatalogEntry, blueprint: QuestionSetBlueprint): boolean {
  const source = blueprint.source;
  if (source.excluded_document_ids.includes(entry.documentId)) return false;
  if (source.excluded_question_ids.includes(entry.questionId)) return false;
  const hasIncludes = source.notebook_ids.length > 0 || source.document_ids.length > 0 || source.topic_refs.length > 0;
  if (!hasIncludes) return true;
  if (source.notebook_ids.includes(entry.notebookId)) return true;
  if (source.document_ids.includes(entry.documentId)) return true;
  return source.topic_refs.some((topic) => topic.document_id === entry.documentId
    && (topic.topic_id === entry.topicId || topic.topic_id === entry.scopeTopicId));
}

function matchesFilters(entry: QuestionCatalogEntry, filter: QuestionSetFilter): boolean {
  return matches(filter.subjects, entry.subject)
    && matches(filter.categories, entry.category)
    && matches(filter.collections, entry.collection)
    && matches(filter.sources, entry.source)
    && matches(filter.years, entry.year)
    && matches(filter.question_types, entry.questionType)
    && matchesHistory(entry, filter)
    && entry.questionType !== "group";
}

function valueForDimension(entry: QuestionCatalogEntry, dimension: QuestionSetQuotaDimension): string | undefined {
  if (dimension === "question-type") return entry.questionType;
  return entry[dimension];
}

function shuffle<T>(source: readonly T[], random: () => number): T[] {
  const values = [...source];
  for (let index = values.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [values[index], values[target]] = [values[target], values[index]];
  }
  return values;
}

function drawBalanced(
  source: readonly QuestionCatalogEntry[],
  count: number,
  dimensions: readonly QuestionSetQuotaDimension[],
  random: () => number,
): QuestionCatalogEntry[] {
  if (dimensions.length === 0) return shuffle(source, random).slice(0, count);
  const groups = new Map<string, QuestionCatalogEntry[]>();
  for (const entry of shuffle(source, random)) {
    const key = dimensions.map((dimension) => valueForDimension(entry, dimension) ?? "").join("\u001f");
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }
  const queues = shuffle([...groups.values()], random);
  const selected: QuestionCatalogEntry[] = [];
  while (selected.length < count && queues.some((queue) => queue.length > 0)) {
    for (const queue of queues) {
      const entry = queue.shift();
      if (entry) selected.push(entry);
      if (selected.length >= count) break;
    }
  }
  return selected;
}

function draw(
  source: readonly QuestionCatalogEntry[],
  count: number,
  blueprint: QuestionSetBlueprint,
  random: () => number,
): QuestionCatalogEntry[] {
  return blueprint.draw_mode === "balanced"
    ? drawBalanced(source, count, blueprint.balance_dimensions, random)
    : shuffle(source, random).slice(0, count);
}

function matchesQuota(entry: QuestionCatalogEntry, quota: QuestionSetQuota): boolean {
  return valueForDimension(entry, quota.dimension) === quota.value;
}

function relaxedFilters(filters: QuestionSetFilter): QuestionSetFilter {
  return { ...filters, years: [] };
}

function assembleDynamic(
  blueprint: QuestionSetBlueprint,
  catalog: readonly QuestionCatalogEntry[],
  random: () => number,
): { selected: QuestionCatalogEntry[]; widened: boolean; deficits: QuestionSetDeficit[] } {
  const inSource = catalog.filter((entry) => matchesSource(entry, blueprint));
  const exact = inSource.filter((entry) => matchesFilters(entry, blueprint.filters));
  const selected: QuestionCatalogEntry[] = [];
  const selectedIds = new Set<string>();
  const deficits: QuestionSetDeficit[] = [];
  const take = (entries: readonly QuestionCatalogEntry[], count: number): void => {
    for (const entry of draw(entries.filter((candidate) => !selectedIds.has(candidate.questionId)), count, blueprint, random)) {
      selected.push(entry);
      selectedIds.add(entry.questionId);
    }
  };
  for (const quota of blueprint.quotas) {
    const pool = exact.filter((entry) => matchesQuota(entry, quota));
    take(pool, quota.count);
    const actual = selected.filter((entry) => matchesQuota(entry, quota)).length;
    if (actual < quota.count) deficits.push({
      dimension: quota.dimension,
      value: quota.value,
      requested: quota.count,
      available: actual,
    });
  }
  take(exact, blueprint.question_count - selected.length);
  let widened = false;
  if (selected.length < blueprint.question_count && blueprint.allow_controlled_widening) {
    const relaxed = inSource.filter((entry) => matchesFilters(entry, relaxedFilters(blueprint.filters)));
    const before = selected.length;
    take(relaxed, blueprint.question_count - selected.length);
    widened = selected.length > before;
  }
  if (selected.length < blueprint.question_count) deficits.push({
    dimension: "total",
    requested: blueprint.question_count,
    available: selected.length,
  });
  return { selected, widened, deficits };
}

export function assembleQuestionSet(input: AssembleQuestionSetInput): FrozenQuestionSet {
  const random = input.random ?? Math.random;
  const result = input.blueprint.binding_mode === "fixed"
    ? {
        selected: input.blueprint.locked_question_ids.flatMap((questionId) => {
          const entry = input.catalog.find((candidate) => candidate.questionId === questionId);
          return entry ? [entry] : [];
        }),
        widened: false,
        deficits: input.blueprint.locked_question_ids.length === input.blueprint.question_count
          ? []
          : [{
              dimension: "total" as const,
              requested: input.blueprint.question_count,
              available: input.blueprint.locked_question_ids.length,
            }],
      }
    : assembleDynamic(input.blueprint, input.catalog, random);
  return {
    schema_version: 1,
    set_id: input.setId,
    blueprint_id: input.blueprint.blueprint_id,
    blueprint_revision: input.blueprint.revision,
    generated_at: input.generatedAt ?? new Date().toISOString(),
    seed: input.seed,
    source_revision: input.sourceRevision,
    question_ids: result.selected.map((entry) => entry.questionId),
    source_keys: [...new Set(result.selected.map((entry) => entry.documentId))],
    widened: result.widened,
    deficits: result.deficits,
  };
}


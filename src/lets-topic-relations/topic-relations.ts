import {
  resolveTopicDictionaryLabel,
  type TopicDictionaryDocument,
} from "@/question-bank/topic-dictionary";
import type { AttemptAggregate } from "@/question-bank/core/types";

export const QUESTION_TOPICS_ATTRIBUTE = "custom-qb-question-topic-ids";
export const NOTE_TOPIC_ATTRIBUTE = "custom-qb-note-topic-id";
export const TOPIC_RELATION_MARKER_CLASS = "damophus-topic-relations";
export const TOPIC_RELATION_SURFACE_ATTRIBUTE = "data-topic-relations-surface";
export const DEFAULT_SOURCE_PRIORITY = `精讲卷
背诵卷
真金题|真题卷`;
export const DEFAULT_MOBILE_PANEL_HEIGHT = 72;
export const DEFAULT_TOPIC_RELATION_STYLE = "";

const TOPIC_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/u;

export type TopicRelationKind = "note" | "question";
export type TopicRelationDisplayMode = "compact" | "summary" | "expanded";

export interface QuestionProgress {
  attempted: boolean;
  needsReview: boolean;
  attempts: number;
  objectiveCorrect: number;
  objectiveIncorrect: number;
  accuracy?: number;
  latestRating?: string;
  lastAnsweredAt?: string;
}

export type QuestionProgressLoader = (
  blockIds: readonly string[],
) => Promise<ReadonlyMap<string, QuestionProgress>>;

let questionProgressLoader: QuestionProgressLoader | undefined;

export function setQuestionProgressLoader(loader: QuestionProgressLoader | undefined): void {
  questionProgressLoader = loader;
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("damophus-question-progress-loader-updated"));
}

export function getQuestionProgressLoader(): QuestionProgressLoader | undefined {
  return questionProgressLoader;
}

export function questionProgressFromAggregate(
  aggregate: AttemptAggregate | undefined,
  reviewThreshold = 2,
): QuestionProgress {
  const attempts = aggregate?.attempts ?? 0;
  const objectiveCorrect = aggregate?.objectiveCorrect ?? 0;
  const objectiveIncorrect = aggregate?.objectiveIncorrect ?? 0;
  const objectiveAttempts = aggregate?.objectiveAttempts ?? objectiveCorrect + objectiveIncorrect;
  return {
    attempted: attempts > 0,
    needsReview: (aggregate?.consecutiveReviewCount ?? 0) >= reviewThreshold,
    attempts,
    objectiveCorrect,
    objectiveIncorrect,
    accuracy: objectiveAttempts > 0 ? Math.round((objectiveCorrect / objectiveAttempts) * 100) : undefined,
    latestRating: aggregate?.latestRating,
    lastAnsweredAt: aggregate?.lastAnsweredAt,
  };
}

export interface TopicRelationSqlRow {
  relation_kind: TopicRelationKind;
  topic_value: string;
  block_id: string;
  root_id: string;
  type: string;
  subtype: string;
  content: string;
  markdown: string;
  hpath: string;
  updated?: string;
}

export interface TopicRelationAttributeRow {
  block_id: string;
  attribute_name: string;
  attribute_value: string;
}

export interface TopicRelationEntry {
  kind: TopicRelationKind;
  topicId: string;
  blockId: string;
  rootId: string;
  type: string;
  subtype: string;
  content: string;
  markdown: string;
  hpath: string;
  progress?: QuestionProgress;
}

export interface TopicRelationGroup {
  topicId: string;
  label: string;
  notes: TopicRelationEntry[];
  questions: TopicRelationEntry[];
}

export interface TopicRelationTarget {
  element: HTMLElement;
  blockId: string;
  documentId?: string;
  questionTopicIds: string[];
  noteTopicId?: string;
}

export interface TopicRelationSurfaceCandidate {
  element: HTMLElement;
  blockId: string;
  documentId?: string;
}

function documentIdForElement(element: HTMLElement): string | undefined {
  const protyle = element.closest(".protyle");
  const titleId = protyle?.querySelector<HTMLElement>(".protyle-title[data-node-id]")
    ?.getAttribute("data-node-id");
  if (titleId) return titleId;
  return protyle?.querySelector<HTMLElement>(".protyle-breadcrumb__item[data-node-id]")
    ?.getAttribute("data-node-id") ?? undefined;
}

export function parseTopicIds(value: unknown): string[] {
  if (typeof value !== "string") return [];
  const result: string[] = [];
  const seen = new Set<string>();
  for (const rawId of value.split(",")) {
    const topicId = rawId.trim().toLowerCase();
    if (!TOPIC_ID_PATTERN.test(topicId) || seen.has(topicId)) continue;
    seen.add(topicId);
    result.push(topicId);
  }
  return result;
}

export function parsePriorityRules(value: unknown): string[][] {
  if (typeof value !== "string") return [];
  return value.split(/\r?\n/gu).flatMap((line) => {
    const alternatives = line.split("|").map((item) => item.trim()).filter(Boolean);
    return alternatives.length > 0 ? [alternatives] : [];
  });
}

export function clampMobilePanelHeight(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return DEFAULT_MOBILE_PANEL_HEIGHT;
  return Math.min(96, Math.max(45, Math.round(parsed)));
}

export function relationTargetFromElement(element: HTMLElement): TopicRelationTarget | undefined {
  const blockId = element.getAttribute("data-node-id");
  if (!blockId) return undefined;
  const questionTopicIds = parseTopicIds(element.getAttribute(QUESTION_TOPICS_ATTRIBUTE));
  const noteTopicId = parseTopicIds(element.getAttribute(NOTE_TOPIC_ATTRIBUTE))[0];
  if (questionTopicIds.length === 0 && !noteTopicId) return undefined;
  return { element, blockId, documentId: documentIdForElement(element), questionTopicIds, noteTopicId };
}

function isExcludedSurface(element: HTMLElement): boolean {
  return Boolean(element.closest([
    ".block__popover",
    ".search__layout",
    ".sy__backlink",
    `[${TOPIC_RELATION_SURFACE_ATTRIBUTE}]`,
  ].join(",")));
}

function closestOwnedByProtyle<T extends HTMLElement>(
  protyle: HTMLElement,
  selector: string,
): T[] {
  return Array.from(protyle.querySelectorAll<T>(selector)).filter(
    (element) => element.closest(".protyle") === protyle,
  );
}

export function findTopicRelationTargets(root: ParentNode): TopicRelationTarget[] {
  const selector = [
    `.protyle-wysiwyg [data-node-id][${QUESTION_TOPICS_ATTRIBUTE}]`,
    `.protyle-wysiwyg [data-node-id][${NOTE_TOPIC_ATTRIBUTE}]`,
  ].join(",");
  const elements = new Set(root.querySelectorAll<HTMLElement>(selector));
  return Array.from(elements).flatMap((element) => {
    if (isExcludedSurface(element)) return [];
    const target = relationTargetFromElement(element);
    return target ? [target] : [];
  });
}

export function findTopicRelationSurfaceCandidates(
  root: ParentNode,
): TopicRelationSurfaceCandidate[] {
  const candidates: TopicRelationSurfaceCandidate[] = [];
  root.querySelectorAll<HTMLElement>(".protyle").forEach((protyle) => {
    if (isExcludedSurface(protyle)) return;
    const title = closestOwnedByProtyle<HTMLElement>(
      protyle,
      ".protyle-title[data-node-id]",
    )[0];
    if (!title) return;
    const breadcrumbs = closestOwnedByProtyle<HTMLElement>(
      protyle,
      ".protyle-breadcrumb__item[data-node-id]",
    );
    const visibleBlockIds = new Set(closestOwnedByProtyle<HTMLElement>(
      protyle,
      ".protyle-wysiwyg [data-node-id]",
    ).flatMap((element) => {
      const blockId = element.getAttribute("data-node-id");
      return blockId ? [blockId] : [];
    }));
    const orderedIds = [
      title.getAttribute("data-node-id"),
      ...breadcrumbs.map((breadcrumb) => breadcrumb.getAttribute("data-node-id")),
    ];
    const seen = new Set<string>();
    orderedIds.forEach((blockId) => {
      if (!blockId || seen.has(blockId) || visibleBlockIds.has(blockId)) return;
      seen.add(blockId);
      candidates.push({ element: title, blockId, documentId: title.getAttribute("data-node-id") ?? undefined });
    });
  });
  return candidates;
}

export function buildTopicRelationAttributeSql(blockIds: readonly string[]): string {
  const normalized = Array.from(new Set(blockIds.filter(
    (blockId) => /^\d{14}-[a-z0-9]{7}$/u.test(blockId),
  )));
  if (normalized.length === 0) {
    return "SELECT '' AS block_id, '' AS attribute_name, '' AS attribute_value WHERE 0";
  }
  return `SELECT
  block_id,
  name AS attribute_name,
  value AS attribute_value
FROM attributes
WHERE block_id IN (${normalized.map(sqlString).join(", ")})
  AND name IN ('${NOTE_TOPIC_ATTRIBUTE}', '${QUESTION_TOPICS_ATTRIBUTE}')`;
}

export function buildSurfaceTopicRelationTargets(
  candidates: readonly TopicRelationSurfaceCandidate[],
  rows: readonly TopicRelationAttributeRow[],
): TopicRelationTarget[] {
  const attributes = new Map<string, Map<string, string>>();
  rows.forEach((row) => {
    if (!row.block_id || !row.attribute_name) return;
    const blockAttributes = attributes.get(row.block_id) ?? new Map<string, string>();
    blockAttributes.set(row.attribute_name, row.attribute_value ?? "");
    attributes.set(row.block_id, blockAttributes);
  });
  const targets = new Map<HTMLElement, TopicRelationTarget>();
  candidates.forEach((candidate) => {
    if (targets.has(candidate.element)) return;
    const blockAttributes = attributes.get(candidate.blockId);
    if (!blockAttributes) return;
    const questionTopicIds = parseTopicIds(blockAttributes.get(QUESTION_TOPICS_ATTRIBUTE));
    const noteTopicId = parseTopicIds(blockAttributes.get(NOTE_TOPIC_ATTRIBUTE))[0];
    if (questionTopicIds.length === 0 && !noteTopicId) return;
    targets.set(candidate.element, { ...candidate, questionTopicIds, noteTopicId });
  });
  return Array.from(targets.values());
}

export function collectTargetTopicIds(targets: readonly TopicRelationTarget[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const target of targets) {
    for (const topicId of [...target.questionTopicIds, ...(target.noteTopicId ? [target.noteTopicId] : [])]) {
      if (seen.has(topicId)) continue;
      seen.add(topicId);
      result.push(topicId);
    }
  }
  return result;
}

function sqlString(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

export function buildTopicRelationSql(topicIds: readonly string[]): string {
  const normalized = parseTopicIds(topicIds.join(","));
  if (normalized.length === 0) {
    return "SELECT 'note' AS relation_kind, '' AS topic_value, '' AS block_id, '' AS root_id, '' AS type, '' AS subtype, '' AS content, '' AS markdown, '' AS hpath WHERE 0";
  }
  const inList = normalized.map(sqlString).join(", ");
  const exactQuestionMatches = normalized.map((topicId) => (
    `(',' || REPLACE(REPLACE(REPLACE(LOWER(a.value), ' ', ''), CHAR(10), ''), CHAR(13), '') || ',') LIKE '%,${topicId},%'`
  )).join(" OR ");
  return `SELECT
  'note' AS relation_kind,
  LOWER(a.value) AS topic_value,
  a.block_id,
  b.root_id,
  b.type,
  b.subtype,
  b.content,
  b.markdown,
  b.hpath,
  b.updated
FROM attributes a
JOIN blocks b ON b.id = a.block_id
WHERE a.name = '${NOTE_TOPIC_ATTRIBUTE}'
  AND LOWER(a.value) IN (${inList})
UNION ALL
SELECT
  'question' AS relation_kind,
  LOWER(a.value) AS topic_value,
  a.block_id,
  b.root_id,
  b.type,
  b.subtype,
  b.content,
  b.markdown,
  b.hpath,
  b.updated
FROM attributes a
JOIN blocks b ON b.id = a.block_id
WHERE a.name = '${QUESTION_TOPICS_ATTRIBUTE}'
  AND (${exactQuestionMatches})
LIMIT 5000`;
}

function entryFromRow(row: TopicRelationSqlRow, topicId: string): TopicRelationEntry {
  return {
    kind: row.relation_kind,
    topicId,
    blockId: row.block_id,
    rootId: row.root_id,
    type: row.type,
    subtype: row.subtype,
    content: row.content?.trim() ?? "",
    markdown: row.markdown?.trim() ?? "",
    hpath: row.hpath?.trim() ?? "",
  };
}

function priorityIndex(entry: TopicRelationEntry, rules: readonly string[][]): number {
  const haystack = `${entry.hpath}\n${entry.content}`.toLocaleLowerCase();
  const index = rules.findIndex((alternatives) => alternatives.some(
    (keyword) => haystack.includes(keyword.toLocaleLowerCase()),
  ));
  return index < 0 ? rules.length : index;
}

const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });

function compareEntries(
  left: TopicRelationEntry,
  right: TopicRelationEntry,
  rules: readonly string[][],
): number {
  const priority = priorityIndex(left, rules) - priorityIndex(right, rules);
  if (priority !== 0) return priority;
  const path = collator.compare(left.hpath, right.hpath);
  if (path !== 0) return path;
  const content = collator.compare(left.content, right.content);
  return content !== 0 ? content : left.blockId.localeCompare(right.blockId);
}

function visibleLabel(
  entry: TopicRelationEntry | undefined,
  topicId: string,
  dictionary?: TopicDictionaryDocument,
): string {
  const fallback = entry?.content || entry?.markdown.replace(/^#{1,6}\s+/u, "").trim() || topicId;
  return dictionary ? resolveTopicDictionaryLabel(dictionary, topicId, fallback) : fallback;
}

export function buildTopicRelationIndex(
  topicIds: readonly string[],
  rows: readonly TopicRelationSqlRow[],
  priorityRules: readonly string[][],
  dictionary?: TopicDictionaryDocument,
): Map<string, TopicRelationGroup> {
  const normalized = parseTopicIds(topicIds.join(","));
  const requested = new Set(normalized);
  const groups = new Map(normalized.map((topicId) => [topicId, {
    topicId,
    label: topicId,
    notes: [],
    questions: [],
  } satisfies TopicRelationGroup]));
  const seen = new Set<string>();

  for (const row of rows) {
    if (!row?.block_id || !row.relation_kind) continue;
    const rowTopicIds = row.relation_kind === "note"
      ? parseTopicIds(row.topic_value).slice(0, 1)
      : parseTopicIds(row.topic_value);
    for (const topicId of rowTopicIds) {
      if (!requested.has(topicId)) continue;
      const dedupeKey = `${row.relation_kind}:${topicId}:${row.block_id}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const group = groups.get(topicId);
      if (!group) continue;
      const entry = entryFromRow(row, topicId);
      (row.relation_kind === "note" ? group.notes : group.questions).push(entry);
    }
  }

  for (const group of groups.values()) {
    group.notes.sort((left, right) => compareEntries(left, right, priorityRules));
    group.questions.sort((left, right) => compareEntries(left, right, []));
    group.label = visibleLabel(group.notes[0], group.topicId, dictionary);
  }
  return groups;
}

export function relationEntryLabel(entry: TopicRelationEntry): string {
  return entry.content || entry.markdown.replace(/^#{1,6}\s+/u, "").trim() || entry.blockId;
}

import type { AttemptAggregate, AttemptEvent, Question, QuestionBookmark, QuestionGroup, TopicNode } from "../core/types";
import type { QuestionCatalogEntry } from "../assembly/types";
import type { QuestionSourceDocument } from "../adapters/siyuan/source-catalog";

export const QUESTION_AUTHORING_PACKAGE_SCHEMA_VERSION = 1 as const;

export interface QuestionAuthoringPackage {
  schema_version: typeof QUESTION_AUTHORING_PACKAGE_SCHEMA_VERSION;
  exported_at: string;
  plugin_version: string;
  questions: Array<{
    question: Question;
    catalog: QuestionCatalogEntry;
  }>;
  groups: QuestionGroup[];
  topics: TopicNode[];
  attempts: AttemptEvent[];
  aggregates: AttemptAggregate[];
  bookmarks: QuestionBookmark[];
  source_documents: QuestionSourceDocument[];
}

export interface QuestionAuthoringPackageInput {
  pluginVersion: string;
  exportedAt?: string;
  catalog: readonly QuestionCatalogEntry[];
  questions: readonly Question[];
  topics: readonly TopicNode[];
  attempts: readonly AttemptEvent[];
  aggregates: ReadonlyMap<string, AttemptAggregate>;
  bookmarks: ReadonlyMap<string, QuestionBookmark>;
  sourceDocuments: readonly QuestionSourceDocument[];
}

export function createQuestionAuthoringPackage(input: QuestionAuthoringPackageInput): QuestionAuthoringPackage {
  const catalogById = new Map(input.catalog.map((entry) => [entry.questionId, entry]));
  const questions = input.questions.flatMap((question) => {
    const catalog = catalogById.get(question.id);
    return catalog ? [{question, catalog}] : [];
  });
  const groups = input.questions
    .filter((question) => question.type === "group")
    .map((group) => ({
      id: group.id,
      materialMarkdown: group.stemMarkdown,
      questionIds: input.questions
        .filter((question) => question.metadata.parentId === group.id)
        .map((question) => question.id),
    }));
  const topicById = new Map(input.topics.map((topic) => [topic.id, topic]));
  const bookmarks = [...input.bookmarks.values()]
    .sort((left, right) => left.questionId.localeCompare(right.questionId));
  const aggregates = [...input.aggregates.values()]
    .sort((left, right) => left.questionId.localeCompare(right.questionId));
  return {
    schema_version: QUESTION_AUTHORING_PACKAGE_SCHEMA_VERSION,
    exported_at: input.exportedAt ?? new Date().toISOString(),
    plugin_version: input.pluginVersion,
    questions,
    groups,
    topics: [...topicById.values()].sort((left, right) => left.id.localeCompare(right.id)),
    attempts: [...input.attempts],
    aggregates,
    bookmarks,
    source_documents: [...input.sourceDocuments],
  };
}

export function serializeQuestionAuthoringPackage(input: QuestionAuthoringPackageInput): string {
  return `${JSON.stringify(createQuestionAuthoringPackage(input), null, 2)}\n`;
}

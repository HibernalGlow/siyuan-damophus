import type { QuestionType } from "../core/types";

export interface QuestionTopicReference {
  documentId: string;
  topicId: string;
}

export interface QuestionHistorySummary {
  attempts: number;
  objectiveCorrect: number;
  objectiveIncorrect: number;
  consecutiveReviewCount: number;
  latestRating?: "again" | "hard" | "good" | "easy";
  lastAnsweredAt?: string;
}

export interface QuestionCatalogEntry {
  questionId: string;
  blockId: string;
  documentId: string;
  notebookId: string;
  documentTitle?: string;
  documentPath?: string;
  questionTitle?: string;
  questionType: QuestionType;
  subject?: string;
  category?: string;
  collection?: string;
  source?: string;
  year?: string;
  topicId?: string;
  scopeTopicId?: string;
  contentSignature?: string;
  indexedAt?: string;
  history?: QuestionHistorySummary;
}

export interface DuplicateQuestionAlias {
  questionId: string;
  canonical: QuestionCatalogEntry;
  aliases: QuestionCatalogEntry[];
}

export interface QuestionIdConflict {
  questionId: string;
  entries: QuestionCatalogEntry[];
}

export interface CatalogDeduplicationResult {
  entries: QuestionCatalogEntry[];
  aliases: DuplicateQuestionAlias[];
  conflicts: QuestionIdConflict[];
}

export interface QuestionSetDeficit {
  dimension: "total" | "subject" | "category" | "collection" | "source" | "year" | "question-type";
  value?: string;
  requested: number;
  available: number;
}

export interface FrozenQuestionSet {
  schema_version: 1;
  set_id: string;
  blueprint_id: string;
  blueprint_revision: number;
  generated_at: string;
  seed: string;
  source_revision: string;
  question_ids: string[];
  source_keys: string[];
  widened: boolean;
  deficits: QuestionSetDeficit[];
}


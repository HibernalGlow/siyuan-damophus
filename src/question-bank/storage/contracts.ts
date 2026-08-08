import type { MergeableStore } from "tinybase/mergeable-store";
import type { AttemptAggregate, AttemptEvent, ExamSummaryEvent } from "../core/types";
import type { PracticeSessionSnapshot, PracticeSessionSnapshotParseResult } from "../core/session-schema";
import type { ExamSessionSnapshot } from "../exam/schema";
import type { QuestionSetBlueprint } from "../assembly/schema";
import type {
  QuestionAggregateRecord,
  QuestionCatalogRecord,
  QuestionTopicRecord,
  SourceDocumentRecord,
  TopicAnchorRecord,
} from "./schemas";

export interface QuestionCatalogRepository {
  listQuestions(filters?: Partial<QuestionCatalogRecord>): Promise<QuestionCatalogRecord[]>;
  upsertQuestion(id: string, question: QuestionCatalogRecord): Promise<void>;
  listQuestionTopics(questionId?: string): Promise<QuestionTopicRecord[]>;
  replaceQuestionTopics(documentId: string, topics: readonly QuestionTopicRecord[]): Promise<void>;
  markDocumentUnavailable(documentId: string): Promise<void>;
  hydrate(questionIds?: readonly string[]): Promise<unknown>;
}

export interface TopicAnchorRepository {
  listAnchors(topicId?: string): Promise<TopicAnchorRecord[]>;
  upsertAnchor(id: string, anchor: TopicAnchorRecord): Promise<void>;
  markDocumentUnavailable(documentId: string): Promise<void>;
}

export interface AttemptEventRepository {
  append(event: AttemptEvent): Promise<"created" | "duplicate">;
  list(): Promise<AttemptEvent[]>;
  import(events: readonly AttemptEvent[]): Promise<{ created: number; duplicates: number; conflicts: string[] }>;
  export(): Promise<AttemptEvent[]>;
}

export interface ExamEventRepository {
  append(event: ExamSummaryEvent): Promise<"created" | "duplicate">;
  list(): Promise<ExamSummaryEvent[]>;
  import(events: readonly ExamSummaryEvent[]): Promise<{ created: number; duplicates: number; conflicts: string[] }>;
}

export interface PracticeSessionRepository {
  list(): Promise<Array<{ sourceKey: string; deviceId: string; result: PracticeSessionSnapshotParseResult }>>;
  load(sourceKey: string): Promise<PracticeSessionSnapshotParseResult | undefined>;
  save(snapshot: PracticeSessionSnapshot, expectedRevision?: number): Promise<void>;
  remove(sourceKey: string, sessionId?: string): Promise<void>;
}

export interface ExamSessionRepository {
  load(examId?: string): Promise<ExamSessionSnapshot | undefined>;
  save(snapshot: ExamSessionSnapshot, expectedRevision?: number): Promise<void>;
  remove(examId?: string): Promise<void>;
}

export interface QuestionSetBlueprintRepository {
  list(): Promise<QuestionSetBlueprint[]>;
  save(blueprint: QuestionSetBlueprint): Promise<void>;
  remove(blueprintId: string): Promise<void>;
}

export interface AggregateRepository {
  list(): Promise<QuestionAggregateRecord[]>;
  get(questionId: string): Promise<QuestionAggregateRecord | undefined>;
  rebuild(events?: readonly AttemptEvent[]): Promise<void>;
}

export interface CoreCatalogRepository extends QuestionCatalogRepository, TopicAnchorRepository {
  listDocuments(): Promise<Array<SourceDocumentRecord & { documentId: string }>>;
  upsertDocument(id: string, document: SourceDocumentRecord): Promise<void>;
  store(): MergeableStore;
}

export interface DamophusRepositories {
  catalog: CoreCatalogRepository;
  attempts: AttemptEventRepository;
  exams: ExamEventRepository;
  practiceSessions: PracticeSessionRepository;
  examSessions: ExamSessionRepository;
  blueprints: QuestionSetBlueprintRepository;
  aggregates: AggregateRepository;
}

export type { AttemptAggregate };

import { z } from "zod";
import type { AttributeViewKeyType, NodeIdGenerator } from "./types";

export const legacyQuestionFields = [
  "block_id",
  "question_id",
  "question_type",
  "year",
  "subject",
  "category",
  "collection",
  "source",
  "topic_id",
  "parent_id",
  "last_scanned_at",
] as const;

export const legacyAttemptFields = [
  "entry",
  "schema_version",
  "attempt_id",
  "question_id",
  "question_relation",
  "session_id",
  "answered_at",
  "question_type",
  "option_order",
  "selected_option_ids",
  "objective_correct",
  "mastery_rating",
  "subjective_score",
  "duration_ms",
] as const;

export const versionTwoAttemptFields = [
  ...legacyAttemptFields,
  "wrong_value",
] as const;

export const questionFields = [
  "block_id",
  "question_id",
  "question_type",
  "year",
  "subject",
  "category",
  "collection",
  "source",
  "topic_id",
  "parent_id",
  "last_scanned_at",
  "attempts_relation",
  "attempt_count",
  "wrong_count",
  "total_duration_ms",
] as const;

export const attemptFields = [
  "entry",
  "event_kind",
  "schema_version",
  "attempt_id",
  "question_id",
  "question_relation",
  "session_id",
  "answered_at",
  "question_type",
  "option_order",
  "selected_option_ids",
  "objective_correct",
  "wrong_value",
  "mastery_rating",
  "subjective_score",
  "duration_ms",
  "session_mode",
  "rating_source",
  "exam_status",
  "exam_score",
  "exam_max_score",
  "exam_duration_ms",
  "exam_payload",
] as const;

export type QuestionField = typeof questionFields[number];
export type AttemptField = typeof attemptFields[number];

export interface AttributeViewBinding<Field extends string> {
  avId: string;
  blockId: string;
  keys: Record<Field, string>;
}

export interface QuestionBankBinding {
  schemaVersion: 3;
  notebookId: string;
  systemDocumentId: string;
  questionIndex: AttributeViewBinding<QuestionField>;
  attemptLog: AttributeViewBinding<AttemptField>;
}

const nodeId = z.string().regex(/^\d{14}-[a-z0-9]{7}$/u);
const questionKeySchema = z.object(Object.fromEntries(
  questionFields.map((field) => [field, nodeId]),
) as Record<QuestionField, typeof nodeId>);
const attemptKeySchema = z.object(Object.fromEntries(
  attemptFields.map((field) => [field, nodeId]),
) as Record<AttemptField, typeof nodeId>);

export const QuestionBankBindingSchema = z.object({
  schemaVersion: z.literal(3),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({ avId: nodeId, blockId: nodeId, keys: questionKeySchema }),
  attemptLog: z.object({ avId: nodeId, blockId: nodeId, keys: attemptKeySchema }),
});

export const QuestionBankBindingV2Schema = z.object({
  schemaVersion: z.literal(2),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({ avId: nodeId, blockId: nodeId, keys: questionKeySchema }),
  attemptLog: z.object({
    avId: nodeId,
    blockId: nodeId,
    keys: z.object(Object.fromEntries(
      versionTwoAttemptFields.map((field) => [field, nodeId]),
    ) as Record<typeof versionTwoAttemptFields[number], typeof nodeId>),
  }),
});

export const LegacyQuestionBankBindingSchema = z.object({
  schemaVersion: z.literal(1),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({
    avId: nodeId,
    blockId: nodeId,
    keys: z.object(Object.fromEntries(
      legacyQuestionFields.map((field) => [field, nodeId]),
    ) as Record<typeof legacyQuestionFields[number], typeof nodeId>),
  }),
  attemptLog: z.object({
    avId: nodeId,
    blockId: nodeId,
    keys: z.object(Object.fromEntries(
      legacyAttemptFields.map((field) => [field, nodeId]),
    ) as Record<typeof legacyAttemptFields[number], typeof nodeId>),
  }),
});

export interface ColumnDefinition<Field extends string> {
  field: Field;
  name: string;
  type: AttributeViewKeyType;
}

export interface PlannedColumn<Field extends string> extends ColumnDefinition<Field> {
  keyId: string;
}

export const questionColumns: readonly ColumnDefinition<Exclude<QuestionField, "block_id">>[] = [
  { field: "question_id", name: "Question ID", type: "text" },
  { field: "question_type", name: "Question Type", type: "select" },
  { field: "year", name: "Year", type: "select" },
  { field: "subject", name: "Subject", type: "select" },
  { field: "category", name: "Category", type: "select" },
  { field: "collection", name: "Collection", type: "select" },
  { field: "source", name: "Source", type: "select" },
  { field: "topic_id", name: "Topic ID", type: "text" },
  { field: "parent_id", name: "Parent ID", type: "text" },
  { field: "last_scanned_at", name: "Last Scanned", type: "date" },
  { field: "attempts_relation", name: "Attempts", type: "relation" },
  { field: "attempt_count", name: "Attempt Count", type: "rollup" },
  { field: "wrong_count", name: "Wrong Count", type: "rollup" },
  { field: "total_duration_ms", name: "Total Duration (min)", type: "rollup" },
];

export const attemptColumns: readonly ColumnDefinition<Exclude<AttemptField, "entry">>[] = [
  { field: "event_kind", name: "Event Kind", type: "select" },
  { field: "schema_version", name: "Schema Version", type: "number" },
  { field: "attempt_id", name: "Attempt ID", type: "text" },
  { field: "question_id", name: "Question ID", type: "text" },
  { field: "question_relation", name: "Question", type: "relation" },
  { field: "session_id", name: "Session ID", type: "text" },
  { field: "answered_at", name: "Answered At", type: "date" },
  { field: "question_type", name: "Question Type", type: "select" },
  { field: "option_order", name: "Option Order", type: "mSelect" },
  { field: "selected_option_ids", name: "Selected Options", type: "mSelect" },
  { field: "objective_correct", name: "Objective Correct", type: "select" },
  { field: "wrong_value", name: "Wrong Value", type: "number" },
  { field: "mastery_rating", name: "Mastery Rating", type: "select" },
  { field: "subjective_score", name: "Subjective Score", type: "number" },
  { field: "duration_ms", name: "Duration (min)", type: "number" },
  { field: "session_mode", name: "Session Mode", type: "select" },
  { field: "rating_source", name: "Rating Source", type: "select" },
  { field: "exam_status", name: "Exam Status", type: "select" },
  { field: "exam_score", name: "Exam Score", type: "number" },
  { field: "exam_max_score", name: "Exam Max Score", type: "number" },
  { field: "exam_duration_ms", name: "Exam Duration (min)", type: "number" },
  { field: "exam_payload", name: "Exam Payload", type: "text" },
];

export interface InitializeQuestionBankInput {
  notebookId: string;
  path: string;
  idGenerator: NodeIdGenerator;
}

export interface QuestionBankInitializationPreview {
  token: string;
  notebookId: string;
  path: string;
  questionBlockId: string;
  questionAvId: string;
  attemptBlockId: string;
  attemptAvId: string;
  questionColumns: PlannedColumn<Exclude<QuestionField, "block_id">>[];
  attemptColumns: PlannedColumn<Exclude<AttemptField, "entry">>[];
}

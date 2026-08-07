import { z } from "zod";
import { AttemptEventSchema, ExamSummaryEventSchema } from "../core/schema";
import { QuestionTypeSchema } from "../core/schema";
import { PracticeSessionSnapshotSchema } from "../core/session-schema";
import { ExamSessionSnapshotSchema } from "../exam/schema";
import { QuestionSetBlueprintSchema } from "../assembly/schema";

export const StoreKindSchema = z.enum(["core", "sessions", "events"]);
export const StoreEnvelopeSchema = z.object({
  format_version: z.literal(1),
  store_kind: StoreKindSchema,
  device_id: z.string().min(1),
  shard_id: z.string().min(1),
  schema_version: z.number().int().positive(),
  updated_at: z.iso.datetime({ offset: true }),
  content_hash: z.string().regex(/^[a-f0-9]{64}$/),
  mergeable_content: z.unknown(),
});

export const SourceDocumentRecordSchema = z.object({
  notebook_id: z.string().min(1),
  title: z.string(),
  path: z.string().optional(),
  hpath: z.string().optional(),
  source_updated_at: z.string().optional(),
  content_signature: z.string().optional(),
  scan_status: z.enum(["valid", "partial", "invalid", "unavailable"]),
  issue_count: z.number().int().nonnegative(),
  indexed_at: z.string().optional(),
});

export const QuestionCatalogRecordSchema = z.object({
  block_id: z.string().min(1),
  document_id: z.string().min(1),
  notebook_id: z.string().min(1),
  question_type: QuestionTypeSchema,
  title: z.string(),
  year: z.string().optional(),
  subject: z.string().optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  source: z.string().optional(),
  parent_id: z.string().optional(),
  content_signature: z.string().optional(),
  indexed_at: z.string().optional(),
  available: z.boolean(),
});

export const QuestionTopicRecordSchema = z.object({
  question_id: z.string().min(1),
  topic_id: z.string().min(1),
  document_id: z.string().min(1),
});

export const TopicAnchorRecordSchema = z.object({
  topic_id: z.string().min(1),
  document_id: z.string().min(1),
  notebook_id: z.string().min(1),
  title: z.string(),
  path: z.string().optional(),
  hpath: z.string().optional(),
  source_updated_at: z.string().optional(),
  available: z.boolean(),
});

export const QuestionAggregateRecordSchema = z.object({
  question_id: z.string().min(1),
  attempts: z.number().int().nonnegative(),
  timed_attempts: z.number().int().nonnegative().optional(),
  total_duration_ms: z.number().int().nonnegative().optional(),
  objective_attempts: z.number().int().nonnegative(),
  objective_correct: z.number().int().nonnegative(),
  objective_incorrect: z.number().int().nonnegative(),
  consecutive_review_count: z.number().int().nonnegative(),
  consecutive_again_count: z.number().int().nonnegative(),
  consecutive_hard_count: z.number().int().nonnegative(),
  latest_rating: z.string().optional(),
  last_answered_at: z.string().optional(),
  previous_duration_ms: z.number().int().nonnegative().optional(),
  last_duration_ms: z.number().int().nonnegative().optional(),
  last_attempt_id: z.string().optional(),
});

export const PracticeSessionVersionRecordSchema = z.object({
  source_key: z.string().min(1),
  device_id: z.string().min(1),
  session_id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  updated_at: z.iso.datetime({ offset: true }),
  snapshot_json: z.string().min(2),
}).superRefine((row, context) => {
  let parsed: unknown;
  try { parsed = JSON.parse(row.snapshot_json); } catch { parsed = undefined; }
  if (!PracticeSessionSnapshotSchema.safeParse(parsed).success) {
    context.addIssue({ code: "custom", path: ["snapshot_json"], message: "Invalid practice session snapshot" });
  }
});

export const ExamSessionVersionRecordSchema = z.object({
  exam_id: z.string().min(1),
  device_id: z.string().min(1),
  revision: z.number().int().nonnegative(),
  status: z.string().min(1),
  updated_at: z.iso.datetime({ offset: true }),
  snapshot_json: z.string().min(2),
}).superRefine((row, context) => {
  let parsed: unknown;
  try { parsed = JSON.parse(row.snapshot_json); } catch { parsed = undefined; }
  if (!ExamSessionSnapshotSchema.safeParse(parsed).success) {
    context.addIssue({ code: "custom", path: ["snapshot_json"], message: "Invalid exam session snapshot" });
  }
});

export const AttemptEventRecordSchema = AttemptEventSchema;
export const ExamEventRecordSchema = ExamSummaryEventSchema;
export const QuestionSetBlueprintRecordSchema = z.object({
  revision: z.number().int().nonnegative(),
  updated_at: z.iso.datetime({ offset: true }),
  snapshot_json: z.string().min(2),
}).superRefine((row, context) => {
  let parsed: unknown;
  try { parsed = JSON.parse(row.snapshot_json); } catch { parsed = undefined; }
  if (!QuestionSetBlueprintSchema.safeParse(parsed).success) {
    context.addIssue({ code: "custom", path: ["snapshot_json"], message: "Invalid question-set blueprint" });
  }
});

export type StoreEnvelope = z.infer<typeof StoreEnvelopeSchema>;
export type SourceDocumentRecord = z.infer<typeof SourceDocumentRecordSchema>;
export type QuestionCatalogRecord = z.infer<typeof QuestionCatalogRecordSchema>;
export type QuestionTopicRecord = z.infer<typeof QuestionTopicRecordSchema>;
export type TopicAnchorRecord = z.infer<typeof TopicAnchorRecordSchema>;
export type QuestionAggregateRecord = z.infer<typeof QuestionAggregateRecordSchema>;
export type PracticeSessionVersionRecord = z.infer<typeof PracticeSessionVersionRecordSchema>;
export type ExamSessionVersionRecord = z.infer<typeof ExamSessionVersionRecordSchema>;

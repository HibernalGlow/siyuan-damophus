import { z } from "zod";

export const ExamOrderSchema = z.enum(["sequential", "random"]);
export const ExamScoringModeSchema = z.enum(["legal-exam", "strict"]);
export const ExamStatusSchema = z.enum([
  "active",
  "submitting",
  "submit-failed",
  "pending-manual-score",
  "submitted",
  "finalized",
  "abandoned",
]);

export const ExamBlueprintSchema = z.object({
  schema_version: z.literal(1),
  title: z.string().min(1),
  /** Current document key, frozen set_id, or reusable blueprint_id. */
  source_key: z.string().min(1),
  source_label: z.string().optional(),
  scope_id: z.string().optional(),
  question_ids: z.array(z.string().min(1)).min(1),
  order: ExamOrderSchema,
  time_limit_ms: z.number().int().nonnegative(),
  strict_timeout: z.boolean(),
  allow_answer_reveal: z.boolean(),
  scoring_mode: ExamScoringModeSchema,
  subjective_points: z.number().finite().positive().default(10),
});

export const ExamQuestionDraftSchema = z.object({
  question_id: z.string().min(1),
  option_order: z.array(z.string().min(1)),
  selected_option_ids: z.array(z.string().min(1)),
  answer_text: z.string().optional(),
  marked: z.boolean(),
  revealed: z.boolean(),
  elapsed_ms: z.number().int().nonnegative(),
  subjective_score: z.number().finite().min(0).max(100).optional(),
});

export const ExamSessionSnapshotSchema = z.object({
  schema_version: z.literal(1),
  revision: z.number().int().nonnegative(),
  exam_id: z.string().min(1),
  status: ExamStatusSchema,
  blueprint: ExamBlueprintSchema,
  queue_question_ids: z.array(z.string().min(1)).min(1),
  current_question_id: z.string().min(1),
  drafts: z.record(z.string(), ExamQuestionDraftSchema),
  committed_question_ids: z.array(z.string().min(1)),
  started_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  deadline_at: z.iso.datetime({ offset: true }).optional(),
  overdue_at: z.iso.datetime({ offset: true }).optional(),
  submitted_at: z.iso.datetime({ offset: true }).optional(),
  abandoned_at: z.iso.datetime({ offset: true }).optional(),
  submission_error: z.string().optional(),
});

export type ExamBlueprint = z.infer<typeof ExamBlueprintSchema>;
export type ExamQuestionDraft = z.infer<typeof ExamQuestionDraftSchema>;
export type ExamSessionSnapshot = z.infer<typeof ExamSessionSnapshotSchema>;
export type ExamStatus = z.infer<typeof ExamStatusSchema>;
export type ExamScoringMode = z.infer<typeof ExamScoringModeSchema>;

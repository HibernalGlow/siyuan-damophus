import { z } from "zod";

export const QuestionTypeSchema = z.enum([
  "single",
  "multiple",
  "indefinite",
  "true-false",
  "subjective",
  "group",
]);

export const MasteryRatingSchema = z.enum(["again", "hard", "good", "easy"]);
export const SessionModeSchema = z.enum(["practice", "exam"]);
export const RatingSourceSchema = z.enum(["user", "exam-auto"]);

export const QuestionOptionSchema = z.object({
  id: z.string().min(1),
  markdown: z.string(),
});

export const ObjectiveAnswerSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("options"), optionIds: z.array(z.string().min(1)).min(1) }),
  z.object({ kind: z.literal("boolean"), value: z.boolean() }),
]);

export const QuestionMetadataSchema = z.object({
  year: z.string().optional(),
  subject: z.string().optional(),
  category: z.string().optional(),
  collection: z.string().optional(),
  source: z.string().optional(),
  topicId: z.string().optional(),
  scopeTopicId: z.string().optional(),
  topicPath: z.array(z.string()),
  parentId: z.string().optional(),
});

export const QuestionSchema = z
  .object({
    id: z.string().min(1),
    type: QuestionTypeSchema,
    title: z.string().min(1),
    stemMarkdown: z.string(),
    options: z.array(QuestionOptionSchema),
    answer: ObjectiveAnswerSchema.optional(),
    solutionMarkdown: z.string(),
    metadata: QuestionMetadataSchema,
  })
  .superRefine((question, context) => {
    if (["single", "multiple", "indefinite", "true-false"].includes(question.type) && !question.answer) {
      context.addIssue({ code: "custom", message: "Objective questions require an answer" });
    }
    if (["single", "multiple", "indefinite"].includes(question.type) && question.options.length < 2) {
      context.addIssue({ code: "custom", message: "Choice questions require at least two options" });
    }
    const optionIds = question.options.map((option) => option.id);
    if (new Set(optionIds).size !== optionIds.length) {
      context.addIssue({ code: "custom", message: "Question option IDs must be unique" });
    }
    if (["single", "multiple", "indefinite"].includes(question.type)) {
      if (question.answer?.kind !== "options") {
        context.addIssue({ code: "custom", message: "Choice questions require option answers" });
      } else {
        const expectedCount = question.type === "multiple" ? 2 : 1;
        if (question.answer.optionIds.length < expectedCount) {
          context.addIssue({
            code: "custom",
            message: question.type === "multiple"
              ? "Multiple-choice questions require at least two answers"
              : "Single-choice and indefinite-choice questions require at least one answer",
          });
        }
        if (question.type === "single" && question.answer.optionIds.length !== 1) {
          context.addIssue({ code: "custom", message: "Single-choice questions require exactly one answer" });
        }
        for (const answerId of question.answer.optionIds) {
          if (!optionIds.includes(answerId)) {
            context.addIssue({ code: "custom", message: `Unknown answer option ID: ${answerId}` });
          }
        }
      }
    }
    if (question.type === "true-false" && question.answer?.kind !== "boolean") {
      context.addIssue({ code: "custom", message: "True/false questions require a boolean answer" });
    }
    if (question.type === "true-false" && question.options.length > 0) {
      const ids = new Set(question.options.map((option) => option.id));
      if (ids.size !== 2 || !ids.has("true") || !ids.has("false")) {
        context.addIssue({ code: "custom", message: "True/false options must be true and false" });
      }
    }
    if (question.type === "subjective" || question.type === "group") {
      if (question.answer) {
        context.addIssue({ code: "custom", message: "Subjective and group questions cannot have machine answers" });
      }
    }
  });

export const AttemptEventSchema = z.object({
  schema_version: z.literal(1),
  event_kind: z.literal("question_attempt").default("question_attempt"),
  attempt_id: z.string().min(1),
  question_id: z.string().min(1),
  question_relation: z.string().optional(),
  session_id: z.string().min(1),
  answered_at: z.iso.datetime({ offset: true }),
  question_type: QuestionTypeSchema,
  option_order: z.array(z.string()),
  selected_option_ids: z.array(z.string()),
  objective_correct: z.boolean().nullable(),
  mastery_rating: MasteryRatingSchema,
  session_mode: SessionModeSchema.default("practice"),
  rating_source: RatingSourceSchema.default("user"),
  subjective_score: z.number().finite().min(0).max(100).optional(),
  duration_ms: z.number().int().nonnegative().optional(),
}).superRefine((attempt, context) => {
  if (attempt.question_type === "group") {
    context.addIssue({ code: "custom", message: "Question groups cannot produce attempt events" });
  }
  if (attempt.question_type === "subjective" && attempt.objective_correct !== null) {
    context.addIssue({ code: "custom", message: "Subjective attempts cannot have an objective result" });
  }
  if (attempt.question_type !== "subjective" && attempt.subjective_score !== undefined) {
    context.addIssue({ code: "custom", message: "Only subjective attempts can have a subjective score" });
  }
  if (["single", "multiple", "indefinite", "true-false"].includes(attempt.question_type)
    && attempt.objective_correct === null) {
    context.addIssue({ code: "custom", message: "Objective attempts require an objective result" });
  }
});

export const ExamSummaryEventSchema = z.object({
  schema_version: z.literal(1),
  event_kind: z.enum(["exam_submitted", "exam_finalized", "exam_abandoned"]),
  attempt_id: z.string().min(1),
  session_id: z.string().min(1),
  answered_at: z.iso.datetime({ offset: true }),
  session_mode: z.literal("exam"),
  exam_status: z.enum(["pending_manual_score", "submitted", "finalized", "abandoned"]),
  exam_score: z.number().finite().optional(),
  exam_max_score: z.number().finite().optional(),
  exam_duration_ms: z.number().int().nonnegative().optional(),
  exam_payload: z.string(),
});

export const AttemptExportSchema = z.object({
  schema_version: z.literal(1),
  exported_at: z.iso.datetime({ offset: true }),
  plugin_version: z.string().min(1),
  attempts: z.array(AttemptEventSchema),
});

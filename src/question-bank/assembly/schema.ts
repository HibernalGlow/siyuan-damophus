import { z } from "zod";

export const QuestionSetDrawModeSchema = z.enum(["balanced", "uniform"]);
export const QuestionSetBindingModeSchema = z.enum(["dynamic", "fixed"]);
export const QuestionSetHistoryFilterSchema = z.enum([
  "all",
  "unattempted",
  "wrong",
  "review",
  "again-hard",
]);
export const QuestionSetQuotaDimensionSchema = z.enum([
  "subject",
  "category",
  "collection",
  "source",
  "year",
  "question-type",
]);

export const QuestionTopicReferenceSchema = z.object({
  document_id: z.string().min(1),
  topic_id: z.string().min(1),
});

export const QuestionSetSourceSelectionSchema = z.object({
  notebook_ids: z.array(z.string().min(1)).default([]),
  document_ids: z.array(z.string().min(1)).default([]),
  topic_refs: z.array(QuestionTopicReferenceSchema).default([]),
  excluded_document_ids: z.array(z.string().min(1)).default([]),
  excluded_question_ids: z.array(z.string().min(1)).default([]),
});

export const QuestionSetFilterSchema = z.object({
  subjects: z.array(z.string().min(1)).default([]),
  categories: z.array(z.string().min(1)).default([]),
  collections: z.array(z.string().min(1)).default([]),
  sources: z.array(z.string().min(1)).default([]),
  years: z.array(z.string().min(1)).default([]),
  question_types: z.array(z.enum([
    "single",
    "multiple",
    "indefinite",
    "true-false",
    "subjective",
    "group",
  ])).default([]),
  history: QuestionSetHistoryFilterSchema.default("all"),
  minimum_accuracy: z.number().min(0).max(1).optional(),
  maximum_accuracy: z.number().min(0).max(1).optional(),
  answered_before: z.iso.datetime({ offset: true }).optional(),
  answered_after: z.iso.datetime({ offset: true }).optional(),
});

export const QuestionSetQuotaSchema = z.object({
  dimension: QuestionSetQuotaDimensionSchema,
  value: z.string().min(1),
  count: z.number().int().positive(),
});

export const QuestionSetBlueprintSchema = z.object({
  schema_version: z.literal(1),
  blueprint_id: z.string().min(1),
  revision: z.number().int().positive(),
  name: z.string().min(1),
  binding_mode: QuestionSetBindingModeSchema.default("dynamic"),
  source: QuestionSetSourceSelectionSchema,
  filters: QuestionSetFilterSchema,
  question_count: z.number().int().positive(),
  quotas: z.array(QuestionSetQuotaSchema).default([]),
  draw_mode: QuestionSetDrawModeSchema.default("balanced"),
  balance_dimensions: z.array(QuestionSetQuotaDimensionSchema).default(["subject", "category"]),
  allow_controlled_widening: z.boolean().default(true),
  locked_question_ids: z.array(z.string().min(1)).default([]),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
}).superRefine((blueprint, context) => {
  if (blueprint.binding_mode === "fixed" && blueprint.locked_question_ids.length === 0) {
    context.addIssue({
      code: "custom",
      message: "Fixed question sets require locked question IDs",
      path: ["locked_question_ids"],
    });
  }
  const quotaTotal = blueprint.quotas.reduce((total, quota) => total + quota.count, 0);
  if (quotaTotal > blueprint.question_count) {
    context.addIssue({
      code: "custom",
      message: "Quota counts cannot exceed the total question count",
      path: ["quotas"],
    });
  }
  if (blueprint.filters.minimum_accuracy !== undefined
    && blueprint.filters.maximum_accuracy !== undefined
    && blueprint.filters.minimum_accuracy > blueprint.filters.maximum_accuracy) {
    context.addIssue({
      code: "custom",
      message: "Minimum accuracy cannot exceed maximum accuracy",
      path: ["filters"],
    });
  }
});

export type QuestionSetBlueprint = z.infer<typeof QuestionSetBlueprintSchema>;
export type QuestionSetFilter = z.infer<typeof QuestionSetFilterSchema>;
export type QuestionSetQuota = z.infer<typeof QuestionSetQuotaSchema>;
export type QuestionSetQuotaDimension = z.infer<typeof QuestionSetQuotaDimensionSchema>;


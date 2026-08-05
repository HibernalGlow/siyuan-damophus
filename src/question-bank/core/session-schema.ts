import { z } from "zod";
import { QuestionTypeSchema } from "./schema";
import type { Question, QuestionType } from "./types";

export const PRACTICE_SESSION_SCHEMA_VERSION = 1 as const;

export const PracticeFilterSchema = z.enum(["all", "wrong", "review", "due"]);
export const PracticeOrderSchema = z.enum(["sequential", "random"]);

export const PracticeDraftSchema = z.object({
  question_id: z.string().min(1),
  question_type: QuestionTypeSchema,
  option_order: z.array(z.string().min(1)),
  available_option_ids: z.array(z.string().min(1)),
  answer_signature: z.string(),
  selected_option_ids: z.array(z.string().min(1)),
  revealed: z.boolean(),
  objective_correct: z.boolean().nullable(),
  subjective_score: z.number().finite().min(0).max(100).optional(),
  elapsed_ms: z.number().int().nonnegative(),
});

export const PracticeSessionSnapshotSchema = z.object({
  schema_version: z.literal(PRACTICE_SESSION_SCHEMA_VERSION),
  revision: z.number().int().nonnegative(),
  session_id: z.string().min(1),
  source_key: z.string().min(1),
  source_label: z.string().optional(),
  scope_id: z.string().optional(),
  filter: PracticeFilterSchema,
  order: PracticeOrderSchema,
  queue_question_ids: z.array(z.string().min(1)).min(1),
  current_question_id: z.string().min(1),
  drafts: z.record(z.string(), PracticeDraftSchema),
  completed_question_ids: z.array(z.string().min(1)),
  session_elapsed_ms: z.number().int().nonnegative(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export type PracticeSessionFilter = z.infer<typeof PracticeFilterSchema>;
export type PracticeSessionOrder = z.infer<typeof PracticeOrderSchema>;
export type PracticeDraft = z.infer<typeof PracticeDraftSchema>;
export type PracticeSessionSnapshot = z.infer<typeof PracticeSessionSnapshotSchema>;

export type PracticeSessionSnapshotParseResult =
  | { status: "ok"; snapshot: PracticeSessionSnapshot }
  | { status: "unsupported"; schemaVersion: number }
  | { status: "invalid"; message: string };

export interface CreatePracticeSessionInput {
  sessionId: string;
  sourceKey: string;
  sourceLabel?: string;
  scopeId?: string;
  filter: PracticeSessionFilter;
  order: PracticeSessionOrder;
  queue: ReadonlyArray<{ question: Question; optionOrder: readonly string[] }>;
  now?: Date;
}

export function questionOptionIds(question: Question): string[] {
  if (question.type === "true-false" && question.options.length === 0) {
    return ["true", "false"];
  }
  return question.options.map((option) => option.id);
}

export function questionAnswerSignature(question: Question): string {
  if (!question.answer) return "";
  return question.answer.kind === "boolean"
    ? `boolean:${String(question.answer.value)}`
    : `options:${[...question.answer.optionIds].sort().join(",")}`;
}

export function createPracticeDraft(
  question: Pick<Question, "id" | "type" | "options" | "answer">,
  optionOrder: readonly string[] = questionOptionIds(question as Question),
): PracticeDraft {
  const availableOptionIds = questionOptionIds(question as Question);
  const available = new Set(availableOptionIds);
  const normalizedOrder = [
    ...optionOrder.filter((optionId) => available.has(optionId)),
    ...availableOptionIds.filter((optionId) => !optionOrder.includes(optionId)),
  ];
  return {
    question_id: question.id,
    question_type: question.type,
    option_order: normalizedOrder,
    available_option_ids: availableOptionIds,
    answer_signature: questionAnswerSignature(question as Question),
    selected_option_ids: [],
    revealed: false,
    objective_correct: null,
    elapsed_ms: 0,
  };
}

export function createPracticeSessionSnapshot(
  input: CreatePracticeSessionInput,
): PracticeSessionSnapshot {
  if (input.queue.length === 0) throw new Error("A practice session requires at least one question");
  const timestamp = (input.now ?? new Date()).toISOString();
  const drafts = Object.fromEntries(input.queue.map(({ question, optionOrder }) => [
    question.id,
    createPracticeDraft(question, optionOrder),
  ]));
  return PracticeSessionSnapshotSchema.parse({
    schema_version: PRACTICE_SESSION_SCHEMA_VERSION,
    revision: 0,
    session_id: input.sessionId,
    source_key: input.sourceKey,
    source_label: input.sourceLabel,
    scope_id: input.scopeId,
    filter: input.filter,
    order: input.order,
    queue_question_ids: input.queue.map(({ question }) => question.id),
    current_question_id: input.queue[0].question.id,
    drafts,
    completed_question_ids: [],
    session_elapsed_ms: 0,
    created_at: timestamp,
    updated_at: timestamp,
  });
}

export function parsePracticeSessionSnapshot(value: unknown): PracticeSessionSnapshotParseResult {
  if (!value || typeof value !== "object") {
    return { status: "invalid", message: "Practice session snapshot must be an object" };
  }
  const schemaVersion = (value as { schema_version?: unknown }).schema_version;
  if (typeof schemaVersion === "number" && schemaVersion !== PRACTICE_SESSION_SCHEMA_VERSION) {
    return { status: "unsupported", schemaVersion };
  }
  const parsed = PracticeSessionSnapshotSchema.safeParse(value);
  return parsed.success
    ? { status: "ok", snapshot: parsed.data }
    : { status: "invalid", message: z.prettifyError(parsed.error) };
}

export function emptyDraftForQuestionType(
  questionId: string,
  questionType: QuestionType,
): PracticeDraft {
  return {
    question_id: questionId,
    question_type: questionType,
    option_order: [],
    available_option_ids: [],
    answer_signature: "",
    selected_option_ids: [],
    revealed: false,
    objective_correct: null,
    elapsed_ms: 0,
  };
}

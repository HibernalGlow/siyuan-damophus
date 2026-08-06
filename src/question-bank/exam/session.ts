import { createActor, setup, assign, type ActorRefFrom, type SnapshotFrom } from "xstate";
import type { Question } from "../core/types";
import { shuffleQuestionOptions } from "../core/shuffle";
import {
  ExamBlueprintSchema,
  ExamSessionSnapshotSchema,
  type ExamBlueprint,
  type ExamSessionSnapshot,
} from "./schema";

export interface CreateExamSessionInput {
  examId: string;
  blueprint: ExamBlueprint;
  questions: readonly Question[];
  /** Optional pre-frozen queue supplied by a future cross-document assembler. */
  queueQuestionIds?: readonly string[];
  now?: number;
  random?: () => number;
}

function iso(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

function revise(snapshot: ExamSessionSnapshot, now: number): ExamSessionSnapshot {
  return ExamSessionSnapshotSchema.parse({
    ...snapshot,
    revision: snapshot.revision + 1,
    updated_at: iso(now),
  }) as ExamSessionSnapshot;
}

export function createExamSessionSnapshot(input: CreateExamSessionInput): ExamSessionSnapshot {
  const blueprint = ExamBlueprintSchema.parse(input.blueprint) as ExamBlueprint;
  const byId = new Map(input.questions.map((question) => [question.id, question]));
  const selected = blueprint.question_ids.map((id) => {
    const question = byId.get(id);
    if (!question) throw new Error(`Exam question '${id}' is unavailable`);
    return question;
  });
  const random = input.random ?? Math.random;
  const queue = input.queueQuestionIds
    ? input.queueQuestionIds.map((id) => {
      const question = byId.get(id);
      if (!question) throw new Error(`Exam question '${id}' is unavailable`);
      return question;
    })
    : blueprint.order === "random"
      ? [...selected].sort(() => random() - 0.5)
      : selected;
  if (queue.length === 0) throw new Error("Exam queue cannot be empty");
  const blueprintIds = new Set(blueprint.question_ids);
  const queueIds = queue.map((question) => question.id);
  if (new Set(queueIds).size !== queueIds.length || queueIds.some((id) => !blueprintIds.has(id))) {
    throw new Error("Frozen exam queue must contain unique blueprint question IDs");
  }
  const timestamp = input.now ?? Date.now();
  const drafts = Object.fromEntries(queue.map((question) => [
    question.id,
    {
      question_id: question.id,
      option_order: shuffleQuestionOptions(question, random).optionOrder,
      selected_option_ids: [],
      marked: false,
      revealed: false,
      elapsed_ms: 0,
    },
  ]));
  return ExamSessionSnapshotSchema.parse({
    schema_version: 1,
    revision: 0,
    exam_id: input.examId,
    status: "active",
    blueprint,
    queue_question_ids: queue.map((question) => question.id),
    current_question_id: queue[0].id,
    drafts,
    committed_question_ids: [],
    started_at: iso(timestamp),
    updated_at: iso(timestamp),
    deadline_at: blueprint.time_limit_ms > 0 ? iso(timestamp + blueprint.time_limit_ms) : undefined,
  }) as ExamSessionSnapshot;
}

type ExamEvent =
  | { type: "NAVIGATE"; questionId: string; now: number }
  | { type: "ANSWER"; questionId: string; selectedOptionIds?: string[]; answerText?: string; elapsedMs?: number; now: number }
  | { type: "TOGGLE_MARK"; questionId: string; now: number }
  | { type: "REVEAL"; questionId: string; now: number }
  | { type: "CHECK_DEADLINE"; now: number }
  | { type: "SUBMIT"; now: number }
  | { type: "SUBMIT_FAILED"; message: string; now: number }
  | { type: "RETRY_SUBMIT"; now: number }
  | { type: "COMMIT_QUESTION"; questionId: string; now: number }
  | { type: "SUBMIT_COMPLETE"; pendingManualScore: boolean; now: number }
  | { type: "SELF_SCORE"; questionId: string; score: number; now: number }
  | { type: "FINALIZE"; now: number }
  | { type: "ABANDON"; now: number };

function patchDraft(
  snapshot: ExamSessionSnapshot,
  questionId: string,
  patch: Partial<ExamSessionSnapshot["drafts"][string]>,
  now: number,
): ExamSessionSnapshot {
  const draft = snapshot.drafts[questionId];
  if (!draft) return snapshot;
  return revise({
    ...snapshot,
    drafts: { ...snapshot.drafts, [questionId]: { ...draft, ...patch } },
  }, now);
}

export const examSessionMachine = setup({
  types: {
    context: {} as { session: ExamSessionSnapshot },
    input: {} as { snapshot: ExamSessionSnapshot },
    events: {} as ExamEvent,
  },
  guards: {
    strictDeadlineExpired: ({ context, event }) => event.type === "CHECK_DEADLINE"
      && context.session.blueprint.strict_timeout
      && Boolean(context.session.deadline_at)
      && event.now >= Date.parse(context.session.deadline_at!),
    deadlineExpired: ({ context, event }) => event.type === "CHECK_DEADLINE"
      && Boolean(context.session.deadline_at)
      && event.now >= Date.parse(context.session.deadline_at!),
    canReveal: ({ context }) => context.session.blueprint.allow_answer_reveal,
  },
  actions: {
    navigate: assign(({ context, event }) => event.type === "NAVIGATE"
      && context.session.queue_question_ids.includes(event.questionId)
      ? { session: revise({ ...context.session, current_question_id: event.questionId }, event.now) }
      : {}),
    answer: assign(({ context, event }) => event.type === "ANSWER" ? {
      session: patchDraft(context.session, event.questionId, {
        selected_option_ids: event.selectedOptionIds,
        answer_text: event.answerText,
        elapsed_ms: event.elapsedMs,
      }, event.now),
    } : {}),
    toggleMark: assign(({ context, event }) => event.type === "TOGGLE_MARK" ? {
      session: patchDraft(context.session, event.questionId, {
        marked: !context.session.drafts[event.questionId]?.marked,
      }, event.now),
    } : {}),
    reveal: assign(({ context, event }) => event.type === "REVEAL" ? {
      session: patchDraft(context.session, event.questionId, { revealed: true }, event.now),
    } : {}),
    markOverdue: assign(({ context, event }) => event.type === "CHECK_DEADLINE"
      && !context.session.overdue_at ? {
        session: revise({ ...context.session, overdue_at: iso(event.now) }, event.now),
      } : {}),
    startSubmitting: assign(({ context, event }) => ({
      session: revise({ ...context.session, status: "submitting", submission_error: undefined }, event.now),
    })),
    commitQuestion: assign(({ context, event }) => event.type === "COMMIT_QUESTION" ? {
      session: revise({
        ...context.session,
        committed_question_ids: [...new Set([...context.session.committed_question_ids, event.questionId])],
      }, event.now),
    } : {}),
    failSubmission: assign(({ context, event }) => event.type === "SUBMIT_FAILED" ? {
      session: revise({ ...context.session, status: "submit-failed", submission_error: event.message }, event.now),
    } : {}),
    completeSubmission: assign(({ context, event }) => event.type === "SUBMIT_COMPLETE" ? {
      session: revise({
        ...context.session,
        status: event.pendingManualScore ? "pending-manual-score" : "submitted",
        submitted_at: iso(event.now),
      }, event.now),
    } : {}),
    selfScore: assign(({ context, event }) => event.type === "SELF_SCORE" ? {
      session: patchDraft(context.session, event.questionId, { subjective_score: event.score }, event.now),
    } : {}),
    finalize: assign(({ context, event }) => ({
      session: revise({ ...context.session, status: "finalized" }, event.now),
    })),
    abandon: assign(({ context, event }) => ({
      session: revise({ ...context.session, status: "abandoned", abandoned_at: iso(event.now) }, event.now),
    })),
  },
}).createMachine({
  id: "damophus-exam-session",
  initial: "active",
  context: ({ input }) => ({ session: ExamSessionSnapshotSchema.parse(input.snapshot) as ExamSessionSnapshot }),
  states: {
    active: {
      on: {
        NAVIGATE: { actions: "navigate" },
        ANSWER: { actions: "answer" },
        TOGGLE_MARK: { actions: "toggleMark" },
        REVEAL: { guard: "canReveal", actions: "reveal" },
        CHECK_DEADLINE: [
          { guard: "strictDeadlineExpired", target: "submitting", actions: "startSubmitting" },
          { guard: "deadlineExpired", actions: "markOverdue" },
        ],
        SUBMIT: { target: "submitting", actions: "startSubmitting" },
        ABANDON: { target: "abandoned", actions: "abandon" },
      },
    },
    submitting: {
      on: {
        COMMIT_QUESTION: { actions: "commitQuestion" },
        SUBMIT_FAILED: { target: "submit-failed", actions: "failSubmission" },
        SUBMIT_COMPLETE: [
          { guard: ({ event }) => event.pendingManualScore, target: "pending-manual-score", actions: "completeSubmission" },
          { target: "submitted", actions: "completeSubmission" },
        ],
      },
    },
    "submit-failed": {
      on: { RETRY_SUBMIT: { target: "submitting", actions: "startSubmitting" } },
    },
    "pending-manual-score": {
      on: {
        SELF_SCORE: { actions: "selfScore" },
        FINALIZE: { target: "finalized", actions: "finalize" },
      },
    },
    submitted: {},
    finalized: {},
    abandoned: {},
  },
});

export type ExamSessionActor = ActorRefFrom<typeof examSessionMachine>;
export type ExamSessionActorSnapshot = SnapshotFrom<typeof examSessionMachine>;

export function createExamSessionActor(snapshot: ExamSessionSnapshot): ExamSessionActor {
  return createActor(examSessionMachine, { input: { snapshot } });
}

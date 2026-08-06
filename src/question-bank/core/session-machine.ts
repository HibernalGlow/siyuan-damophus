import { and, assign, setup } from "xstate";
import type { AttemptEvent } from "./types";
import type { PracticeDraft, PracticeSessionSnapshot } from "./session-schema";

export interface PracticeSessionMachineInput {
  snapshot: PracticeSessionSnapshot;
  attempts?: ReadonlyMap<string, AttemptEvent>;
  now?: number;
  pauseOnAnswerReveal?: boolean;
}

export interface PracticeSessionMachineContext {
  session: PracticeSessionSnapshot;
  attemptsByQuestionId: Record<string, AttemptEvent>;
  activeSinceMs?: number;
  questionActiveSinceMs?: number;
  pendingQuestionId?: string;
  error?: string;
  pauseOnAnswerReveal: boolean;
}

export type PracticeSessionMachineEvent =
  | { type: "DRAFT_CHANGED"; questionId: string; patch: Partial<Pick<PracticeDraft,
    "selected_option_ids" | "revealed" | "objective_correct" | "subjective_score">>; now: number }
  | { type: "NAVIGATE"; questionId: string; now: number }
  | { type: "PAUSE"; now: number }
  | { type: "RESUME"; now: number }
  | { type: "RESET_QUESTION_TIMER"; now: number }
  | { type: "END"; now: number }
  | { type: "BEGIN_SUBMIT"; questionId: string; now: number }
  | { type: "SUBMIT_SUCCEEDED"; attempt: AttemptEvent; now: number }
  | { type: "SUBMIT_FAILED"; message: string; now: number }
  | { type: "REVIEW"; questionId: string; now: number }
  | { type: "EXIT_REVIEW"; now: number };

function iso(now: number): string {
  return new Date(now).toISOString();
}

function checkpoint(
  context: PracticeSessionMachineContext,
  now: number,
): PracticeSessionMachineContext {
  const sessionDelta = context.activeSinceMs === undefined ? 0 : Math.max(0, now - context.activeSinceMs);
  const questionDelta = context.questionActiveSinceMs === undefined
    ? 0
    : Math.max(0, now - context.questionActiveSinceMs);
  const currentId = context.session.current_question_id;
  const currentDraft = context.session.drafts[currentId];
  return {
    ...context,
    session: {
      ...context.session,
      revision: context.session.revision + 1,
      session_elapsed_ms: context.session.session_elapsed_ms + sessionDelta,
      drafts: currentDraft && questionDelta > 0
        ? {
            ...context.session.drafts,
            [currentId]: { ...currentDraft, elapsed_ms: currentDraft.elapsed_ms + questionDelta },
          }
        : context.session.drafts,
      updated_at: iso(now),
    },
    activeSinceMs: now,
    questionActiveSinceMs: now,
  };
}

function nextUnfinished(session: PracticeSessionSnapshot, afterQuestionId: string): string | undefined {
  const completed = new Set(session.completed_question_ids);
  const start = session.queue_question_ids.indexOf(afterQuestionId);
  return session.queue_question_ids.find((questionId, index) => index > start && !completed.has(questionId))
    ?? session.queue_question_ids.find((questionId) => !completed.has(questionId));
}

function commitSubmission(
  context: PracticeSessionMachineContext,
  event: Extract<PracticeSessionMachineEvent, { type: "SUBMIT_SUCCEEDED" }>,
): PracticeSessionMachineContext {
  const checked = checkpoint(context, event.now);
  const completedQuestionIds = [...new Set([
    ...checked.session.completed_question_ids,
    event.attempt.question_id,
  ])];
  const session = { ...checked.session, completed_question_ids: completedQuestionIds };
  const nextQuestionId = nextUnfinished(session, event.attempt.question_id);
  return {
    ...checked,
    session: {
      ...session,
      current_question_id: nextQuestionId ?? event.attempt.question_id,
    },
    attemptsByQuestionId: {
      ...checked.attemptsByQuestionId,
      [event.attempt.question_id]: event.attempt,
    },
    pendingQuestionId: undefined,
    error: undefined,
    questionActiveSinceMs: nextQuestionId ? event.now : undefined,
    activeSinceMs: nextQuestionId ? event.now : undefined,
  };
}

const machineSetup = setup({
  types: {
    context: {} as PracticeSessionMachineContext,
    events: {} as PracticeSessionMachineEvent,
    input: {} as PracticeSessionMachineInput,
  },
  guards: {
    sessionAlreadyComplete: ({ context }) => (
      context.session.completed_question_ids.length >= context.session.queue_question_ids.length
    ),
    validNavigation: ({ context, event }) => (
      "questionId" in event && context.session.queue_question_ids.includes(event.questionId)
    ),
    currentQuestionCanSubmit: ({ context, event }) => (
      event.type === "BEGIN_SUBMIT"
      && event.questionId === context.session.current_question_id
      && !context.session.completed_question_ids.includes(event.questionId)
      && Boolean(context.session.drafts[event.questionId]?.revealed)
    ),
    submissionCompletesSession: ({ context, event }) => (
      event.type === "SUBMIT_SUCCEEDED"
      && new Set([...context.session.completed_question_ids, event.attempt.question_id]).size
        >= context.session.queue_question_ids.length
    ),
    submissionMatchesPending: ({ context, event }) => (
      event.type === "SUBMIT_SUCCEEDED"
      && event.attempt.question_id === context.pendingQuestionId
      && event.attempt.session_id === context.session.session_id
    ),
  },
  actions: {
    changeDraft: assign(({ context, event }) => {
      if (event.type !== "DRAFT_CHANGED") return context;
      const checked = checkpoint(context, event.now);
      const draft = checked.session.drafts[event.questionId];
      if (!draft || checked.session.completed_question_ids.includes(event.questionId)) return checked;
      const revealed = event.patch.revealed === true;
      const retrying = event.patch.revealed === false;
      return {
        ...checked,
        activeSinceMs: revealed && checked.pauseOnAnswerReveal ? undefined : retrying ? event.now : checked.activeSinceMs,
        questionActiveSinceMs: revealed && checked.pauseOnAnswerReveal ? undefined : retrying ? event.now : checked.questionActiveSinceMs,
        session: {
          ...checked.session,
          drafts: {
            ...checked.session.drafts,
            [event.questionId]: { ...draft, ...event.patch },
          },
        },
        error: undefined,
      };
    }),
    resetQuestionTimer: assign(({ context, event }) => {
      if (event.type !== "RESET_QUESTION_TIMER") return context;
      const checked = checkpoint(context, event.now);
      const questionId = checked.session.current_question_id;
      const draft = checked.session.drafts[questionId];
      if (!draft) return checked;
      const frozen = checked.pauseOnAnswerReveal && draft.revealed;
      return {
        ...checked,
        session: {
          ...checked.session,
          drafts: { ...checked.session.drafts, [questionId]: { ...draft, elapsed_ms: 0 } },
        },
        questionActiveSinceMs: frozen ? undefined : event.now,
        activeSinceMs: frozen ? undefined : checked.activeSinceMs ?? event.now,
      };
    }),
    navigate: assign(({ context, event }) => {
      if (!(event.type === "NAVIGATE" || event.type === "REVIEW")) return context;
      const checked = checkpoint(context, event.now);
      const nextDraft = checked.session.drafts[event.questionId];
      const frozen = checked.pauseOnAnswerReveal && Boolean(nextDraft?.revealed);
      return {
        ...checked,
        session: { ...checked.session, current_question_id: event.questionId },
        activeSinceMs: frozen ? undefined : checked.activeSinceMs,
        questionActiveSinceMs: frozen || checked.session.completed_question_ids.includes(event.questionId)
          ? undefined
          : event.now,
      };
    }),
    pause: assign(({ context, event }) => {
      if (event.type !== "PAUSE") return context;
      const checked = checkpoint(context, event.now);
      return { ...checked, activeSinceMs: undefined, questionActiveSinceMs: undefined };
    }),
    resume: assign(({ context, event }) => event.type === "RESUME" ? {
      ...context,
      activeSinceMs: event.now,
      questionActiveSinceMs: context.session.completed_question_ids.includes(
        context.session.current_question_id,
      ) ? undefined : event.now,
      error: undefined,
    } : context),
    end: assign(({ context, event }) => {
      if (event.type !== "END") return context;
      const checked = checkpoint(context, event.now);
      return { ...checked, activeSinceMs: undefined, questionActiveSinceMs: undefined };
    }),
    beginSubmission: assign(({ context, event }) => {
      if (event.type !== "BEGIN_SUBMIT") return context;
      const checked = checkpoint(context, event.now);
      return {
        ...checked,
        pendingQuestionId: event.questionId,
        activeSinceMs: undefined,
        questionActiveSinceMs: undefined,
        error: undefined,
      };
    }),
    commitSubmission: assign(({ context, event }) => (
      event.type === "SUBMIT_SUCCEEDED" ? commitSubmission(context, event) : context
    )),
    failSubmission: assign(({ context, event }) => {
      if (event.type !== "SUBMIT_FAILED") return context;
      const draft = context.session.drafts[context.session.current_question_id];
      const frozen = context.pauseOnAnswerReveal && Boolean(draft?.revealed);
      return {
        ...context,
        pendingQuestionId: undefined,
        activeSinceMs: frozen ? undefined : event.now,
        questionActiveSinceMs: frozen ? undefined : event.now,
        error: event.message,
      };
    }),
    exitReview: assign(({ context, event }) => event.type === "EXIT_REVIEW" ? {
      ...context,
      activeSinceMs: undefined,
      questionActiveSinceMs: undefined,
    } : context),
  },
});

export const practiceSessionMachine = machineSetup.createMachine({
  id: "practice-session",
  initial: "checking",
  context: ({ input }) => {
    const now = input.now ?? Date.now();
    const complete = input.snapshot.completed_question_ids.length >= input.snapshot.queue_question_ids.length;
    return {
      session: input.snapshot,
      attemptsByQuestionId: Object.fromEntries(input.attempts ?? []),
      activeSinceMs: complete || (input.pauseOnAnswerReveal !== false && input.snapshot.drafts[input.snapshot.current_question_id]?.revealed) ? undefined : now,
      questionActiveSinceMs: complete || (input.pauseOnAnswerReveal !== false && input.snapshot.drafts[input.snapshot.current_question_id]?.revealed) || input.snapshot.completed_question_ids.includes(
        input.snapshot.current_question_id,
      ) ? undefined : now,
      pauseOnAnswerReveal: input.pauseOnAnswerReveal !== false,
    };
  },
  states: {
    checking: {
      always: [
        { guard: "sessionAlreadyComplete", target: "completed" },
        { target: "active" },
      ],
    },
    active: {
      on: {
        DRAFT_CHANGED: { actions: "changeDraft" },
        NAVIGATE: { guard: "validNavigation", actions: "navigate" },
        PAUSE: { target: "paused", actions: "pause" },
        END: { target: "ended", actions: "end" },
        BEGIN_SUBMIT: {
          guard: "currentQuestionCanSubmit",
          target: "submitting",
          actions: "beginSubmission",
        },
        RESET_QUESTION_TIMER: { actions: "resetQuestionTimer" },
      },
    },
    submitting: {
      on: {
        SUBMIT_SUCCEEDED: [
          {
            guard: and(["submissionMatchesPending", "submissionCompletesSession"]),
            target: "completed",
            actions: "commitSubmission",
          },
          { guard: "submissionMatchesPending", target: "active", actions: "commitSubmission" },
        ],
        SUBMIT_FAILED: { target: "active", actions: "failSubmission" },
      },
    },
    paused: {
      on: {
        RESUME: { target: "active", actions: "resume" },
        END: { target: "ended", actions: "end" },
      },
    },
    completed: {
      on: {
        REVIEW: { guard: "validNavigation", target: "reviewing", actions: "navigate" },
        END: { target: "ended", actions: "end" },
      },
    },
    reviewing: {
      on: {
        NAVIGATE: { guard: "validNavigation", actions: "navigate" },
        EXIT_REVIEW: { target: "completed", actions: "exitReview" },
        END: { target: "ended", actions: "end" },
      },
    },
    ended: { type: "final" },
  },
});

export function practiceSessionElapsedMs(context: PracticeSessionMachineContext, now = Date.now()): number {
  return context.session.session_elapsed_ms
    + (context.activeSinceMs === undefined ? 0 : Math.max(0, now - context.activeSinceMs));
}

export function practiceQuestionElapsedMs(context: PracticeSessionMachineContext, now = Date.now()): number {
  const draft = context.session.drafts[context.session.current_question_id];
  return (draft?.elapsed_ms ?? 0)
    + (context.questionActiveSinceMs === undefined ? 0 : Math.max(0, now - context.questionActiveSinceMs));
}

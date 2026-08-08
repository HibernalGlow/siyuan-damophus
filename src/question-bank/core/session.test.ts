import { createActor } from "xstate";
import { describe, expect, it } from "vitest";
import type { AttemptEvent, Question } from "./types";
import {
  practiceQuestionElapsedMs,
  practiceSessionElapsedMs,
  practiceSessionMachine,
} from "./session-machine";
import { reconcilePracticeSession } from "./session-recovery";
import {
  createPracticeSessionSnapshot,
  parsePracticeSessionSnapshot,
} from "./session-schema";

const first: Question = {
  id: "question-1",
  type: "single",
  title: "First",
  stemMarkdown: "First stem",
  options: [
    { id: "A", markdown: "Alpha" },
    { id: "B", markdown: "Beta" },
  ],
  answer: { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "First solution",
  metadata: { topicPath: ["Topic"] },
};

const second: Question = {
  ...first,
  id: "question-2",
  title: "Second",
  answer: { kind: "options", optionIds: ["B"] },
};

function snapshot() {
  return createPracticeSessionSnapshot({
    sessionId: "session-1",
    sourceKey: "source-1",
    scopeId: "topic-1",
    filter: "all",
    order: "random",
    queue: [
      { question: first, optionOrder: ["B", "A"] },
      { question: second, optionOrder: ["A", "B"] },
    ],
    now: new Date("2026-08-06T00:00:00.000Z"),
  });
}

function attempt(questionId: string, rating: AttemptEvent["mastery_rating"] = "good"): AttemptEvent {
  return {
    schema_version: 1,
    attempt_id: `attempt-${questionId}`,
    question_id: questionId,
    session_id: "session-1",
    answered_at: "2026-08-06T00:01:00.000Z",
    question_type: "single",
    option_order: ["B", "A"],
    selected_option_ids: ["A"],
    objective_correct: true,
    mastery_rating: rating,
    duration_ms: 3_000,
  };
}

describe("practice session snapshot", () => {
  it("keeps portable IDs and rejects unsupported versions", () => {
    const value = snapshot();
    expect(value.queue_question_ids).toEqual(["question-1", "question-2"]);
    expect(value.drafts["question-1"].option_order).toEqual(["B", "A"]);
    expect(parsePracticeSessionSnapshot(value).status).toBe("ok");
    expect(parsePracticeSessionSnapshot({ ...value, filter: "unattempted" }).status).toBe("ok");
    expect(parsePracticeSessionSnapshot({ ...value, schema_version: 2 })).toEqual({
      status: "unsupported",
      schemaVersion: 2,
    });
  });
});

describe("practice session machine", () => {
  it("opens a fully submitted recovered queue in completion review", () => {
    const completeSnapshot = {
      ...snapshot(),
      completed_question_ids: ["q1", "q2"],
    };
    const actor = createActor(practiceSessionMachine, {
      input: {
        snapshot: completeSnapshot,
        attempts: new Map([
          ["q1", attempt("q1")],
          ["q2", attempt("q2")],
        ]),
        now: 1_000,
      },
    }).start();

    expect(actor.getSnapshot().matches("completed")).toBe(true);
    expect(practiceSessionElapsedMs(actor.getSnapshot().context, 5_000)).toBe(0);
  });

  it("preserves independent drafts while resetting question time on navigation", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000, pauseOnAnswerReveal: false } }).start();
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { selected_option_ids: ["A"], revealed: true, objective_correct: true },
      now: 2_000,
    });
    actor.send({ type: "NAVIGATE", questionId: "question-2", now: 2_500 });
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-2",
      patch: { selected_option_ids: ["B"] },
      now: 3_000,
    });
    actor.send({ type: "NAVIGATE", questionId: "question-1", now: 3_500 });

    const context = actor.getSnapshot().context;
    expect(context.session.current_question_id).toBe("question-1");
    expect(context.session.drafts["question-1"]).toMatchObject({
      selected_option_ids: ["A"],
      revealed: true,
      objective_correct: true,
    });
    expect(context.session.drafts["question-2"].selected_option_ids).toEqual(["B"]);
    expect(context.session.drafts["question-1"].elapsed_ms).toBe(0);
    expect(practiceQuestionElapsedMs(context, 4_500)).toBe(1_000);
    actor.stop();
  });

  it("excludes paused time from session and question timers", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000 } }).start();
    actor.send({ type: "PAUSE", now: 4_000 });
    let context = actor.getSnapshot().context;
    expect(actor.getSnapshot().matches("paused")).toBe(true);
    expect(practiceSessionElapsedMs(context, 40_000)).toBe(3_000);
    expect(practiceQuestionElapsedMs(context, 40_000)).toBe(3_000);

    actor.send({ type: "RESUME", now: 50_000 });
    context = actor.getSnapshot().context;
    expect(practiceSessionElapsedMs(context, 52_000)).toBe(5_000);
    expect(practiceQuestionElapsedMs(context, 52_000)).toBe(5_000);
    actor.stop();
  });

  it("pauses timing while viewing an answer and resumes after retry", () => {
    const actor = createActor(practiceSessionMachine, {
      input: { snapshot: snapshot(), now: 1_000, pauseOnAnswerReveal: true },
    }).start();
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { selected_option_ids: ["A"], revealed: true, objective_correct: true },
      now: 4_000,
    });
    expect(practiceQuestionElapsedMs(actor.getSnapshot().context, 40_000)).toBe(3_000);
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { selected_option_ids: [], revealed: false, objective_correct: null },
      now: 41_000,
    });
    expect(practiceQuestionElapsedMs(actor.getSnapshot().context, 43_000)).toBe(5_000);
    actor.stop();
  });

  it("resets only the current question timer", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000 } }).start();
    actor.send({ type: "RESET_QUESTION_TIMER", now: 4_000 });
    const context = actor.getSnapshot().context;
    expect(context.session.session_elapsed_ms).toBe(3_000);
    expect(context.session.drafts["question-1"].elapsed_ms).toBe(0);
    expect(practiceQuestionElapsedMs(context, 5_000)).toBe(1_000);
    actor.stop();
  });

  it("locks navigation while submitting and advances after durable success", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000 } }).start();
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { selected_option_ids: ["A"], revealed: true, objective_correct: true },
      now: 2_000,
    });
    actor.send({ type: "BEGIN_SUBMIT", questionId: "question-1", now: 3_000 });
    actor.send({ type: "NAVIGATE", questionId: "question-2", now: 3_100 });
    expect(actor.getSnapshot().matches("submitting")).toBe(true);
    expect(actor.getSnapshot().context.session.current_question_id).toBe("question-1");

    actor.send({ type: "SUBMIT_SUCCEEDED", attempt: attempt("question-1"), now: 4_000 });
    const context = actor.getSnapshot().context;
    expect(actor.getSnapshot().matches("active")).toBe(true);
    expect(context.session.completed_question_ids).toEqual(["question-1"]);
    expect(context.session.current_question_id).toBe("question-2");
    expect(context.attemptsByQuestionId["question-1"].mastery_rating).toBe("good");
    actor.stop();
  });

  it("resets a previously visited question timer after automatic advance", () => {
    const resumed = snapshot();
    resumed.drafts["question-2"] = { ...resumed.drafts["question-2"], elapsed_ms: 6_000 };
    const actor = createActor(practiceSessionMachine, { input: { snapshot: resumed, now: 1_000 } }).start();
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { selected_option_ids: ["A"], revealed: true, objective_correct: true },
      now: 2_000,
    });
    actor.send({ type: "BEGIN_SUBMIT", questionId: "question-1", now: 3_000 });
    actor.send({ type: "SUBMIT_SUCCEEDED", attempt: attempt("question-1"), now: 4_000 });

    const context = actor.getSnapshot().context;
    expect(context.session.current_question_id).toBe("question-2");
    expect(context.session.drafts["question-2"].elapsed_ms).toBe(0);
    expect(practiceQuestionElapsedMs(context, 5_000)).toBe(1_000);
    actor.stop();
  });

  it("ignores submission success for another question or session", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000 } }).start();
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { selected_option_ids: ["A"], revealed: true, objective_correct: true },
      now: 2_000,
    });
    actor.send({ type: "BEGIN_SUBMIT", questionId: "question-1", now: 3_000 });

    actor.send({ type: "SUBMIT_SUCCEEDED", attempt: attempt("question-2"), now: 4_000 });
    expect(actor.getSnapshot().matches("submitting")).toBe(true);
    expect(actor.getSnapshot().context.session.completed_question_ids).toEqual([]);

    actor.send({
      type: "SUBMIT_SUCCEEDED",
      attempt: { ...attempt("question-1"), session_id: "another-session" },
      now: 5_000,
    });
    expect(actor.getSnapshot().matches("submitting")).toBe(true);
    expect(actor.getSnapshot().context.session.completed_question_ids).toEqual([]);
    expect(actor.getSnapshot().context.attemptsByQuestionId).toEqual({});
    actor.stop();
  });

  it("completes after the final submission and supports read-only review", () => {
    const initial = snapshot();
    initial.completed_question_ids = ["question-1"];
    const actor = createActor(practiceSessionMachine, {
      input: {
        snapshot: { ...initial, current_question_id: "question-2" },
        attempts: new Map([["question-1", attempt("question-1")]]),
        now: 1_000,
      },
    }).start();
    actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-2",
      patch: { selected_option_ids: ["B"], revealed: true, objective_correct: true },
      now: 2_000,
    });
    actor.send({ type: "BEGIN_SUBMIT", questionId: "question-2", now: 3_000 });
    actor.send({ type: "SUBMIT_SUCCEEDED", attempt: attempt("question-2", "easy"), now: 4_000 });
    expect(actor.getSnapshot().matches("completed")).toBe(true);

    actor.send({ type: "REVIEW", questionId: "question-1", now: 5_000 });
    expect(actor.getSnapshot().matches("reviewing")).toBe(true);
    expect(actor.getSnapshot().context.session.current_question_id).toBe("question-1");
    actor.send({ type: "EXIT_REVIEW", now: 6_000 });
    expect(actor.getSnapshot().matches("completed")).toBe(true);
    actor.stop();
  });
});

describe("practice session recovery", () => {
  it("keeps the original queue, skips deleted questions, and trusts durable attempts", () => {
    const source = snapshot();
    const added = { ...second, id: "question-new", title: "New" };
    const result = reconcilePracticeSession(source, [first, added], [attempt("question-1")]);

    expect(result.snapshot?.queue_question_ids).toEqual(["question-1"]);
    expect(result.snapshot?.completed_question_ids).toEqual(["question-1"]);
    expect(result.snapshot?.queue_question_ids).not.toContain("question-new");
    expect(result.issues).toContainEqual({ code: "missing-question", questionId: "question-2" });
  });

  it("resets only a draft whose answer structure changed", () => {
    const source = snapshot();
    source.drafts["question-1"] = {
      ...source.drafts["question-1"],
      selected_option_ids: ["A"],
      revealed: true,
      objective_correct: true,
      elapsed_ms: 4_000,
    };
    const changed = { ...first, answer: { kind: "options" as const, optionIds: ["B"] } };
    const result = reconcilePracticeSession(source, [changed, second], []);

    expect(result.snapshot?.drafts["question-1"]).toMatchObject({
      selected_option_ids: [],
      revealed: false,
      objective_correct: null,
      elapsed_ms: 0,
    });
    expect(result.snapshot?.drafts["question-2"].option_order).toEqual(["A", "B"]);
    expect(result.issues).toContainEqual({
      code: "changed-question-structure",
      questionId: "question-1",
    });
  });
});

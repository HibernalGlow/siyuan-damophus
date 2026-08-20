import { describe, expect, it } from "vitest";
import { createActor } from "xstate";
import { practiceSessionMachine } from "../question-bank/core/session-machine";
import { practiceQuestionElapsedMs, practiceSessionElapsedMs, createPracticeSessionSnapshot } from "../question-bank/core";
import type { Question } from "../question-bank/core/types";

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
    now: new Date("2026-08-20T00:00:00.000Z"),
  });
}

describe("pause on blur timing behavior", () => {
  it("freezes elapsed time when paused on blur and resumes when re-focused", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000 } }).start();

    // Active for 3 seconds: from t=1000 to t=4000
    // Blur event occurs at t=4000
    actor.send({ type: "PAUSE_TIMER", now: 4_000 });

    let context = actor.getSnapshot().context;
    expect(context.timerPaused).toBe(true);
    // At t=10000, 6 seconds later while away, elapsed time should remain 3000ms
    expect(practiceSessionElapsedMs(context, 10_000)).toBe(3_000);
    expect(practiceQuestionElapsedMs(context, 10_000)).toBe(3_000);

    // User comes back and clicks into question bank at t=12000
    actor.send({ type: "RESUME_TIMER", now: 12_000 });
    context = actor.getSnapshot().context;
    expect(context.timerPaused).toBe(false);

    // At t=15000 (3 seconds after resume), total elapsed time should be 3000 + 3000 = 6000ms
    expect(practiceSessionElapsedMs(context, 15_000)).toBe(6_000);
    expect(practiceQuestionElapsedMs(context, 15_000)).toBe(6_000);

    actor.stop();
  });

  it("does not advance question elapsed time while paused across navigation", () => {
    const actor = createActor(practiceSessionMachine, { input: { snapshot: snapshot(), now: 1_000 } }).start();

    // Active for 2 seconds: t=1000 -> t=3000
    actor.send({ type: "PAUSE_TIMER", now: 3_000 });

    // Navigate to next question while paused
    actor.send({ type: "NAVIGATE", questionId: "question-2", now: 5_000 });
    let context = actor.getSnapshot().context;
    expect(context.session.current_question_id).toBe("question-2");
    expect(context.timerPaused).toBe(true);
    expect(practiceQuestionElapsedMs(context, 8_000)).toBe(0);

    // Resume on question-2 at t=10000
    actor.send({ type: "RESUME_TIMER", now: 10_000 });
    context = actor.getSnapshot().context;
    expect(practiceQuestionElapsedMs(context, 13_000)).toBe(3_000);
    expect(practiceSessionElapsedMs(context, 13_000)).toBe(5_000); // 2000 on q1 + 3000 on q2

    actor.stop();
  });
});

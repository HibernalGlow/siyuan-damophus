import { describe, expect, it } from "vitest";
import type { Question } from "../core/types";
import {
  buildExamSubmissionPlan,
  buildExamSummaryEvent,
  createExamSessionActor,
  createExamSessionSnapshot,
  hydrateExamSessionSource,
  scoreExam,
  StaticExamQuestionSourceProvider,
  type ExamBlueprint,
} from "./index";

const questions: Question[] = [
  {
    id: "single-1",
    type: "single",
    title: "Single",
    stemMarkdown: "Question",
    options: [{ id: "A", markdown: "A" }, { id: "B", markdown: "B" }],
    answer: { kind: "options", optionIds: ["A"] },
    solutionMarkdown: "Solution",
    metadata: { topicPath: ["Civil"] },
  },
  {
    id: "multiple-1",
    type: "multiple",
    title: "Multiple",
    stemMarkdown: "Question",
    options: [{ id: "A", markdown: "A" }, { id: "B", markdown: "B" }, { id: "C", markdown: "C" }],
    answer: { kind: "options", optionIds: ["A", "C"] },
    solutionMarkdown: "Solution",
    metadata: { topicPath: ["Civil"] },
  },
];

const blueprint: ExamBlueprint = {
  schema_version: 1,
  title: "Civil exam",
  source_key: "doc-1",
  question_ids: questions.map((question) => question.id),
  order: "sequential",
  time_limit_ms: 60_000,
  strict_timeout: true,
  allow_answer_reveal: false,
  scoring_mode: "legal-exam",
  subjective_points: 10,
};

describe("exam session", () => {
  it("creates stable queues and drafts", () => {
    const snapshot = createExamSessionSnapshot({ examId: "exam-1", blueprint, questions, now: 1_000 });
    expect(snapshot.queue_question_ids).toEqual(["single-1", "multiple-1"]);
    expect(snapshot.deadline_at).toBe("1970-01-01T00:01:01.000Z");
    expect(snapshot.drafts["single-1"].selected_option_ids).toEqual([]);
  });

  it("accepts a pre-frozen queue from an external assembler", () => {
    const snapshot = createExamSessionSnapshot({
      examId: "exam-frozen",
      blueprint,
      questions,
      queueQuestionIds: ["multiple-1", "single-1"],
      random: () => 0,
      now: 1_000,
    });
    expect(snapshot.queue_question_ids).toEqual(["multiple-1", "single-1"]);
  });

  it("hydrates a stored frozen queue through the source provider", async () => {
    const snapshot = createExamSessionSnapshot({
      examId: "exam-hydrate",
      blueprint,
      questions,
      queueQuestionIds: ["multiple-1", "single-1"],
      now: 1_000,
    });
    const provider = new StaticExamQuestionSourceProvider({
      sourceKeys: ["doc-1"],
      questions,
      topics: [],
      blockIdsByQuestionId: new Map(),
    });
    const resolved = await hydrateExamSessionSource(provider, snapshot);
    expect(resolved.questions.map((question) => question.id)).toEqual(["multiple-1", "single-1"]);
  });

  it("marks a non-strict timeout without submitting", () => {
    const snapshot = createExamSessionSnapshot({
      examId: "exam-2",
      blueprint: { ...blueprint, strict_timeout: false },
      questions,
      now: 1_000,
    });
    const actor = createExamSessionActor(snapshot);
    actor.start();
    actor.send({ type: "CHECK_DEADLINE", now: 61_000 });
    expect(actor.getSnapshot().value).toBe("active");
    expect(actor.getSnapshot().context.session.overdue_at).toBe("1970-01-01T00:01:01.000Z");
  });

  it("submits on a strict timeout", () => {
    const snapshot = createExamSessionSnapshot({ examId: "exam-3", blueprint, questions, now: 1_000 });
    const actor = createExamSessionActor(snapshot);
    actor.start();
    actor.send({ type: "CHECK_DEADLINE", now: 61_000 });
    expect(actor.getSnapshot().value).toBe("submitting");
  });
});

describe("exam scoring and submission", () => {
  it("uses legal-exam weights and strict set matching", () => {
    const snapshot = createExamSessionSnapshot({ examId: "exam-4", blueprint, questions, now: 1_000 });
    snapshot.drafts["single-1"].selected_option_ids = ["A"];
    snapshot.drafts["multiple-1"].selected_option_ids = ["A", "B"];
    const result = scoreExam(snapshot, questions);
    expect(result.maxScore).toBe(3);
    expect(result.score).toBe(1);
    expect(result.correctCount).toBe(1);
  });

  it("builds deterministic one-row-per-question attempts and a summary event", () => {
    const snapshot = createExamSessionSnapshot({ examId: "exam-5", blueprint, questions, now: 1_000 });
    snapshot.drafts["single-1"].selected_option_ids = ["A"];
    const plan = buildExamSubmissionPlan(snapshot, questions);
    expect(plan.attempts.map((attempt) => attempt.attempt_id)).toEqual([
      "exam:exam-5:single-1",
      "exam:exam-5:multiple-1",
    ]);
    expect(plan.attempts.every((attempt) => attempt.session_mode === "exam")).toBe(true);
    const event = buildExamSummaryEvent(snapshot, plan, "exam_submitted", "1970-01-01T00:01:10.000Z");
    expect(event.attempt_id).toBe("exam-event:exam-5:exam_submitted");
    expect(JSON.parse(event.exam_payload).queue_question_ids).toEqual(["single-1", "multiple-1"]);
  });
});

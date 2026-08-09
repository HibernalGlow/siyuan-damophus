import { describe, expect, it } from "vitest";
import { createExamSessionSnapshot, type ExamBlueprint } from "../../exam";
import type { Question } from "../../core/types";
import { createDamophusStore } from "./tables";
import { TinyBaseExamSessionRepository } from "./repositories";

const question: Question = {
  id: "question-1",
  type: "single",
  title: "Question",
  stemMarkdown: "Stem",
  options: [{ id: "A", markdown: "Answer" }],
  answer: { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "Solution",
  metadata: { topicPath: [] },
};

const blueprint: ExamBlueprint = {
  schema_version: 1,
  title: "Exam",
  source_key: "source-1",
  question_ids: [question.id],
  order: "sequential",
  time_limit_ms: 60_000,
  strict_timeout: false,
  allow_answer_reveal: false,
  scoring_mode: "legal-exam",
  subjective_points: 10,
};

function snapshot(revision = 0) {
  const base = createExamSessionSnapshot({
    examId: "exam-1",
    blueprint,
    questions: [question],
    now: 1_000,
  });
  return { ...base, revision };
}

describe("TinyBase exam session repository", () => {
  it("rebases stale writes from another client editing the same exam", async () => {
    const store = createDamophusStore("exam-sessions");
    const first = new TinyBaseExamSessionRepository(store, "device-a");
    const second = new TinyBaseExamSessionRepository(store, "device-a");
    await first.save(snapshot());
    await first.save(snapshot(1), 0);

    await expect(second.save(snapshot(2), 0)).resolves.toBeUndefined();
    await expect(first.load("exam-1")).resolves.toMatchObject({ revision: 2 });
  });
});

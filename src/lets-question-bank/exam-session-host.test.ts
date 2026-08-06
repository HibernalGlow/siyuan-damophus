import { describe, expect, it } from "vitest";
import type { Question } from "../question-bank/core/types";
import { createExamSessionSnapshot, type ExamBlueprint } from "../question-bank/exam";
import type { PluginDataApi } from "./session-host";
import { SiyuanExamSessionRepository } from "./exam-session-host";

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

function snapshot(examId = "exam-1", revision = 0) {
  return {
    ...createExamSessionSnapshot({ examId, blueprint, questions: [question], now: 1_000 }),
    revision,
  };
}

class MemoryData implements PluginDataApi {
  value: unknown;

  async loadData(): Promise<unknown> {
    return this.value;
  }

  async saveData(_storageName: string, content: unknown): Promise<void> {
    this.value = structuredClone(content);
  }
}

describe("SiYuan exam session repository", () => {
  it("stores and removes the single active exam", async () => {
    const repository = new SiyuanExamSessionRepository(new MemoryData());
    await repository.save(snapshot());
    expect((await repository.load())?.exam_id).toBe("exam-1");
    await repository.remove("exam-1");
    expect(await repository.load()).toBeUndefined();
  });

  it("rejects a second active exam and stale revisions", async () => {
    const repository = new SiyuanExamSessionRepository(new MemoryData());
    await repository.save(snapshot());
    await expect(repository.save(snapshot("exam-2"))).rejects.toThrow("Another exam session is already active");
    await repository.save(snapshot("exam-1", 1), 0);
    await expect(repository.save(snapshot("exam-1", 2), 0)).rejects.toThrow("Exam session changed in another window");
    expect((await repository.load())?.revision).toBe(1);
  });

  it.each([
    ["malformed JSON", "{not-json"],
    ["unsupported version", { schema_version: 2 }],
    ["invalid root", []],
  ])("refuses to overwrite %s", async (_name, original) => {
    const data = new MemoryData();
    data.value = structuredClone(original);
    const repository = new SiyuanExamSessionRepository(data);
    await expect(repository.load()).rejects.toThrow();
    await expect(repository.save(snapshot())).rejects.toThrow();
    expect(data.value).toEqual(original);
  });
});

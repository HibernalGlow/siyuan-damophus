import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import type { Question } from "@/question-bank/core/types";
import type { QuestionIndexBatchPreview } from "@/question-bank/application";
import type { FrozenQuestionSet, QuestionCatalogEntry } from "@/question-bank/assembly";
import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
import "@/styles/damophus.css";
import ExamWorkspace from "./ExamWorkspace.svelte";
import type { QuestionBankUiController } from "./controller";

const questions: Question[] = [
  {
    id: "single-1",
    type: "single",
    title: "Single",
    stemMarkdown: "Choose one",
    options: [{ id: "A", markdown: "Alpha" }, { id: "B", markdown: "Beta" }],
    answer: { kind: "options", optionIds: ["A"] },
    solutionMarkdown: "Single solution",
    metadata: { topicPath: ["Civil"] },
  },
  {
    id: "multiple-1",
    type: "multiple",
    title: "Multiple",
    stemMarkdown: "Choose all",
    options: [{ id: "A", markdown: "First" }, { id: "B", markdown: "Second" }, { id: "C", markdown: "Third" }],
    answer: { kind: "options", optionIds: ["A", "C"] },
    solutionMarkdown: "Multiple solution",
    metadata: { topicPath: ["Civil"] },
  },
];

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

function mockController() {
  const submittedAttempts: unknown[] = [];
  const submittedEvents: unknown[] = [];
  const controller = {
    loadExamSession: vi.fn(async () => undefined),
    saveExamSession: vi.fn(async () => undefined),
    removeExamSession: vi.fn(async () => undefined),
    submitExamAttempt: vi.fn(async (event) => {
      submittedAttempts.push(event);
      return "created" as const;
    }),
    submitExamEvent: vi.fn(async (event) => {
      submittedEvents.push(event);
      return "created" as const;
    }),
  } as unknown as QuestionBankUiController;
  return { controller, submittedAttempts, submittedEvents };
}

describe("exam workspace", () => {
  it("submits one immutable row per question and one exam summary", async () => {
    const { controller, submittedAttempts, submittedEvents } = mockController();
    component = mount(ExamWorkspace, {
      target: document.body,
      props: {
        controller,
        questions,
        sourceKey: "doc-1",
        sourceLabel: "Civil exam",
        uuid: () => "exam-1",
        random: () => 0.5,
      },
    });
    await tick();
    document.querySelector<HTMLButtonElement>(".exam-actions button")?.click();
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".exam-options button")]
      .find((button) => button.textContent?.includes("Alpha"))?.click();
    document.querySelectorAll<HTMLButtonElement>(".exam-question-nav button")[1]?.click();
    await tick();
    for (const text of ["First", "Third"]) {
      [...document.querySelectorAll<HTMLButtonElement>(".exam-options button")]
        .find((button) => button.textContent?.includes(text))?.click();
      await tick();
    }
    [...document.querySelectorAll<HTMLButtonElement>(".exam-footer button")]
      .find((button) => button.textContent?.includes("Submit exam"))?.click();
    await vi.waitFor(() => expect(submittedEvents).toHaveLength(1));

    expect(submittedAttempts).toHaveLength(2);
    expect(submittedAttempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ attempt_id: "exam:exam-1:single-1", session_mode: "exam" }),
      expect.objectContaining({ attempt_id: "exam:exam-1:multiple-1", session_mode: "exam" }),
    ]));
    expect(submittedEvents[0]).toEqual(expect.objectContaining({
      event_kind: "exam_submitted",
      session_id: "exam-1",
      exam_score: 3,
      exam_max_score: 3,
    }));
    expect(document.querySelector(".exam-score")?.textContent).toContain("100.0%");
  });

  it("marks a revealed answer as assisted and awards zero", async () => {
    const { controller, submittedEvents } = mockController();
    component = mount(ExamWorkspace, {
      target: document.body,
      props: { controller, questions: [questions[0]], sourceKey: "doc-1", uuid: () => "exam-2" },
    });
    await tick();
    document.querySelectorAll<HTMLInputElement>('.exam-check input[type="checkbox"]')[0]?.click();
    document.querySelector<HTMLButtonElement>(".exam-actions button")?.click();
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".exam-options button")]
      .find((button) => button.textContent?.includes("Alpha"))?.click();
    [...document.querySelectorAll<HTMLButtonElement>(".exam-footer button")]
      .find((button) => button.textContent?.includes("Reveal"))?.click();
    await tick();
    expect(document.querySelector(".exam-solution")?.textContent).toContain("Single solution");
    [...document.querySelectorAll<HTMLButtonElement>(".exam-footer button")]
      .find((button) => button.textContent?.includes("Submit exam"))?.click();
    await vi.waitFor(() => expect(submittedEvents).toHaveLength(1));
    expect(submittedEvents[0]).toEqual(expect.objectContaining({ exam_score: 0, exam_max_score: 1 }));
  });

  it("hydrates a frozen cross-document set and freezes its exam queue", async () => {
    const { controller } = mockController();
    const sourceDocuments: QuestionSourceDocument[] = [{
      documentId: "doc-1",
      notebookId: "notebook-1",
      title: "Civil questions",
    }];
    const catalog: QuestionCatalogEntry[] = [{
      questionId: questions[0].id,
      blockId: "block-1",
      documentId: "doc-1",
      notebookId: "notebook-1",
      questionTitle: questions[0].title,
      questionType: questions[0].type,
    }];
    const frozen: FrozenQuestionSet = {
      schema_version: 1,
      set_id: "set-1",
      blueprint_id: "blueprint-1",
      blueprint_revision: 1,
      generated_at: "2026-08-06T00:00:00.000Z",
      seed: "seed-1",
      source_revision: "revision-1",
      question_ids: [questions[0].id],
      source_keys: ["doc-1"],
      widened: false,
      deficits: [],
    };
    const batch = {
      token: "batch-token",
      generatedAt: "2026-08-06T00:00:00.000Z",
      documentIds: ["doc-1"],
      aliases: [],
      blockers: [],
      documents: [{
        documentId: "doc-1",
        token: "document-token",
        generatedAt: "2026-08-06T00:00:00.000Z",
        scan: { documentId: "doc-1", kramdown: "", report: { document: { questions: [], groups: [], topics: [] }, inferences: [], conflicts: [], issues: [], ialUpdates: [] }, blockIdsByQuestionId: new Map(), topicBlockIdsByTopicId: new Map(), ialWriteActions: [], sourceIssues: [] },
        actions: [], staleQuestionIds: [], blockers: [], bindingRepairs: [], ialWriteActions: [], results: [],
      }],
    } as unknown as QuestionIndexBatchPreview;
    controller.listQuestionSourceDocuments = vi.fn(async () => sourceDocuments);
    controller.loadQuestionCatalog = vi.fn(async () => catalog);
    controller.listQuestionSetBlueprints = vi.fn(async () => []);
    controller.previewSyncBatch = vi.fn(async () => batch);
    controller.confirmSyncBatch = vi.fn(async () => batch);
    controller.assembleQuestionSet = vi.fn(() => frozen);
    controller.hydrateQuestionSources = vi.fn(async () => ({
      questions: [questions[0]],
      topics: [],
      blockIdsByQuestionId: new Map([[questions[0].id, "block-1"]]),
      sourceKeys: ["doc-1"],
    }));
    component = mount(ExamWorkspace, {
      target: document.body,
      props: { controller, questions, sourceKey: "doc-1", uuid: () => "exam-cross" },
    });
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("跨文档组卷"))?.click();
    await vi.waitFor(() => expect(document.querySelector(".question-set-composer")).not.toBeNull());
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "检查并入库" }).click();
    await vi.waitFor(() => expect(controller.previewSyncBatch).toHaveBeenCalledOnce());
    await page.getByRole("button", { name: "继续设置" }).click();
    await page.getByRole("button", { name: "预览试卷" }).click();
    await page.getByRole("button", { name: "用于考试/练习" }).click();
    await vi.waitFor(() => expect(controller.hydrateQuestionSources).toHaveBeenCalledWith([questions[0].id]));
    await vi.waitFor(() => expect(document.querySelector(".question-set-composer")).toBeNull());
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes("Start exam"))?.click();
    await tick();
    expect(controller.saveExamSession).toHaveBeenCalled();
    const saveExamSession = controller.saveExamSession as unknown as { mock: { calls: unknown[][] } };
    expect(saveExamSession.mock.calls[0][0]).toMatchObject({
      blueprint: expect.objectContaining({ source_key: "set-1" }),
      queue_question_ids: [questions[0].id],
    });
  });
});

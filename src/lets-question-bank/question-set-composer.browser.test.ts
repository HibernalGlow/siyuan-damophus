import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import type { QuestionIndexBatchPreview } from "@/question-bank/application";
import type { FrozenQuestionSet, QuestionCatalogEntry } from "@/question-bank/assembly";
import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
import QuestionSetComposer from "./QuestionSetComposer.svelte";

const documents: QuestionSourceDocument[] = [{
  documentId: "doc-1",
  notebookId: "notebook-1",
  title: "Civil questions",
  hpath: "/Civil questions",
}];

const catalog: QuestionCatalogEntry[] = [{
  questionId: "q-1",
  blockId: "block-1",
  documentId: "doc-1",
  notebookId: "notebook-1",
  questionTitle: "First question",
  questionType: "single",
  subject: "Civil",
  year: "2022",
}];

const frozen: FrozenQuestionSet = {
  schema_version: 1,
  set_id: "set-1",
  blueprint_id: "blueprint-1",
  blueprint_revision: 1,
  generated_at: "2026-08-06T00:00:00.000Z",
  seed: "seed-1",
  source_revision: "revision-1",
  question_ids: ["q-1"],
  source_keys: ["doc-1"],
  widened: false,
  deficits: [],
};

function batchPreview(confirmed = false): QuestionIndexBatchPreview {
  return {
    token: "batch-token",
    generatedAt: "2026-08-06T00:00:00.000Z",
    documentIds: ["doc-1"],
    aliases: [],
    blockers: [],
    documents: [{
      token: "document-token",
      generatedAt: "2026-08-06T00:00:00.000Z",
      documentId: "doc-1",
      scan: {
        documentId: "doc-1",
        kramdown: "",
        report: { document: { questions: [], groups: [], topics: [] }, inferences: [], conflicts: [], issues: [], ialUpdates: [] },
        blockIdsByQuestionId: new Map(),
        topicBlockIdsByTopicId: new Map(),
        ialWriteActions: [],
        sourceIssues: [],
      },
      actions: confirmed ? [] : [{ kind: "add", question: {
        id: "q-1",
        type: "single",
        title: "First question",
        stemMarkdown: "Stem",
        options: [{ id: "A", markdown: "A" }],
        answer: { kind: "options", optionIds: ["A"] },
        solutionMarkdown: "Solution",
        metadata: { topicPath: [] },
      }, blockId: "block-1" }],
      staleQuestionIds: [],
      blockers: [],
      bindingRepairs: [],
      ialWriteActions: [],
      results: [],
    }],
  };
}

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

describe("question set composer", () => {
  it("previews, confirms indexing, assembles, and emits a frozen set", async () => {
    const onSync = vi.fn(async () => batchPreview());
    const onConfirmSync = vi.fn(async () => batchPreview(true));
    const onAssemble = vi.fn(() => frozen);
    const onUse = vi.fn();
    component = mount(QuestionSetComposer, {
      target: document.body,
      props: {
        catalog,
        documents,
        translations: {},
        onSync,
        onConfirmSync,
        onAssemble,
        onUse,
        onRefresh: vi.fn(),
        onSave: vi.fn(async () => undefined),
        onDelete: vi.fn(async () => undefined),
        onClose: vi.fn(),
      },
    });
    await tick();

    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "检查并入库" }).click();
    await vi.waitFor(() => expect(onSync).toHaveBeenCalledWith(["doc-1"]));

    await page.getByRole("button", { name: "确认入库" }).click();
    await vi.waitFor(() => expect(onConfirmSync).toHaveBeenCalledOnce());
    await vi.waitFor(() => {
      const button = [...document.querySelectorAll<HTMLButtonElement>("button")]
        .find((candidate) => candidate.textContent?.includes("继续设置"));
      expect(button).not.toBeUndefined();
      expect(button).not.toBeDisabled();
    });
    await page.getByRole("button", { name: "继续设置" }).click();
    await page.getByRole("button", { name: "预览试卷" }).click();
    await page.getByRole("button", { name: "用于考试/练习" }).click();
    await vi.waitFor(() => expect(onUse).toHaveBeenCalledWith(frozen));
    expect(onAssemble).toHaveBeenCalledOnce();
  });
});

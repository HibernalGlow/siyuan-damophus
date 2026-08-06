import { describe, expect, it } from "vitest";
import type { Question } from "../core/types";
import type { QuestionIndexPreview } from "./indexing";
import { prepareQuestionIndexBatch } from "./batch-indexing";

function question(id: string, stem = "Same stem"): Question {
  return {
    id,
    type: "single",
    title: id,
    stemMarkdown: stem,
    options: [{ id: "A", markdown: "A" }, { id: "B", markdown: "B" }],
    answer: { kind: "options", optionIds: ["A"] },
    solutionMarkdown: "A",
    metadata: { topicPath: [] },
  };
}

function preview(documentId: string, value: Question, alreadyIndexed = false): QuestionIndexPreview {
  return {
    token: `token-${documentId}`,
    generatedAt: "2026-08-06T00:00:00.000Z",
    documentId,
    scan: {
      documentId,
      kramdown: "",
      report: { document: { questions: [value], groups: [], topics: [] }, inferences: [], conflicts: [], issues: [], ialUpdates: [] },
      blockIdsByQuestionId: new Map([[value.id, `block-${documentId}`]]),
      topicBlockIdsByTopicId: new Map(),
      ialWriteActions: [],
      sourceIssues: [],
    },
    actions: alreadyIndexed ? [] : [{ kind: "add", question: value, blockId: `block-${documentId}` }],
    staleQuestionIds: [],
    blockers: [],
    bindingRepairs: [],
    ialWriteActions: [],
    results: [],
  };
}

describe("question index batch preview", () => {
  it("deduplicates identical questions before either document is written", () => {
    const result = prepareQuestionIndexBatch([
      preview("doc-b", question("same-id")),
      preview("doc-a", question("same-id")),
    ]);
    expect(result.aliases).toEqual([{
      questionId: "same-id",
      canonicalDocumentId: "doc-a",
      aliasDocumentIds: ["doc-b"],
    }]);
    expect(result.documents.find((item) => item.documentId === "doc-b")?.actions).toEqual([]);
  });

  it("prefers an already indexed canonical source", () => {
    const result = prepareQuestionIndexBatch([
      preview("doc-a", question("same-id")),
      preview("doc-b", question("same-id"), true),
    ]);
    expect(result.aliases[0].canonicalDocumentId).toBe("doc-b");
  });

  it("blocks different content sharing one stable ID", () => {
    const result = prepareQuestionIndexBatch([
      preview("doc-a", question("same-id", "First")),
      preview("doc-b", question("same-id", "Second")),
    ]);
    expect(result.blockers).toEqual([expect.objectContaining({ code: "batch-question-id-conflict" })]);
    expect(result.documents.every((item) => item.blockers.length === 1)).toBe(true);
  });
});

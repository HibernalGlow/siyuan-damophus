import { describe, expect, it } from "vitest";
import type { RawAttributeView } from "./types";
import { buildQuestionSourceCatalog, type QuestionSourceBlockRow } from "./source-catalog";

const binding = {
  questionIndex: {
    keys: {
      block_id: "key-block",
      question_id: "key-id",
      question_type: "key-type",
      year: "key-year",
      subject: "key-subject",
      category: "key-category",
      collection: "key-collection",
      source: "key-source",
      topic_id: "key-topic",
      last_scanned_at: "key-scanned",
    },
  },
} as any;

function values(key: string, value: any) {
  return { key: { id: key, name: key, type: value.type }, values: [value] };
}

describe("SiYuan question source catalog", () => {
  it("joins AV rows to their document and notebook without retaining stale rows", () => {
    const av: RawAttributeView = {
      id: "av-1",
      keyValues: [
        values("key-block", { keyID: "key-block", blockID: "item-1", type: "block", block: { id: "block-1", content: "Question 1" } }),
        values("key-id", { keyID: "key-id", blockID: "item-1", type: "text", text: { content: "q-1" } }),
        values("key-type", { keyID: "key-type", blockID: "item-1", type: "select", mSelect: [{ content: "single", color: "1" }] }),
        values("key-year", { keyID: "key-year", blockID: "item-1", type: "number", number: { content: 2025, isNotEmpty: true } }),
        values("key-subject", { keyID: "key-subject", blockID: "item-1", type: "select", mSelect: [{ content: "civil", color: "1" }] }),
        values("key-category", { keyID: "key-category", blockID: "item-1", type: "select", mSelect: [] }),
        values("key-collection", { keyID: "key-collection", blockID: "item-1", type: "select", mSelect: [] }),
        values("key-source", { keyID: "key-source", blockID: "item-1", type: "select", mSelect: [] }),
        values("key-topic", { keyID: "key-topic", blockID: "item-1", type: "text", text: { content: "contracts" } }),
        values("key-scanned", { keyID: "key-scanned", blockID: "item-1", type: "date", date: { content: 1785974400000, isNotEmpty: true } }),
      ],
    };
    const blocks: QuestionSourceBlockRow[] = [{
      id: "block-1",
      root_id: "doc-1",
      box: "notebook-1",
      hpath: "/Civil/Contracts",
      content: "Question 1",
    }];
    const catalog = buildQuestionSourceCatalog(av, binding, blocks);
    expect(catalog).toEqual([expect.objectContaining({
      questionId: "q-1",
      blockId: "block-1",
      documentId: "doc-1",
      notebookId: "notebook-1",
      questionType: "single",
      year: "2025",
      subject: "civil",
      topicId: "contracts",
    })]);
    expect(buildQuestionSourceCatalog(av, binding, [])).toEqual([]);
  });
});

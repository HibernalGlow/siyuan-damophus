import { describe, expect, it } from "vitest";
import { createEmptyParagraphCleanupPlan, isEmptyText, type DocumentFormatBlock } from "./empty-paragraphs";

const documentId = "20260827090000-document";

function block(overrides: Partial<DocumentFormatBlock>): DocumentFormatBlock {
  return {
    id: "20260827090000-default",
    parent_id: documentId,
    root_id: documentId,
    type: "p",
    content: "",
    sort: 0,
    ...overrides,
  };
}

describe("empty paragraph cleanup", () => {
  it("recognizes whitespace and zero-width text as empty", () => {
    expect(isEmptyText(" \n\u00a0\u200b")).toBe(true);
    expect(isEmptyText("content")).toBe(false);
  });

  it("removes top-level and container paragraphs when enabled", () => {
    const blocks = [
      block({ id: "before", content: "Text", sort: 1 }),
      block({ id: "top-empty", sort: 2 }),
      block({ id: "container-empty", parent_id: "quote", sort: 3 }),
    ];
    const plan = createEmptyParagraphCleanupPlan(documentId, blocks, {
      "top-empty": "<div></div>",
      "container-empty": "<div></div>",
    }, true);

    expect(plan.doOperations).toEqual([
      { action: "delete", id: "top-empty" },
      { action: "delete", id: "container-empty" },
    ]);
    expect(plan.undoOperations).toEqual([
      expect.objectContaining({ action: "insert", id: "top-empty", parentID: documentId, previousID: "before" }),
      expect.objectContaining({ action: "insert", id: "container-empty", parentID: "quote" }),
    ]);
  });

  it("keeps container paragraphs when the option is disabled", () => {
    const plan = createEmptyParagraphCleanupPlan(documentId, [
      block({ id: "top-empty", sort: 1 }),
      block({ id: "container-empty", parent_id: "callout", sort: 2 }),
    ], {
      "top-empty": "<div></div>",
      "container-empty": "<div></div>",
    }, false);

    expect(plan.count).toBe(1);
    expect(plan.doOperations).toEqual([{ action: "delete", id: "top-empty" }]);
  });

  it("uses persisted DOM rather than indexed block content", () => {
    const plan = createEmptyParagraphCleanupPlan(documentId, [
      block({ id: "empty-dom", content: "stale indexed text", sort: 1 }),
      block({ id: "missing-dom", sort: 2 }),
    ], { "empty-dom": "<div></div>" }, true);

    expect(plan.count).toBe(1);
    expect(plan.doOperations).toEqual([{ action: "delete", id: "empty-dom" }]);
  });
});

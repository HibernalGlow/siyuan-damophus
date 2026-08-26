import { describe, expect, it } from "vitest";
import { createSelfReferenceCleanupPlan } from "./self-references";

const documentId = "20260827090000-document";

describe("self reference cleanup", () => {
  it("removes plain and styled references to the current document", () => {
    const originalDom = `<div data-node-id="paragraph" data-type="NodeParagraph"><span data-type="block-ref" data-id="${documentId}">self</span><span data-type="strong block-ref" data-id="${documentId}">styled self</span><span data-type="block-ref" data-id="another-document">other</span></div>`;
    const plan = createSelfReferenceCleanupPlan(documentId, { paragraph: originalDom });

    expect(plan.referenceCount).toBe(2);
    expect(plan.blockCount).toBe(1);
    expect(plan.doOperations).toEqual([
      expect.objectContaining({ action: "update", id: "paragraph" }),
    ]);
    expect(plan.doOperations[0]?.data).not.toContain(`data-id="${documentId}"`);
    expect(plan.doOperations[0]?.data).toContain('data-id="another-document"');
    expect(plan.undoOperations).toEqual([
      { action: "update", id: "paragraph", data: originalDom },
    ]);
  });

  it("does not update blocks without a reference to the current document", () => {
    const originalDom = '<div data-type="NodeParagraph"><span data-type="block-ref" data-id="another-document">other</span></div>';
    const plan = createSelfReferenceCleanupPlan(documentId, { paragraph: originalDom });

    expect(plan).toEqual({
      doOperations: [],
      undoOperations: [],
      referenceCount: 0,
      blockCount: 0,
    });
  });
});

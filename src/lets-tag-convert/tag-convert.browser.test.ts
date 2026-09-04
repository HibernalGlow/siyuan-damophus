import { describe, expect, it } from "vitest";
import {
  convertTagsInBlockDom,
  createTagConvertPlan,
  extractTagContent,
  previewTagConversion,
} from "./tag-convert";

const paragraph = (inner: string): string =>
  `<div data-node-id="20240101120000-abcd123" data-type="NodeParagraph" class="p">${inner}<div class="protyle-attr"></div></div>`;

describe("extractTagContent", () => {
  it("strips the surrounding hash marks", () => {
    expect(extractTagContent("#law#")).toBe("law");
    expect(extractTagContent("#book/law#")).toBe("book/law");
  });

  it("rejects malformed or empty tags", () => {
    expect(extractTagContent("##")).toBeNull();
    expect(extractTagContent("#")).toBeNull();
    expect(extractTagContent("law")).toBeNull();
    expect(extractTagContent("")).toBeNull();
  });
});

describe("convertTagsInBlockDom", () => {
  it("converts tags to plain text and keeps other inline elements", () => {
    const dom = paragraph('<span data-type="tag">#law#</span> see <span data-type="block-ref" data-id="x">ref</span>');
    const result = convertTagsInBlockDom(dom, { format: "plain", leftWrap: "", rightWrap: "" });
    expect(result).not.toBeNull();
    expect(result?.tagCount).toBe(1);
    expect(result?.dom).toContain("law");
    expect(result?.dom).not.toContain('data-type="tag"');
    expect(result?.dom).toContain('<span data-type="block-ref" data-id="x">ref</span>');
    expect(result?.dom).toContain("see");
  });

  it("applies left and right wrap texts as literal text", () => {
    const dom = paragraph('<span data-type="tag">#law#</span>');
    const result = convertTagsInBlockDom(dom, { format: "plain", leftWrap: "Topic: ", rightWrap: "." });
    expect(result?.dom).toContain("Topic: law.");
    expect(result?.dom).not.toContain('data-type="tag"');
  });

  it("converts tags to inline code spans with wraps kept outside", () => {
    const dom = paragraph('<span data-type="tag">#law#</span>');
    const result = convertTagsInBlockDom(dom, { format: "code", leftWrap: "Tag: ", rightWrap: "" });
    expect(result?.dom).toContain('Tag: <span data-type="code">law</span>');
    expect(result?.dom).not.toContain('data-type="tag"');
  });

  it("keeps hierarchical tag content verbatim", () => {
    const dom = paragraph('<span data-type="tag">#book/one piece#</span>');
    const result = convertTagsInBlockDom(dom, { format: "plain", leftWrap: "", rightWrap: "" });
    expect(result?.dom).toContain("book/one piece");
  });

  it("returns null for blocks without convertible tags", () => {
    expect(convertTagsInBlockDom(paragraph("plain text"), { format: "plain", leftWrap: "", rightWrap: "" })).toBeNull();
    expect(convertTagsInBlockDom(paragraph('<span data-type="tag">##</span>'), { format: "plain", leftWrap: "", rightWrap: "" })).toBeNull();
  });
});

describe("createTagConvertPlan", () => {
  it("builds update operations with original DOM as undo data", () => {
    const domA = paragraph('<span data-type="tag">#law#</span>');
    const domB = paragraph("no tags");
    const plan = createTagConvertPlan({ idA: domA, idB: domB }, { format: "plain", leftWrap: "", rightWrap: "" });
    expect(plan.blockCount).toBe(1);
    expect(plan.tagCount).toBe(1);
    expect(plan.doOperations).toEqual([{ action: "update", id: "idA", data: expect.stringContaining("law") }]);
    expect(plan.undoOperations).toEqual([{ action: "update", id: "idA", data: domA }]);
  });

  it("counts multiple tags in one block", () => {
    const dom = paragraph('<span data-type="tag">#a#</span> and <span data-type="tag">#b#</span>');
    const plan = createTagConvertPlan({ idA: dom }, { format: "code", leftWrap: "", rightWrap: "" });
    expect(plan.tagCount).toBe(2);
    expect(plan.doOperations[0]?.data).toContain('<span data-type="code">a</span>');
    expect(plan.doOperations[0]?.data).toContain('<span data-type="code">b</span>');
  });
});

describe("previewTagConversion", () => {
  it("renders markdown-shaped previews for both formats", () => {
    expect(previewTagConversion({ format: "plain", leftWrap: "", rightWrap: "" }, "law")).toBe("law");
    expect(previewTagConversion({ format: "plain", leftWrap: "T: ", rightWrap: "" }, "law")).toBe("T: law");
    expect(previewTagConversion({ format: "code", leftWrap: "", rightWrap: "" }, "law")).toBe("`law`");
  });
});

import { describe, expect, it } from "vitest";
import { isEmptyContainerDom, isEmptyParagraphDom, removeCodeBlankLinesDom } from "./empty-paragraphs";

describe("empty paragraph DOM validation", () => {
  it("accepts persisted paragraph DOM containing only whitespace", () => {
    expect(isEmptyParagraphDom(`
      <div data-node-id="paragraph" data-type="NodeParagraph"> \n<wbr><br>
      <div class="protyle-attr"></div></div>
    `)).toBe(true);
  });

  it("preserves paragraph blocks that contain embedded content", () => {
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><span data-type="img"></span></div>
    `)).toBe(false);
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><span data-type="inline-math"></span></div>
    `)).toBe(false);
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><span data-type="block-ref"></span></div>
    `)).toBe(false);
  });

  it("accepts empty persisted code block DOM", () => {
    expect(isEmptyParagraphDom(`
      <div data-type="NodeCodeBlock"><div contenteditable="true"><br></div></div>
    `)).toBe(true);
  });

  it("recognizes empty quote and callout containers after removing their markers", () => {
    expect(isEmptyContainerDom(`
      <div data-type="NodeBlockquote"><div data-type="NodeBlockquoteMarker">&gt; </div><div data-type="NodeParagraph"><br></div><div class="protyle-attr"></div></div>
    `)).toBe(true);
    expect(isEmptyContainerDom(`
      <div data-type="NodeCallout"><div class="callout-title">Note</div><div class="callout-content"><div data-type="NodeParagraph"><br></div></div></div>
    `)).toBe(true);
    expect(isEmptyContainerDom(`
      <div data-type="NodeCallout"><div class="callout-title">Note</div><div class="callout-content"><div data-type="NodeParagraph">Content</div></div></div>
    `)).toBe(false);
  });

  it("removes blank lines from persisted code DOM while retaining code text", () => {
    const result = removeCodeBlankLinesDom(`
      <div data-node-id="code" data-type="NodeCodeBlock"><div contenteditable="true">const a = 1;\n\n  \nreturn a;\n</div></div>
    `);
    expect(result?.removedLineCount).toBe(3);
    expect(result?.dom).toContain("const a = 1;\nreturn a;");
    expect(result?.dom).not.toContain("\n\n");
  });
});

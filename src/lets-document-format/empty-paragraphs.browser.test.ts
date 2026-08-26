import { describe, expect, it } from "vitest";
import { isEmptyParagraphDom } from "./empty-paragraphs";

describe("empty paragraph DOM validation", () => {
  it("accepts a paragraph containing only whitespace and editor caret markers", () => {
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><div contenteditable="true"> \n<wbr><br></div>
      <div class="protyle-attr" contenteditable="false"></div></div>
    `)).toBe(true);
  });

  it("preserves paragraph blocks that contain embedded content", () => {
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><div contenteditable="true"><span data-type="img"></span></div></div>
    `)).toBe(false);
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><div contenteditable="true"><span data-type="inline-math"></span></div></div>
    `)).toBe(false);
    expect(isEmptyParagraphDom(`
      <div data-type="NodeParagraph"><div contenteditable="true"><span data-type="block-ref"></span></div></div>
    `)).toBe(false);
  });
});

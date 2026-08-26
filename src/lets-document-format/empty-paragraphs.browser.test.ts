import { describe, expect, it } from "vitest";
import { isEmptyParagraphDom } from "./empty-paragraphs";

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
});

import { describe, expect, it } from "vitest";
import { analyzeSnippet, buildSnippetPreviewDocument, type SiyuanSnippet } from "./snippet-audit";

const snippet = (content: string): SiyuanSnippet => ({ id: "test", name: "test", type: "css", enabled: true, content });

describe("snippet visual scene recognition", () => {
  it("recognizes every matching scene instead of choosing only one", () => {
    const result = analyzeSnippet(snippet('.protyle-wysiwyg span[data-type="tag"]{} .protyle-wysiwyg span[data-type="block-ref"]{}'));
    expect(result.previewScenes).toEqual(["document", "tag", "reference"]);
  });

  it("builds an isolated preview document containing the original CSS and scene markup", () => {
    const document = buildSnippetPreviewDocument("tag", '[data-type="tag"]{border-radius:9px}');
    expect(document).toContain('[data-type="tag"]{border-radius:9px}');
    expect(document).toContain('data-type="tag"');
    expect(document).not.toContain("@import");
  });

  it("does not offer executable visual previews for JavaScript", () => {
    const result = analyzeSnippet({ ...snippet("document.body.classList.add('x')"), type: "js" });
    expect(result.previewScenes).toEqual([]);
  });
});

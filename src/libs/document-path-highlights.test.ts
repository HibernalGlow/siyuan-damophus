import { describe, expect, it } from "vitest";
import {
  DEFAULT_DOCUMENT_PATH_HIGHLIGHTS,
  documentPathMatchesHighlight,
  normalizeDocumentPathHighlights,
} from "./document-path-highlights";

describe("document path highlights", () => {
  it("normalizes multiline and legacy separated values", () => {
    expect(normalizeDocumentPathHighlights(" 真金题\n\n民法, 真金题；刑法 ")).toEqual(["真金题", "民法", "刑法"]);
    expect(DEFAULT_DOCUMENT_PATH_HIGHLIGHTS).toEqual(["真金题"]);
  });

  it("matches only the readable document path", () => {
    expect(documentPathMatchesHighlight("/Note-3.2/法考/真金题/行政法", ["真金题"])).toBe(true);
    expect(documentPathMatchesHighlight("/Note-3.2/法考/行政法", ["真金题"])).toBe(false);
    expect(documentPathMatchesHighlight(undefined, ["真金题"])).toBe(false);
  });
});

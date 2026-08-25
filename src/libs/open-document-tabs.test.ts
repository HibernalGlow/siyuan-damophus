import { describe, expect, it } from "vitest";
import { openDocumentTabLabel, openDocumentTabParentPath, openDocumentTabTitle } from "./open-document-tabs";

describe("open document tabs", () => {
  it("prefers a readable path and falls back to title then id", () => {
    expect(openDocumentTabLabel({ documentId: "doc-1", title: "Title", path: "/Notebook/Title" })).toBe("/Notebook/Title");
    expect(openDocumentTabLabel({ documentId: "doc-2", title: "Title" })).toBe("Title");
    expect(openDocumentTabLabel({ documentId: "doc-3", title: "" })).toBe("doc-3");
  });

  it("keeps the document title primary and derives the parent path separately", () => {
    const tab = { documentId: "doc-4", title: "题板", path: "/Note-3.2/法考/题量汇总/题板" };
    expect(openDocumentTabTitle(tab)).toBe("题板");
    expect(openDocumentTabParentPath(tab)).toBe("/Note-3.2/法考/题量汇总");
  });
});

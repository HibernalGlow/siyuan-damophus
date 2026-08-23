import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import {
  archivePath,
  relativeDocumentTreePaths,
  uniqueArchivePaths,
  zipMarkdownDocuments,
} from "./batch";

const portable = { mode: "portable" as const, include: [], exclude: [] };

describe("Markdown ZIP export", () => {
  it("creates safe human-readable paths and resolves duplicate titles", () => {
    const documents = [
      { id: "first", title: "Doc", hpath: "/Folder/Doc" },
      { id: "second", title: "Doc", hpath: "/Folder/Doc" },
      { id: "third", title: "Bad", hpath: "/Bad:Folder/Name?" },
    ];
    expect(archivePath(documents[2])).toBe("Bad_Folder/Name_.md");
    expect([...uniqueArchivePaths(documents).values()]).toEqual([
      "Folder/Doc.md",
      "Folder/Doc [second].md",
      "Bad_Folder/Name_.md",
    ]);
  });

  it("starts a document-tree archive at the selected document", () => {
    expect(relativeDocumentTreePaths([
      { id: "root", title: "Root", hpath: "/Parent/Root" },
      { id: "child", title: "Child", hpath: "/Parent/Root/Child" },
    ], "root").map(archivePath)).toEqual(["Root.md", "Root/Child.md"]);
  });

  it("writes one portable Markdown member per document", async () => {
    const bytes = await zipMarkdownDocuments([
      { id: "first", title: "First", hpath: "/First" },
      { id: "second", title: "Second", hpath: "/First/Second" },
    ], {
      first: '# First\n{: id="first" custom-dm-card-id="card-1"}',
      second: '# Second\n{: id="second" updated="time"}',
    }, portable);
    const zip = await JSZip.loadAsync(bytes);
    expect(Object.keys(zip.files)).toEqual(["First.md", "First/", "First/Second.md"]);
    await expect(zip.file("First.md")!.async("string"))
      .resolves.toBe('# First\n{: custom-dm-card-id="card-1"}\n');
    await expect(zip.file("First/Second.md")!.async("string"))
      .resolves.toBe("# Second\n");
  });
});

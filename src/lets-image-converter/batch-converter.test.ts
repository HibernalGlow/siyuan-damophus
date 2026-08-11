import {beforeEach, describe, expect, it, vi} from "vitest";
import {replaceAssetReferences, resolveBatchDocuments} from "./batch-converter";
import {lsNotebooks, sqlStrict} from "@/api";

vi.mock("@/api", () => ({
  createWorkspaceSnapshot: vi.fn(),
  getBlockKramdownStrict: vi.fn(),
  lsNotebooks: vi.fn(),
  removeFileStrict: vi.fn(),
  sqlStrict: vi.fn(),
  updateBlockStrict: vi.fn(),
  uploadAssetsStrict: vi.fn(),
}));

describe("batch image converter", () => {
  beforeEach(() => vi.clearAllMocks());

  it("replaces image and ordinary resource references without touching longer paths", () => {
    const source = [
      "![image](assets/photo.png?width=800)",
      "[resource](assets/photo.png)",
      "![other](assets/photo.png.backup)",
    ].join("\n");
    expect(replaceAssetReferences(source, "assets/photo.png", "assets/photo.avif")).toBe([
      "![image](assets/photo.avif?width=800)",
      "[resource](assets/photo.avif)",
      "![other](assets/photo.png.backup)",
    ].join("\n"));
  });

  it("resolves a notebook ID to every document", async () => {
    vi.mocked(lsNotebooks).mockResolvedValue({notebooks: [{id: "box-1"}]} as never);
    vi.mocked(sqlStrict).mockResolvedValue([
      {id: "doc-1", box: "box-1", hpath: "/One"},
      {id: "doc-2", box: "box-1", hpath: "/Two"},
    ] as never);
    const documents = await resolveBatchDocuments({targetId: "box-1", scope: "notebook", includeChildren: false});
    expect(documents.map((document) => document.id)).toEqual(["doc-1", "doc-2"]);
    expect(vi.mocked(sqlStrict).mock.calls[0][0]).toContain("box = 'box-1'");
  });

  it("includes child document hpaths only when requested", async () => {
    vi.mocked(lsNotebooks).mockResolvedValue({notebooks: []} as never);
    vi.mocked(sqlStrict)
      .mockResolvedValueOnce([{id: "doc-1", box: "box-1", hpath: "/Parent"}] as never)
      .mockResolvedValueOnce([
        {id: "doc-1", box: "box-1", hpath: "/Parent"},
        {id: "doc-2", box: "box-1", hpath: "/Parent/Child"},
      ] as never);
    const documents = await resolveBatchDocuments({targetId: "doc-1", scope: "document", includeChildren: true});
    expect(documents).toHaveLength(2);
    expect(vi.mocked(sqlStrict).mock.calls[1][0]).toContain("hpath LIKE '/Parent/%'");
  });
});

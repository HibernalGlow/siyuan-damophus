import { describe, expect, it, vi } from "vitest";
vi.mock("@/api", () => ({
  getPathByID: vi.fn(async () => ({ notebook: "notebook", path: "/root.sy" })),
  listDocTree: vi.fn(async () => [{ id: "child" }]),
  sql: vi.fn(async () => []),
}));
import {
  extractBlockIdFromDocumentLink,
  extractRemoteTitleImage,
  getDocumentTreeIds,
  maintainDocumentTree,
} from "./local-cover-cache-maintenance";
import { listDocTree } from "@/api";

describe("local cover cache maintenance", () => {
  it("extracts block IDs from common SiYuan document links", () => {
    expect(extractBlockIdFromDocumentLink("siyuan://blocks/20260823010203-abcdefg")).toBe("20260823010203-abcdefg");
    expect(extractBlockIdFromDocumentLink("https://example.test/#/block/20260823010203-abcdefg")).toBe("20260823010203-abcdefg");
  });

  it("reads remote sources from legacy title-img attributes", () => {
    expect(extractRemoteTitleImage({ "title-img": 'background-image:url("https://safebooru.org/images/a.jpg")' })).toBe("https://safebooru.org/images/a.jpg");
    expect(extractRemoteTitleImage({ "title-img": "background-image:url(&quot;https://safebooru.org/images/a.jpg&quot;)" })).toBe("https://safebooru.org/images/a.jpg");
    expect(extractRemoteTitleImage({ "title-img": "background-image:url(assets/a.jpg)" })).toBeNull();
  });

  it("flattens the document tree and normalizes the path returned by SiYuan", async () => {
    vi.mocked(listDocTree).mockResolvedValueOnce([
      { id: "child", children: [{ id: "grandchild" }] },
    ]);
    await expect(getDocumentTreeIds("root")).resolves.toEqual(["root", "child", "grandchild"]);
    expect(listDocTree).toHaveBeenCalledWith("notebook", "root.sy");
  });

  it("maintains the root and all returned descendants without touching local covers", async () => {
    const setAttrs = vi.fn(async () => undefined);
    const adapter = {
      getAttrs: vi.fn(async (id: string) => id === "root" ? { "title-img": 'background-image:url("https://safebooru.org/a.jpg")' } : {}),
      cacheRemoteCover: vi.fn(async () => "data/cache.webp"),
      setAttrs,
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ code: 0, data: [{ id: "child" }] }) })));
    const result = await maintainDocumentTree("root", adapter);
    expect(result).toEqual({ scanned: 2, cached: 1, skipped: 1, failed: 0 });
    expect(setAttrs).toHaveBeenCalledOnce();
  });
});

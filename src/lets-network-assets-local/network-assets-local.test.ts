import { describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import {
  convertDocumentTreeNetworkAssets,
  hasRemoteResource,
  isRemoteResourceUrl,
  previewDocumentTreeNetworkAssets,
  remoteResourceUrls,
  resolveDocumentTree,
} from "./network-assets-local";

vi.mock("@/api", () => ({
  convertNetworkAssetsToLocalStrict: vi.fn(),
  getBlockKramdownStrict: vi.fn(),
  sqlStrict: vi.fn(),
}));

describe("network assets to local", () => {
  it("recognizes only network resource URL schemes", () => {
    expect(isRemoteResourceUrl("https://example.com/a.png")).toBe(true);
    expect(isRemoteResourceUrl("//cdn.example.com/a.mp3")).toBe(true);
    expect(isRemoteResourceUrl("assets/a.png")).toBe(false);
    expect(isRemoteResourceUrl("mailto:test@example.com")).toBe(false);
  });

  it("extracts remote references from Markdown and rendered HTML", () => {
    expect(remoteResourceUrls([
      "![image](https://example.com/image.png)",
      '<video src="//cdn.example.com/movie.mp4"></video>',
      "[local](assets/file.pdf)",
    ].join("\n"))).toEqual([
      "https://example.com/image.png",
      "//cdn.example.com/movie.mp4",
    ]);
  });

  it("shows a block action only for rendered remote resource elements", () => {
    const block = (resources: Array<{ src?: string; href?: string }>) => ({
      querySelectorAll: () => resources.map((resource) => ({
        getAttribute: (name: string) => resource[name as "src" | "href"] ?? null,
      })),
    }) as unknown as HTMLElement;
    expect(hasRemoteResource([block([{ src: "https://example.com/a.png" }])])).toBe(true);
    expect(hasRemoteResource([block([{ href: "https://example.com/page" }])])).toBe(true);
    expect(hasRemoteResource([block([{ src: "assets/a.png" }])])).toBe(false);
  });

  it("resolves the selected document and all descendants by notebook path", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }, { id: "child", box: "box", hpath: "/Root/Child" }]);

    await expect(resolveDocumentTree("root", true)).resolves.toHaveLength(2);
    expect(api.sqlStrict).toHaveBeenLastCalledWith(expect.stringContaining("hpath LIKE '/Root/%'"));
  });

  it("converts every document in the tree in order", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }, { id: "child", box: "box", hpath: "/Root/Child" }]);
    const progress = vi.fn();
    await expect(convertDocumentTreeNetworkAssets("root", progress)).resolves.toEqual({ documents: 2 });
    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenNthCalledWith(1, "root");
    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenNthCalledWith(2, "child");
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("builds a per-document preview before conversion", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }, { id: "child", box: "box", hpath: "/Root/Child" }]);
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({ id: "root", kramdown: "![one](https://example.com/one.png)" })
      .mockResolvedValueOnce({ id: "child", kramdown: '<audio src="https://example.com/two.mp3">' });

    await expect(previewDocumentTreeNetworkAssets("root")).resolves.toEqual([
      expect.objectContaining({ id: "root", urls: ["https://example.com/one.png"] }),
      expect.objectContaining({ id: "child", urls: ["https://example.com/two.mp3"] }),
    ]);
  });
});

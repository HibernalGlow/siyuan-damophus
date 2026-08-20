import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import {
  compileExcludedPatterns,
  convertDocumentTreeNetworkAssets,
  hasRemoteResource,
  isRemoteResourceUrl,
  parseExcludedRules,
  previewDocumentTreeNetworkAssets,
  remoteResourceUrls,
  resolveDocumentTree,
} from "./network-assets-local";

vi.mock("@/api", () => ({
  convertNetworkAssetsToLocalStrict: vi.fn(),
  getBlockKramdownStrict: vi.fn(),
  updateBlockStrict: vi.fn(),
  sqlStrict: vi.fn(),
}));

describe("network assets to local", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes only network resource URL schemes", () => {
    expect(isRemoteResourceUrl("https://example.com/a.png")).toBe(true);
    expect(isRemoteResourceUrl("//cdn.example.com/a.mp3")).toBe(true);
    expect(isRemoteResourceUrl("file:///D:/notes/image.png")).toBe(true);
    expect(isRemoteResourceUrl("assets/a.png")).toBe(false);
    expect(isRemoteResourceUrl("mailto:test@example.com")).toBe(false);
  });

  it("extracts remote references from Markdown and rendered HTML", () => {
    expect(remoteResourceUrls([
      "![image](https://example.com/image.png)",
      '<video src="//cdn.example.com/movie.mp4"></video>',
      "![local file](file:///D:/notes/image.png)",
      "[local](assets/file.pdf)",
    ].join("\n"))).toEqual([
      "https://example.com/image.png",
      "file:///D:/notes/image.png",
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
    expect(hasRemoteResource([block([{ src: "file:///D:/notes/image.png" }])])).toBe(true);
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
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({ id: "root", kramdown: "" })
      .mockResolvedValueOnce({ id: "child", kramdown: "" });
    const progress = vi.fn();
    await expect(convertDocumentTreeNetworkAssets("root", progress)).resolves.toEqual({ documents: 2 });
    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenNthCalledWith(1, "root");
    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenNthCalledWith(2, "child");
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it("builds a per-document preview before conversion", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }, { id: "child", box: "box", hpath: "/Root/Child" }])
      .mockResolvedValueOnce([{ id: "root-block", type: "NodeParagraph" }])
      .mockResolvedValueOnce([{ id: "child-block", type: "NodeParagraph" }]);
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({ id: "root-block", kramdown: "![one](https://example.com/one.png)" })
      .mockResolvedValueOnce({ id: "child-block", kramdown: '<audio src="https://example.com/two.mp3">' });

    await expect(previewDocumentTreeNetworkAssets("root")).resolves.toEqual([
      expect.objectContaining({ id: "root", urls: ["https://example.com/one.png"] }),
      expect.objectContaining({ id: "child", urls: ["https://example.com/two.mp3"] }),
    ]);
  });

  it("filters preview scanning to configured convertible block types", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "paragraph", type: "p" }, { id: "html", type: "html" }]);
    vi.mocked(api.getBlockKramdownStrict).mockResolvedValueOnce({ id: "paragraph", kramdown: "![ok](https://example.com/ok.png)" });

    await expect(previewDocumentTreeNetworkAssets("root", new Set(["NodeParagraph"]))).resolves.toEqual([
      expect.objectContaining({ id: "root", urls: ["https://example.com/ok.png"] }),
    ]);
    expect(api.getBlockKramdownStrict).toHaveBeenCalledTimes(1);
  });

  it("includes local file resources in the preview for the official document converter", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "image", type: "p" }]);
    vi.mocked(api.getBlockKramdownStrict).mockResolvedValueOnce({
      id: "image",
      kramdown: "![](file:///D:/notes/image.png)",
    });

    await expect(previewDocumentTreeNetworkAssets("root")).resolves.toEqual([
      expect.objectContaining({ id: "root", urls: ["file:///D:/notes/image.png"] }),
    ]);
  });

  it("preserves skipped and regex-matched URLs during conversion", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }]);
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({
        id: "root",
        kramdown: "![keep](https://inkloomer.github.io/inkloom/a.png) ![filtered](https://tracking.example/a.png) ![convert](https://example.com/a.png)",
      })
      .mockResolvedValueOnce({
        id: "root",
        kramdown: "![keep](damophus-skip-network-resource-0-root/a.png) ![filtered](damophus-skip-network-resource-1-root/a.png) ![convert](local/a.png)",
      });

    await convertDocumentTreeNetworkAssets("root", undefined, {
      skippedUrls: new Set(["https://inkloomer.github.io/inkloom/a.png"]),
      excludedPattern: [
        "# Comment for inkloom",
        "// Disabled rule: inkloom",
        "tracking\\.example",
        "# another commented out pattern: example\\.com",
      ].join("\n"),
    });

    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenCalledWith("root");
    expect(api.updateBlockStrict).toHaveBeenCalledWith("markdown", expect.stringContaining("https://inkloomer.github.io/inkloom/a.png"), "root");
  });

  it("parses multi-line excluded rules and strips comments (# and //)", () => {
    const raw = [
      "# Comment line",
      "inkloomer\\.github\\.io/inkloom",
      "",
      "  // Another comment line  ",
      "github\\.com/[^/]+/[^/]+/(?:issues|pull)",
      "# disabled-rule\\.com",
    ].join("\n");

    const rules = parseExcludedRules(raw);
    expect(rules).toEqual([
      "inkloomer\\.github\\.io/inkloom",
      "github\\.com/[^/]+/[^/]+/(?:issues|pull)",
    ]);

    const patterns = compileExcludedPatterns(raw);
    expect(patterns).toHaveLength(2);
    expect(patterns[0].test("https://inkloomer.github.io/inkloom/asset.png")).toBe(true);
    expect(patterns[1].test("https://github.com/user/repo/issues/1")).toBe(true);
    expect(patterns.some((p) => p.test("https://disabled-rule.com/asset.png"))).toBe(false);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "@/api";
import { plugin as pluginData } from "@/utils";
import { normalizeAssetLinkMap } from "./asset-link-store";
import {
  attributeConvertedAssets,
  compileExcludedPatterns,
  convertDocumentTreeNetworkAssets,
  DEFAULT_EXCLUDED_RULES,
  extractNetworkAssetPaths,
  hasRemoteResource,
  isRemoteResourceUrl,
  normalizeExcludedRules,
  parseExcludedRules,
  parseSourceUrlAttr,
  previewDocumentTreeNetworkAssets,
  remoteResourceUrls,
  replaceAllOrdered,
  resolveDocumentTree,
  SOURCE_URL_ATTR_KEY,
  type ExcludedRuleItem,
} from "./network-assets-local";

vi.mock("@/api", () => ({
  batchSetBlockAttrsStrict: vi.fn(),
  convertNetworkAssetsToLocalStrict: vi.fn(),
  getBlockAttrsStrict: vi.fn(),
  getBlockKramdownStrict: vi.fn(),
  statAssetStrict: vi.fn(),
  updateBlockStrict: vi.fn(),
  sqlStrict: vi.fn(),
}));

vi.mock("@/utils", () => ({
  plugin: { loadData: vi.fn(), saveData: vi.fn() },
}));

describe("network assets to local", () => {
  beforeEach(() => {
    vi.resetAllMocks();
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
      .mockResolvedValueOnce({ id: "root", kramdown: "![](https://example.com/one.png)" })
      .mockResolvedValueOnce({ id: "root", kramdown: "![](https://example.com/one.png)" })
      .mockResolvedValueOnce({ id: "child", kramdown: "![](https://example.com/two.png)" })
      .mockResolvedValueOnce({ id: "child", kramdown: "![](https://example.com/two.png)" });
    const progress = vi.fn();
    await expect(convertDocumentTreeNetworkAssets("root", progress)).resolves.toEqual({ documents: 2, downloaded: 0, reused: 0 });
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

  it("handles structured ExcludedRuleItem array with independent switch toggles", () => {
    const rules: ExcludedRuleItem[] = [
      { pattern: "inkloomer\\.github\\.io/inkloom", description: "InkLoom assets", enabled: true },
      { pattern: "github\\.com/[^/]+/[^/]+/(?:issues|pull)", description: "GitHub", enabled: false }, // Switch turned OFF
      { pattern: "baidu\\.com", description: "Baidu", enabled: true },
    ];

    const normalized = normalizeExcludedRules(rules);
    expect(normalized).toHaveLength(3);
    expect(normalized[0].enabled).toBe(true);
    expect(normalized[1].enabled).toBe(false);

    const patterns = compileExcludedPatterns(rules);
    expect(patterns).toHaveLength(2);
    expect(patterns.some((p) => p.test("https://inkloomer.github.io/inkloom/a.png"))).toBe(true);
    expect(patterns.some((p) => p.test("https://github.com/user/repo/issues/1"))).toBe(false);
    expect(patterns.some((p) => p.test("https://baidu.com/logo.png"))).toBe(true);
  });

  it("includes default excluded rules with InkLoom and GitHub enabled", () => {
    expect(DEFAULT_EXCLUDED_RULES.length).toBeGreaterThanOrEqual(2);
    expect(DEFAULT_EXCLUDED_RULES.every((r) => r.enabled)).toBe(true);
    const patterns = compileExcludedPatterns(DEFAULT_EXCLUDED_RULES);
    expect(patterns.some((p) => p.test("https://inkloomer.github.io/inkloom/demo.png"))).toBe(true);
  });

  it("normalizes persisted link maps and drops invalid entries", () => {
    expect(normalizeAssetLinkMap(undefined)).toEqual({ version: 1, links: {} });
    expect(normalizeAssetLinkMap({
      version: 1,
      links: { "https://a.example/x.png": "assets/x.png", "https://b.example/y.png": 42, "relative": "assets/y.png" },
    })).toEqual({ version: 1, links: { "https://a.example/x.png": "assets/x.png" } });
  });

  it("extracts kernel-written network asset paths in document order", () => {
    expect(extractNetworkAssetPaths(
      '![a](assets/network-asset-x-1.png) <img src="assets/network-asset-y-2.jpg"> ![local](assets/keep.png)',
    )).toEqual(["assets/network-asset-x-1.png", "assets/network-asset-y-2.jpg"]);
  });

  it("pairs converted URLs with freshly written asset files, skipping failed downloads", () => {
    const before = "![a](https://e/1.png) ![b](https://e/2.png) ![c](https://e/3.png) ![old](assets/network-asset-old.png)";
    const after = "![a](assets/network-asset-new-1.png) ![b](https://e/2.png) ![c](assets/network-asset-new-2.png) ![old](assets/network-asset-old.png)";
    expect(attributeConvertedAssets(["https://e/1.png", "https://e/2.png", "https://e/3.png"], before, after)).toEqual([
      ["https://e/1.png", "assets/network-asset-new-1.png"],
      ["https://e/3.png", "assets/network-asset-new-2.png"],
    ]);
  });

  it("applies longer URL replacements first so prefixes cannot corrupt them", () => {
    expect(replaceAllOrdered("u https://e/a.png?v=2 and https://e/a.png", [
      ["https://e/a.png", "assets/short.png"],
      ["https://e/a.png?v=2", "assets/long.png"],
    ])).toBe("u assets/long.png and assets/short.png");
  });

  it("parses stored source-url attributes defensively", () => {
    expect(parseSourceUrlAttr('{"assets/a.png":"https://e/a.png"}')).toEqual({ "assets/a.png": "https://e/a.png" });
    expect(parseSourceUrlAttr("not json")).toEqual({});
    expect(parseSourceUrlAttr(undefined)).toEqual({});
  });

  it("reuses the mapped local file for a known URL without contacting the kernel converter", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "p1", markdown: "![](assets/network-asset-old-1.png)" }]);
    vi.mocked(api.getBlockKramdownStrict).mockResolvedValue({
      id: "root",
      kramdown: "![keep](https://skip.example/a.png) ![](https://example.com/a.png)",
    });
    vi.mocked(api.statAssetStrict).mockResolvedValue(true);
    vi.mocked(pluginData.loadData).mockResolvedValue({
      version: 1,
      links: { "https://example.com/a.png": "assets/network-asset-old-1.png" },
    });

    const result = await convertDocumentTreeNetworkAssets("root", undefined, { excludedPattern: "skip\\.example" });

    expect(result).toEqual({ documents: 1, downloaded: 0, reused: 1 });
    expect(api.convertNetworkAssetsToLocalStrict).not.toHaveBeenCalled();
    expect(api.updateBlockStrict).toHaveBeenCalledWith(
      "markdown",
      "![keep](https://skip.example/a.png) ![](assets/network-asset-old-1.png)",
      "root",
    );
    expect(api.batchSetBlockAttrsStrict).toHaveBeenCalledWith([
      { id: "p1", attrs: { [SOURCE_URL_ATTR_KEY]: JSON.stringify({ "assets/network-asset-old-1.png": "https://example.com/a.png" }) } },
    ]);
    expect(pluginData.saveData).not.toHaveBeenCalled();
  });

  it("attributes kernel-written files to their URLs, persists the map and records source attrs", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "p1", markdown: "![](assets/network-asset-fresh-1.png)" }]);
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({ id: "root", kramdown: "![](https://example.com/new.png)" })
      .mockResolvedValueOnce({ id: "root", kramdown: "![](assets/network-asset-fresh-1.png)" });
    vi.mocked(api.getBlockAttrsStrict).mockResolvedValue({});

    const result = await convertDocumentTreeNetworkAssets("root");

    expect(result).toEqual({ documents: 1, downloaded: 1, reused: 0 });
    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenCalledWith("root");
    expect(api.updateBlockStrict).toHaveBeenCalledWith("markdown", "![](assets/network-asset-fresh-1.png)", "root");
    expect(pluginData.saveData).toHaveBeenCalledWith("network-assets-local/asset-links.json", {
      version: 1,
      links: { "https://example.com/new.png": "assets/network-asset-fresh-1.png" },
    });
    expect(api.batchSetBlockAttrsStrict).toHaveBeenCalledWith([
      { id: "p1", attrs: { [SOURCE_URL_ATTR_KEY]: JSON.stringify({ "assets/network-asset-fresh-1.png": "https://example.com/new.png" }) } },
    ]);
  });

  it("re-downloads a URL when its mapped file no longer exists", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }]);
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({ id: "root", kramdown: "![](https://example.com/gone.png)" })
      .mockResolvedValueOnce({ id: "root", kramdown: "![](assets/network-asset-fresh-2.png)" });
    vi.mocked(api.statAssetStrict).mockResolvedValue(false);
    vi.mocked(pluginData.loadData).mockResolvedValue({
      version: 1,
      links: { "https://example.com/gone.png": "assets/network-asset-lost.png" },
    });

    const result = await convertDocumentTreeNetworkAssets("root", undefined, { preserveSourceUrls: false });

    expect(result).toEqual({ documents: 1, downloaded: 1, reused: 0 });
    expect(api.convertNetworkAssetsToLocalStrict).toHaveBeenCalledTimes(1);
    expect(pluginData.saveData).toHaveBeenCalledWith("network-assets-local/asset-links.json", {
      version: 1,
      links: { "https://example.com/gone.png": "assets/network-asset-fresh-2.png" },
    });
    expect(api.batchSetBlockAttrsStrict).not.toHaveBeenCalled();
  });

  it("skips the global map entirely when global dedup is disabled", async () => {
    vi.mocked(api.sqlStrict)
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }])
      .mockResolvedValueOnce([{ id: "root", box: "box", hpath: "/Root" }]);
    vi.mocked(api.getBlockKramdownStrict)
      .mockResolvedValueOnce({ id: "root", kramdown: "![](https://example.com/a.png)" })
      .mockResolvedValueOnce({ id: "root", kramdown: "![](assets/network-asset-x-9.png)" });

    const result = await convertDocumentTreeNetworkAssets("root", undefined, { globalDedup: false, preserveSourceUrls: false });

    expect(result).toEqual({ documents: 1, downloaded: 1, reused: 0 });
    expect(pluginData.loadData).not.toHaveBeenCalled();
    expect(pluginData.saveData).not.toHaveBeenCalled();
  });
});

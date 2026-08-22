import { describe, expect, it } from "vitest";
import metadata from "./plugin";

describe("lets-more-background plugin metadata", () => {
  it("exports valid metadata object", () => {
    expect(metadata.name).toBe("moreBackground");
    expect(metadata.displayName).toBe("lets-more-background.displayName");
    expect(metadata.version).toBe("1.0.0");
  });

  it("contains necessary configuration settings", () => {
    const keys = metadata.settings?.map((s) => s.key);
    expect(keys).toContain("width");
    expect(keys).toContain("height");
    expect(keys).toContain("assetsLocation");
    expect(keys).toContain("readFromAssets");
    expect(keys).toContain("writeToAssets");
    expect(keys).toContain("localCache");
    expect(keys).toContain("autoCacheLegacyCovers");
    expect(keys).toContain("localCacheRoot");
    expect(keys).toContain("localCachePathTemplate");
    expect(keys).toContain("localCacheMaxEdge");
    expect(keys).toContain("directDrag");
    expect(keys).toContain("toolbarPosition");
    expect(keys).toContain("toolbarCustomX");
    expect(keys).toContain("toolbarCustomY");
    expect(keys).toContain("coverBreadcrumb");
    expect(keys).toContain("coverDocumentMenu");
    expect(keys).toContain("siteCredentials");
    expect(keys).toContain("templates");
    expect(keys).toContain("sources");
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HistoryVersion } from "./types";

const api = vi.hoisted(() => ({
  getBlockKramdownStrict: vi.fn(),
  getDocHistoryContent: vi.fn(),
  getDocHistoryItems: vi.fn(),
  searchDocHistory: vi.fn(),
}));

vi.mock(import("@/api"), () => api);

import { BlockHistoryService, DocumentHistoryService } from "./history-service";

const version: HistoryVersion = {
  created: "1786521600",
  title: "Document",
  path: "data/.siyuan/history/example.sy",
  operation: "update",
};

describe("document history cache", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getBlockKramdownStrict.mockResolvedValue({ kramdown: "current" });
    api.getDocHistoryContent.mockResolvedValue({ content: "<div>old</div>", isLargeDoc: false });
    api.getDocHistoryItems.mockResolvedValue([{
      title: "Document",
      path: "data/.siyuan/history/example.sy",
      op: "update",
      notebook: "notebook",
    }]);
  });

  it("reuses immutable history content and refreshes current content only when invalidated", async () => {
    const lute = { BlockDOM2StdMd: vi.fn().mockReturnValue("history") };
    const service = new DocumentHistoryService("doc-id", lute);

    await expect(service.loadVersionKramdown(version)).resolves.toBe("history");
    await expect(service.loadVersionKramdown(version)).resolves.toBe("history");
    expect(api.getDocHistoryContent).toHaveBeenCalledTimes(1);
    expect(lute.BlockDOM2StdMd).toHaveBeenCalledTimes(1);

    await service.loadCurrentKramdown();
    await service.loadCurrentKramdown();
    expect(api.getBlockKramdownStrict).toHaveBeenCalledTimes(1);

    service.invalidateCurrent();
    await service.loadCurrentKramdown();
    expect(api.getBlockKramdownStrict).toHaveBeenCalledTimes(2);
  });

  it("loads a page without fetching every history item", async () => {
    api.searchDocHistory.mockResolvedValue({ histories: ["3", "2", "1"], pageCount: 1, totalCount: 3 });
    const service = new DocumentHistoryService("doc-id", { BlockDOM2StdMd: vi.fn() });
    await expect(service.loadPage()).resolves.toMatchObject({
      versions: [{ created: "3" }, { created: "2" }, { created: "1" }],
      totalCount: 3,
    });
    expect(api.getDocHistoryItems).not.toHaveBeenCalled();
  });

  it("uses the standard Markdown converter for read-only history Block DOM", async () => {
    const content = '<div data-type="NodeHeading"><div contenteditable="false" spellcheck="false">09 考点9：破产法概述</div></div>';
    api.getDocHistoryContent.mockResolvedValue({ content, isLargeDoc: false });
    const lute = { BlockDOM2StdMd: vi.fn().mockReturnValue("# 09 考点9：破产法概述\n") };
    const service = new DocumentHistoryService("doc-id", lute);

    await expect(service.loadVersionKramdown(version)).resolves.toBe("# 09 考点9：破产法概述\n");
    expect(lute.BlockDOM2StdMd).toHaveBeenCalledWith(content);
  });
});

describe("block history snapshots", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getBlockKramdownStrict.mockResolvedValue({ kramdown: "current block" });
  });

  it("loads the live Kramdown from the selected block ID", async () => {
    const service = new BlockHistoryService("doc-id", "target", { BlockDOM2StdMd: vi.fn() });

    await expect(service.loadCurrentKramdown()).resolves.toBe("current block");
    expect(api.getBlockKramdownStrict).toHaveBeenCalledWith("target");
  });
});

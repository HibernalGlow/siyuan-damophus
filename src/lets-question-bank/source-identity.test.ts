import { describe, expect, it, vi } from "vitest";
import type { SiyuanKernelClient } from "../question-bank/adapters/siyuan/types";
import { loadSourceBlockIdentity } from "./source-identity";

describe("source block identity", () => {
  it("loads the selected block content and document identity", async () => {
    const request = vi.fn(async () => [{
      id: "20260806120000-source1",
      root_id: "20260806110000-documen",
      type: "h",
      subtype: "h2",
      content: "Civil procedure questions",
      hpath: "/Exam/Civil Procedure",
    }]) as SiyuanKernelClient["request"];

    await expect(loadSourceBlockIdentity({ request }, "20260806120000-source1")).resolves.toEqual({
      id: "20260806120000-source1",
      rootId: "20260806110000-documen",
      type: "h",
      subtype: "h2",
      content: "Civil procedure questions",
      hpath: "/Exam/Civil Procedure",
    });
    expect(request).toHaveBeenCalledWith("/api/query/sql", {
      stmt: "SELECT id, root_id, type, subtype, content, hpath FROM blocks WHERE id = '20260806120000-source1' LIMIT 1",
    });
  });

  it("rejects invalid or missing block IDs", async () => {
    const request = vi.fn(async () => []) as SiyuanKernelClient["request"];

    await expect(loadSourceBlockIdentity({ request }, "not-a-block")).rejects.toThrow("Invalid SiYuan block ID");
    await expect(loadSourceBlockIdentity({ request }, "20260806120000-missing")).rejects.toThrow("Cannot resolve source block");
    expect(request).toHaveBeenCalledTimes(1);
  });
});

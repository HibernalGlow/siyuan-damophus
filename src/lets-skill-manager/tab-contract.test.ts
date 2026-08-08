import { describe, expect, it } from "vitest";
import { skillManagerTabTarget, skillManagerTabType } from "./tab-contract";

describe("skill manager custom tab contract", () => {
  it("uses a stable plugin-prefixed custom tab id", () => {
    expect(skillManagerTabType).toBe("skill-manager");
    expect(skillManagerTabTarget("siyuan-damophus")).toEqual({
      id: "siyuan-damophusskill-manager",
      data: {},
    });
  });
});

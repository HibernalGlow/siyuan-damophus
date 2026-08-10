import { describe, expect, it } from "vitest";
import { skillManagerDockType, skillManagerTabTarget, skillManagerTabType } from "./tab-contract";

describe("skill manager custom tab contract", () => {
  it("uses a stable plugin-prefixed custom tab id", () => {
    expect(skillManagerTabType).toBe("skill-manager");
    expect(skillManagerDockType).toBe("damophus-skill-manager-dock-v2");
    expect(skillManagerTabTarget("siyuan-damophus")).toEqual({
      id: "siyuan-damophusskill-manager",
      data: {},
    });
  });
});

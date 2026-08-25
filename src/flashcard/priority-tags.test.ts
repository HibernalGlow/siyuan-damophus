import { describe, expect, it } from "vitest";
import { deactivatePriorityTags, priorityTag, readPriorityTags, reactivatePriorityTags, replacePriorityTag } from "./priority-tags";

describe("portable flashcard priority tags", () => {
  it("maps runtime priorities to P1-P4", () => {
    expect(priorityTag(90)).toBe("P1");
    expect(priorityTag(60)).toBe("P2");
    expect(priorityTag(30)).toBe("P3");
    expect(priorityTag(10)).toBe("P4");
  });

  it("replaces only DAMO priority tags and preserves other markdown", () => {
    const source = "- 问题\n#法考/民法# #闪卡/优先级/P4#\n  两个空格保留  ";
    const result = replacePriorityTag(source, 80);
    expect(result).toContain("#法考/民法#");
    expect(result).not.toContain("P4");
    expect(result).toContain("#闪卡/优先级/P1#");
    expect(result).toContain("两个空格保留  ");
  });

  it("treats repeated shallow tags as one priority and nested tags as child scope", () => {
    const result = readPriorityTags("- 问题 #闪卡/优先级/P1#\n    - 子卡 #闪卡/优先级/P4#\n#闪卡/优先级/P1#");
    expect(result).toEqual({ tags: ["P1"], conflict: false });
  });

  it("reports conflicting priority tags at the same scope", () => {
    expect(readPriorityTags("- 问题 #闪卡/优先级/P1# #闪卡/优先级/P3#")).toEqual({
      tags: ["P1", "P3"],
      conflict: true,
    });
  });

  it("updates only the shallowest priority scope", () => {
    const source = "- 问题 #闪卡/优先级/P1#\n    - 子卡 #闪卡/优先级/P4#";
    const result = replacePriorityTag(source, 75);
    expect(result).toContain("- 问题 #闪卡/优先级/P2#");
    expect(result).toContain("子卡 #闪卡/优先级/P4#");
  });

  it("moves priority tags outside the active SQL namespace while preserving their level", () => {
    const source = "问题 #闪卡/优先级/P2#\n    - 答案 #闪卡/优先级/P1#";
    const inactive = deactivatePriorityTags(source);
    expect(inactive).toContain("#闪卡/已取消登记/优先级/P2#");
    expect(inactive).toContain("#闪卡/已取消登记/优先级/P1#");
    expect(readPriorityTags(inactive)).toEqual({ tags: [], conflict: false });
    expect(reactivatePriorityTags(inactive)).toBe(source);
  });
});

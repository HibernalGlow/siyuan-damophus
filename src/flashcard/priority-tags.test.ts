import { describe, expect, it } from "vitest";
import { priorityTag, replacePriorityTag } from "./priority-tags";

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
});

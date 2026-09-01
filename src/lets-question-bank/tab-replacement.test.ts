import { describe, expect, it, vi } from "vitest";
import { replaceQuestionBankTabs } from "./tab-replacement";

function tab(type: string, pinned = false) {
  return {
    id: `${type}-${pinned}`,
    model: { type },
    headElement: { classList: { contains: () => pinned } },
    parent: { removeTab: vi.fn() },
  };
}

describe("question bank tab replacement", () => {
  it("returns undefined and leaves other tabs untouched when no question bank exists", () => {
    const other = tab("other");
    expect(replaceQuestionBankTabs([other] as never, "question-bank")).toBeUndefined();
    expect(other.parent.removeTab).not.toHaveBeenCalled();
  });

  it("closes all question bank tabs and preserves whether any was pinned", () => {
    const unpinned = tab("question-bank");
    const pinned = tab("question-bank", true);
    expect(replaceQuestionBankTabs([unpinned, pinned] as never, "question-bank")).toBe(true);
    expect(unpinned.parent.removeTab).toHaveBeenCalledWith(unpinned.id, false, false);
    expect(pinned.parent.removeTab).toHaveBeenCalledWith(pinned.id, false, false);
  });
});

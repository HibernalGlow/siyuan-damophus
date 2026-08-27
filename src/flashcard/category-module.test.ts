import { describe, expect, it } from "vitest";
import {
  addFlashcardCategory,
  mergeFlashcardCategoryConfig,
  parseFlashcardCategories,
  removeFlashcardCategory,
  renameFlashcardCategory,
  orderCardsByCategory,
} from "./category-module";
import type { FlashcardRoot } from "./types";
import type { RiffCardRecord } from "./siyuan-adapter";

const card = (blockID: string): RiffCardRecord => ({ blockID, cardID: `${blockID}-card` });
const root = (blockId: string, content: string): FlashcardRoot => ({ blockId, content, renderer: "list", kind: "basic", attributes: {} });

describe("flashcard categories", () => {
  it("parses, deduplicates, adds, removes and renames namespace tags", () => {
    const markdown = "问题\n#闪卡/分类/重点# #闪卡/分类/重点#\n#闪卡/分类/易混淆#";
    expect(parseFlashcardCategories(markdown)).toEqual(["重点", "易混淆"]);
    expect(addFlashcardCategory(markdown, "重点")).toBe(markdown);
    expect(addFlashcardCategory(markdown, "法条")).toContain("#闪卡/分类/法条#");
    expect(removeFlashcardCategory(markdown, "重点")).not.toContain("#闪卡/分类/重点#");
    expect(renameFlashcardCategory(markdown, "易混淆", "易错")).toContain("#闪卡/分类/易错#");
  });

  it("keeps category order independent from P1-P4 and stable for multi-category cards", () => {
    const cards = [card("plain"), card("late"), card("early"), card("both")];
    const roots = [root("plain", ""), root("late", "#闪卡/分类/易混淆#"), root("early", "#闪卡/分类/重点#"), root("both", "#闪卡/分类/重点# #闪卡/分类/易混淆#")];
    const config = mergeFlashcardCategoryConfig({ rules: [
      { name: "重点", participatesInReview: true, reviewOrder: 0 },
      { name: "易混淆", participatesInReview: true, reviewOrder: 1 },
    ] });
    expect(orderCardsByCategory(cards, roots, config).map((item) => item.blockID)).toEqual(["early", "both", "late", "plain"]);
  });

  it("fails open when category review is disabled", () => {
    const cards = [card("plain"), card("early")];
    const roots = [root("plain", ""), root("early", "#闪卡/分类/重点#")];
    const config = mergeFlashcardCategoryConfig({ reviewEnabled: false });
    expect(orderCardsByCategory(cards, roots, config).map((item) => item.blockID)).toEqual(["plain", "early"]);
  });
});

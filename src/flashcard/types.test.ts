import { describe, expect, it } from "vitest";
import {
  cardRenderer,
  parseIALAttributes,
  resolveCardRoots,
  toFlashcardRoot,
} from "./types";
import type { FlashcardBlockRow } from "./types";

describe("flashcard core", () => {
  it("parses Kramdown IAL without treating ordinary highlights as cards", () => {
    expect(parseIALAttributes('{: custom-dm-card-id="card-1" custom-dm-card-renderer="list"}')).toEqual({
      "custom-dm-card-id": "card-1",
      "custom-dm-card-renderer": "list",
    });
    expect(toFlashcardRoot({ id: "20260823000000-aaaaaaa", type: "p", content: "==reading==" })).toBeUndefined();
  });

  it("recognizes native flashcard container roots for one-click registration", () => {
    expect(toFlashcardRoot({ id: "20260823000000-aaaaaaa", type: "h", content: "Heading" })).toMatchObject({
      blockId: "20260823000000-aaaaaaa",
      renderer: "heading",
      kind: "basic",
    });
    expect(toFlashcardRoot({ id: "20260823000001-bbbbbbb", type: "callout", content: "Callout" })).toMatchObject({
      renderer: "callout",
    });
  });

  it("supports every declared renderer", () => {
    expect(cardRenderer({ "custom-dm-card-renderer": "heading" })).toBe("heading");
    expect(cardRenderer({ "custom-dm-card-renderer": "callout" })).toBe("callout");
    expect(cardRenderer({ "custom-dm-card-renderer": "other" })).toBe("unknown");
  });

  it("exposes same-scope priority conflicts for registration preview", () => {
    expect(toFlashcardRoot({
      id: "20260823000005-fffffff",
      type: "l",
      content: "问题 #闪卡/优先级/P1# #闪卡/优先级/P3#",
    })).toMatchObject({ priorityConflict: true });
  });

  it("resolves child SQL hits to the nearest explicit card root and deduplicates", () => {
    const child = { id: "20260823000001-bbbbbbb", parent_id: "20260823000002-ccccccc", type: "p" };
    const list = { id: "20260823000002-ccccccc", parent_id: "20260823000003-ddddddd", type: "l", ial: '{: custom-riff-decks="deck" custom-dm-card-renderer="list"}' };
    const grandchild = { id: "20260823000004-eeeeeee", parent_id: list.id, type: "p" };
    const parentRows = new Map<string, FlashcardBlockRow>([
      [list.id, list],
      ["20260823000003-ddddddd", { id: "20260823000003-ddddddd", type: "d" }],
    ]);
    expect(resolveCardRoots([child, grandchild], parentRows)).toEqual([list.id]);
  });
});

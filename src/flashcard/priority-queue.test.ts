import { describe, expect, it } from "vitest";
import { orderCardsByPriority } from "./priority-queue";
import type { FlashcardRoot } from "./types";
import type { RiffCardRecord } from "./siyuan-adapter";

function card(id: string): RiffCardRecord {
  return { blockID: id, cardID: `${id}-card` };
}

function root(id: string, priority?: FlashcardRoot["priority"], priorityConflict = false): FlashcardRoot {
  return { blockId: id, renderer: "list", kind: "basic", attributes: {}, priority, priorityConflict };
}

describe("flashcard priority queue", () => {
  it("orders P1 through P4 while preserving Riff order inside a priority", () => {
    const cards = [card("p3-a"), card("p1-a"), card("p3-b"), card("p2-a"), card("none")];
    const roots = [root("p3-a", "P3"), root("p1-a", "P1"), root("p3-b", "P3"), root("p2-a", "P2")];

    expect(orderCardsByPriority(cards, roots, { randomInterleave: false }).map((item) => item.blockID)).toEqual([
      "p1-a", "p2-a", "p3-a", "p3-b", "none",
    ]);
  });

  it("places conflicting priorities after unambiguous P1-P4 cards", () => {
    const cards = [card("conflict"), card("p4")];
    const roots = [root("conflict", "P1", true), root("p4", "P4")];

    expect(orderCardsByPriority(cards, roots, { randomInterleave: false }).map((item) => item.blockID)).toEqual([
      "p4", "conflict",
    ]);
  });

  it("mixes five percent of lower-priority cards into the first third", () => {
    const cards = [
      ...Array.from({ length: 20 }, (_, index) => card(`p1-${index}`)),
      ...Array.from({ length: 20 }, (_, index) => card(`p4-${index}`)),
    ];
    const roots = cards.map((item) => root(item.blockID, item.blockID.startsWith("p1") ? "P1" : "P4"));
    const ordered = orderCardsByPriority(cards, roots, { randomInterleave: true, random: () => 0 });

    expect(ordered[0].blockID).toBe("p1-0");
    expect(ordered.slice(1, 4).some((item) => item.blockID.startsWith("p4"))).toBe(true);
    expect(new Set(ordered.map((item) => item.blockID)).size).toBe(cards.length);
  });

  it("shuffles cards within each priority only when enabled", () => {
    const cards = [card("p1-a"), card("p1-b"), card("p2-a"), card("p2-b")];
    const roots = cards.map((item) => root(item.blockID, item.blockID.startsWith("p1") ? "P1" : "P2"));
    const ordered = orderCardsByPriority(cards, roots, {
      randomInterleave: false,
      samePriorityShuffle: true,
      random: () => 0,
    });

    expect(ordered.map((item) => item.blockID)).toEqual(["p1-b", "p1-a", "p2-b", "p2-a"]);
    expect(orderCardsByPriority(cards, roots, { randomInterleave: false }).map((item) => item.blockID)).toEqual([
      "p1-a", "p1-b", "p2-a", "p2-b",
    ]);
  });

  it("allows same-priority shuffle and cross-priority interleave together", () => {
    const cards = [card("p1-a"), card("p1-b"), card("p4-a"), card("p4-b")];
    const roots = cards.map((item) => root(item.blockID, item.blockID.startsWith("p1") ? "P1" : "P4"));
    const ordered = orderCardsByPriority(cards, roots, {
      randomInterleave: true,
      samePriorityShuffle: true,
      interleaveRate: 0.5,
      random: () => 0,
    });

    expect(new Set(ordered.map((item) => item.blockID))).toEqual(new Set(cards.map((item) => item.blockID)));
    expect(ordered.slice(0, 2).some((item) => item.blockID.startsWith("p4"))).toBe(true);
  });
});

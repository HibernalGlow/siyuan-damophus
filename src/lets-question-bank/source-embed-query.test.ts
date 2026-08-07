import { describe, expect, it } from "vitest";
import {
  loadSourceEmbedRows,
  sourceEmbedBlockIds,
  sourceEmbedSql,
  type SourceEmbedBlockRow,
} from "./source-embed-query";

const rows: SourceEmbedBlockRow[] = [
  { id: "20260806000000-doc0001", sort: 0, type: "d" },
  { id: "20260806000001-q000001", parent_id: "20260806000000-doc0001", sort: 1, ial: '{: custom-qb-id="q1"}' },
  { id: "20260806000002-body001", parent_id: "20260806000001-q000001", sort: 1, type: "l" },
  { id: "20260806000003-stem001", parent_id: "20260806000002-body001", sort: 1, type: "p", content: "Question stem" },
  { id: "20260806000004-opt0001", parent_id: "20260806000002-body001", sort: 2, type: "l", content: "A. First B. Second" },
  { id: "20260806000005-sol0001", parent_id: "20260806000001-q000001", sort: 2, type: "l", ial: '{: custom-qb-section="solution"}', content: "Answer: B" },
  { id: "20260806000006-expl001", parent_id: "20260806000001-q000001", sort: 3, type: "l", content: "Explanation" },
  { id: "20260806000007-q000002", parent_id: "20260806000000-doc0001", sort: 2, ial: '{: custom-qb-id="q2"}' },
  { id: "20260806000008-next001", parent_id: "20260806000007-q000002", sort: 1, content: "Next question" },
];

describe("source embed query", () => {
  it("keeps only stem text before reveal and excludes options", () => {
    expect(sourceEmbedBlockIds(rows, "20260806000001-q000001", "stem")).toEqual([
      "20260806000003-stem001",
    ]);
  });

  it("returns answer and explanation only for the solution section", () => {
    expect(sourceEmbedBlockIds(rows, "20260806000001-q000001", "solution")).toEqual([
      "20260806000005-sol0001",
      "20260806000006-expl001",
    ]);
  });

  it("preserves section block order in SQL", () => {
    const query = sourceEmbedSql(rows, "20260806000001-q000001", "solution");
    expect(query).toContain(
      "WHERE id IN ('20260806000005-sol0001', '20260806000006-expl001')",
    );
    expect(query).toContain(
      "ORDER BY CASE id WHEN '20260806000005-sol0001' THEN 0 WHEN '20260806000006-expl001' THEN 1",
    );
  });

  it("optionally hides semantically empty answer paragraphs, lists, and tables", () => {
    const answerRows: SourceEmbedBlockRow[] = [
      { id: "20260806010000-q000001", type: "h", ial: '{: custom-qb-id="empty-answer-test"}' },
      { id: "20260806010001-sol0001", parent_id: "20260806010000-q000001", type: "p", content: "Answer: B", ial: '{: custom-qb-section="solution"}' },
      { id: "20260806010002-empty01", parent_id: "20260806010000-q000001", type: "p", markdown: "  {: id=\"20260806010002-empty01\"}" },
      { id: "20260806010003-empty02", parent_id: "20260806010000-q000001", type: "l", content: "" },
      { id: "20260806010004-empty03", parent_id: "20260806010003-empty02", type: "i", markdown: "-   " },
      { id: "20260806010005-empty04", parent_id: "20260806010000-q000001", type: "t", markdown: "| |\n| --- |\n| |" },
      { id: "20260806010006-list001", parent_id: "20260806010000-q000001", type: "l", content: "" },
      { id: "20260806010007-item001", parent_id: "20260806010006-list001", type: "i", content: "Explanation" },
    ];

    expect(sourceEmbedBlockIds(answerRows, "20260806010000-q000001", "solution", {
      hideEmptySolutionBlocks: true,
    })).toEqual([
      "20260806010001-sol0001",
      "20260806010006-list001",
    ]);
    expect(sourceEmbedBlockIds(answerRows, "20260806010000-q000001", "solution")).toEqual([
      "20260806010001-sol0001",
      "20260806010002-empty01",
      "20260806010003-empty02",
      "20260806010005-empty04",
      "20260806010006-list001",
    ]);
    const query = sourceEmbedSql(answerRows, "20260806010000-q000001", "solution", {
      hideEmptySolutionBlocks: true,
    });
    expect(query).not.toContain("20260806010002-empty01");
    expect(query).not.toContain("20260806010003-empty02");
    expect(query).not.toContain("20260806010005-empty04");
  });

  it("returns an empty SQL result when every answer block is empty and filtering is enabled", () => {
    const emptyRows: SourceEmbedBlockRow[] = [
      { id: "20260806020000-q000002", type: "h", ial: '{: custom-qb-id="all-empty"}' },
      { id: "20260806020001-sol0002", parent_id: "20260806020000-q000002", type: "p", content: "", ial: '{: custom-qb-section="solution"}' },
    ];
    expect(sourceEmbedSql(emptyRows, "20260806020000-q000002", "solution", {
      hideEmptySolutionBlocks: true,
    })).toBe("SELECT * FROM blocks WHERE 1 = 0");
  });

  it("matches real question 145 and does not expose its full heading subtree before reveal", () => {
    const realRows: SourceEmbedBlockRow[] = [
      { id: "20260806005231-9llmnk4", parent_id: "20260806005231-nib2w11", sort: 5, type: "h", content: "145.", ial: '{: custom-qb-id="civil-procedure-gold-2015-3-48"}' },
      { id: "20260806005231-p6dzb2p", parent_id: "20260806005231-9llmnk4", order: 0, type: "l", content: "Question and A. option list" },
      { id: "20260806005231-question", parent_id: "20260806005231-p6dzb2p", order: 1, type: "p", content: "Question stem" },
      { id: "20260806005231-options", parent_id: "20260806005231-p6dzb2p", order: 2, type: "l", content: "A. First B. Second" },
      { id: "20260806005231-c4lr18w", parent_id: "20260806005231-9llmnk4", order: 3, type: "l", content: "Answer: B", ial: '{: custom-qb-section="solution"}' },
      { id: "20260806005231-1gxlpdc", parent_id: "20260806005231-9llmnk4", order: 4, type: "l", content: "Question explanation" },
      { id: "20260806005231-7e8gnmf", parent_id: "20260806005231-9llmnk4", order: 5, type: "p", content: "Shared summary one" },
      { id: "20260806005231-u08p9a3", parent_id: "20260806005231-9llmnk4", order: 6, type: "l", content: "Shared summary details" },
    ];

    expect(sourceEmbedBlockIds(realRows, "20260806005231-9llmnk4", "stem")).toEqual([
      "20260806005231-question",
    ]);
    expect(sourceEmbedBlockIds(realRows, "20260806005231-9llmnk4", "solution")).toEqual([
      "20260806005231-c4lr18w",
      "20260806005231-1gxlpdc",
      "20260806005231-7e8gnmf",
      "20260806005231-u08p9a3",
    ]);
  });

  it("loads a real question subtree instead of relying on a truncated document query", async () => {
    const realRows: SourceEmbedBlockRow[] = [
      { id: "20260806005231-9llmnk4", parent_id: "20260806005231-nib2w11", type: "h", content: "145.", ial: '{: custom-qb-id="q145"}' },
      { id: "20260806005231-p6dzb2p", parent_id: "20260806005231-9llmnk4", type: "l", content: "Question container" },
      { id: "20260806005231-0pvujjo", parent_id: "20260806005231-p6dzb2p", type: "p", content: "Question stem" },
      { id: "20260806005231-gxm2xl5", parent_id: "20260806005231-p6dzb2p", type: "l", content: "A. First B. Second" },
      { id: "20260806005231-c4lr18w", parent_id: "20260806005231-9llmnk4", type: "l", content: "Answer: B", ial: '{: custom-qb-section="solution"}' },
      { id: "20260806005231-1gxlpdc", parent_id: "20260806005231-9llmnk4", type: "l", content: "Explanation" },
    ];
    const children = new Map<string, { id: string }[]>([
      ["20260806005231-9llmnk4", [
        { id: "20260806005231-p6dzb2p" },
        { id: "20260806005231-c4lr18w" },
        { id: "20260806005231-1gxlpdc" },
      ]],
      ["20260806005231-p6dzb2p", [
        { id: "20260806005231-0pvujjo" },
        { id: "20260806005231-gxm2xl5" },
      ]],
    ]);
    const requested: string[][] = [];

    const loaded = await loadSourceEmbedRows("20260806005231-9llmnk4", {
      loadChildren: async (blockId) => children.get(blockId) ?? [],
      loadRows: async (blockIds) => {
        requested.push([...blockIds]);
        return realRows.filter((row) => blockIds.includes(row.id));
      },
    });

    expect(requested).toEqual([[
      "20260806005231-9llmnk4",
      "20260806005231-p6dzb2p",
      "20260806005231-0pvujjo",
      "20260806005231-gxm2xl5",
      "20260806005231-c4lr18w",
      "20260806005231-1gxlpdc",
    ]]);
    expect(sourceEmbedBlockIds(loaded, "20260806005231-9llmnk4", "stem")).toEqual([
      "20260806005231-0pvujjo",
    ]);
    expect(sourceEmbedBlockIds(loaded, "20260806005231-9llmnk4", "solution")).toEqual([
      "20260806005231-c4lr18w",
      "20260806005231-1gxlpdc",
    ]);
  });
});

import { describe, expect, it } from "vitest";
import { sourceEmbedBlockIds, sourceEmbedSql, type SourceEmbedBlockRow } from "./source-embed-query";

const rows: SourceEmbedBlockRow[] = [
  { id: "20260806000000-doc0001", sort: 0, type: "d" },
  { id: "20260806000001-q000001", parent_id: "20260806000000-doc0001", sort: 1, ial: '{: custom-qb-id="q1"}' },
  { id: "20260806000002-body001", parent_id: "20260806000001-q000001", sort: 1, type: "l" },
  { id: "20260806000003-stem001", parent_id: "20260806000002-body001", sort: 1, type: "i", content: "题目正文" },
  { id: "20260806000004-opt0001", parent_id: "20260806000002-body001", sort: 2, type: "l", content: "A. 选项一 B. 选项二" },
  { id: "20260806000005-sol0001", parent_id: "20260806000001-q000001", sort: 2, type: "l", ial: '{: custom-qb-section="solution"}', content: "正确答案：B" },
  { id: "20260806000006-expl001", parent_id: "20260806000005-sol0001", sort: 1, type: "i", content: "解析正文" },
  { id: "20260806000007-q000002", parent_id: "20260806000000-doc0001", sort: 2, ial: '{: custom-qb-id="q2"}' },
  { id: "20260806000008-next001", parent_id: "20260806000007-q000002", sort: 1, content: "下一题" },
];

describe("source embed query", () => {
  it("keeps stem text and solution subtree while excluding option blocks", () => {
    expect(sourceEmbedBlockIds(rows, "20260806000001-q000001")).toEqual([
      "20260806000003-stem001",
      "20260806000005-sol0001",
    ]);
  });

  it("preserves the selected block order in SQL", () => {
    expect(sourceEmbedSql(rows, "20260806000001-q000001")).toContain(
      "WHERE id IN ('20260806000003-stem001', '20260806000005-sol0001')",
    );
    expect(sourceEmbedSql(rows, "20260806000001-q000001")).toContain(
      "ORDER BY CASE id WHEN '20260806000003-stem001' THEN 0 WHEN '20260806000005-sol0001' THEN 1",
    );
  });

  it("matches the real SiYuan question 147 hierarchy", () => {
    const realRows: SourceEmbedBlockRow[] = [
      { id: "20260806005231-ea6k94x", parent_id: "20260806005231-nib2w11", sort: 5, type: "h", content: "147.", ial: '{: custom-qb-id="civil-procedure-gold-2017-3-42"}' },
      { id: "20260806005231-okhnuz8", parent_id: "20260806005231-ea6k94x", sort: 20, order: 0, type: "l", content: "题干 A. 予以受理 B. 不予受理 C. 驳回起诉 D. 再审" },
      { id: "20260806005231-0rghlyg", parent_id: "20260806005231-okhnuz8", sort: 20, order: 1, type: "i", content: "题干 A. 予以受理 B. 不予受理 C. 驳回起诉 D. 再审" },
      { id: "20260806005231-t3gs4nz", parent_id: "20260806005231-0rghlyg", sort: 10, order: 2, type: "p", content: "家具买卖合同题干" },
      { id: "20260806005231-0ywtg9a", parent_id: "20260806005231-0rghlyg", sort: 20, order: 3, type: "l", content: "A. 予以受理 B. 裁定不予受理 C. 裁定驳回起诉 D. 按再审处理" },
      { id: "20260806005231-2fzockj", parent_id: "20260806005231-ea6k94x", sort: 20, order: 4, type: "l", content: "正确答案：B。", ial: '{: custom-qb-section="solution"}' },
      { id: "20260806005231-wz7as4n", parent_id: "20260806005231-2fzockj", sort: 10, order: 5, type: "i", content: "正确答案：B。" },
      { id: "20260806005231-puupbai", parent_id: "20260806005231-ea6k94x", sort: 20, order: 6, type: "l", content: "完整解析" },
      { id: "20260806005231-h5phz46", parent_id: "20260806005231-puupbai", sort: 10, order: 7, type: "i", content: "解析一" },
      { id: "20260806005231-h13i5dy", parent_id: "20260806005231-puupbai", sort: 20, order: 8, type: "i", content: "A. 解析中的选项论证" },
      { id: "20260806005231-4asq9db", parent_id: "20260806005231-nib2w11", sort: 5, type: "h", content: "148.", ial: '{: custom-qb-id="civil-procedure-gold-2019-2-4-13"}' },
    ];
    const ids = sourceEmbedBlockIds(realRows, "20260806005231-ea6k94x");
    expect(ids).toEqual([
      "20260806005231-t3gs4nz",
      "20260806005231-2fzockj",
      "20260806005231-puupbai",
    ]);
    expect(ids).not.toContain("20260806005231-0ywtg9a");
    expect(ids).not.toContain("20260806005231-4asq9db");
  });
});

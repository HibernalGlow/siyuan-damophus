import { toString } from "mdast-util-to-string";
import type { MarkdownBlock } from "./types";
import { isHeading } from "./parse-blocks";

export function isLikelySolutionStart(block: MarkdownBlock): boolean {
  const text = toString(block.node).trim();
  return /^(?:综合考向|答案(?:与解析)?|参考答案|正确答案|解析|参考解析|评分要点)\s*(?:[:：]|为|是|$)/iu.test(text);
}

/**
 * SiYuan commonly stores the solution marker on the first child below an
 * answer heading. Keep that heading in the solution instead of leaking it
 * into the stem markdown.
 */
export function solutionBoundaryIndex(
  blocks: readonly MarkdownBlock[],
  explicitIndex: number,
): number {
  let boundary = explicitIndex;
  for (let index = explicitIndex - 1; index >= 0; index -= 1) {
    if (!isHeading(blocks[index].node) || !isLikelySolutionStart(blocks[index])) break;
    boundary = index;
  }
  return boundary;
}

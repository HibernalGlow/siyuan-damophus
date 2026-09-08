import { toString } from "mdast-util-to-string";
import type { List, RootContent } from "mdast";
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

export interface NestedSolutionSplit {
  stemNode: RootContent;
  solution: RootContent[];
}

function nestedSplit(block: MarkdownBlock, answerStartsList: boolean): NestedSolutionSplit | undefined {
  if (block.node.type !== "list") return undefined;
  const list = block.node as List;
  const item = list.children[0];
  if (!item || item.children.length < 2) return undefined;
  const index = item.children.findIndex((child) => child.type === "list");
  if (index <= 0) return undefined;
  if (answerStartsList) {
    const first = (item.children[index] as List).children[0];
    if (!first || !isLikelySolutionStart({ node: first, raw: "", attributes: {} })) return undefined;
  }
  return {
    stemNode: {
      ...list,
      children: [{ ...item, children: item.children.slice(0, index) }],
    } as RootContent,
    solution: item.children.slice(index) as RootContent[],
  };
}

/**
 * A case card keeps its stem and its answer inside one top-level list item, because the
 * flashcard front/back boundary is that item's first child list. Split such a marked
 * block so the stem keeps its leading paragraphs and its `> [!SELECTION]` option
 * callout, while the first child list onward becomes the solution.
 */
export function splitNestedSolution(block: MarkdownBlock): NestedSolutionSplit | undefined {
  return nestedSplit(block, false);
}

/**
 * Same split without a marker attribute: a nested `{: …}` line inside a card would break
 * the flashcard boundary, so an answer-shaped first child list is allowed to carry the
 * boundary on its own.
 */
export function inferNestedSolutionSplit(block: MarkdownBlock): NestedSolutionSplit | undefined {
  return nestedSplit(block, true);
}

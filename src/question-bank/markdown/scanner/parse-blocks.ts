import type { Heading, List, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import { parseIal } from "../ial";
import type { ScanMessage } from "../../core/types";
import { siyuanNodeId } from "./markdown";
import { firstParagraph } from "./options";
import type { IalToken, MarkdownBlock } from "./types";

export function rawNode(markdown: string, node: RootContent): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : markdown.slice(start, end);
}

/** A deep-indented `{: …}` line is a block attribute only below a block it can attach to. */
const NESTED_IAL_HOST = /^\s*(?:[-+*]\s|\d+[.)]\s|>|#{1,6}\s|\{:[^}\r\n]*\}\s*$)/u;

/**
 * SiYuan writes a block's own IAL immediately after its marker chain, so a list nested in a
 * callout carries `> - ` before `{: id="…"}` and a list inside a list carries `  - `. Accept
 * the whole chain (up to four levels); a single level would leave the attribute inline in the
 * text, which stops `\- [ ]` from parsing as a task item and silently drops every option.
 */
const INLINE_IAL = /^(?:\s*(?:(?:[-+*]|\d+[.)]|>)\s+){1,4})(\{:[^}\r\n]*\})/u;

export function extractIalLines(markdown: string): { markdown: string; tokens: IalToken[] } {
  const tokens: IalToken[] = [];
  const output: string[] = [];
  const lines = markdown.match(/.*(?:\r\n|\n|$)/g) ?? [];
  let offset = 0;
  let previousContent = "";
  let fence: { marker: string; length: number } | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const content = line.replace(/\r?\n$/u, "");
    const ending = line.slice(content.length);
    const fenceMatch = content.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence) {
      if (fenceMatch
        && fenceMatch[1][0] === fence.marker
        && fenceMatch[1].length >= fence.length
        && content.slice(fenceMatch[0].length).trim() === "") {
        fence = undefined;
      }
      output.push(line);
      offset += line.length;
      continue;
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      output.push(line);
      offset += line.length;
      continue;
    }

    const previousLine = previousContent;
    if (content.trim()) previousContent = content;

    const standaloneIal = content.match(/^\s*(\{:[^}\r\n]*\})\s*$/u);
    const blockIal = !fence
      ? standaloneIal
        ?? content.match(INLINE_IAL)
      : undefined;
    if (blockIal) {
      const ialSource = blockIal[1];
      const parsed = parseIal(ialSource);
      const indent = standaloneIal ? content.indexOf(standaloneIal[1]) : 0;
      const isSiyuanNestedIal = siyuanNodeId.test(parsed?.attributes.id ?? "")
        || indent < 4
        || (standaloneIal !== null && NESTED_IAL_HOST.test(previousLine));
      if (parsed && isSiyuanNestedIal) {
        const ialOffset = content.indexOf(ialSource);
        tokens.push({
          offset: offset + ialOffset,
          line: lineIndex + 1,
          attributes: parsed.attributes,
          errors: parsed.errors,
        });
        const prefix = content.slice(0, ialOffset);
        const suffix = content.slice(ialOffset + ialSource.length);
        // Keep the line's own prefix (`> `, list markers, indentation) when blanking a
        // standalone IAL: a spaces-only line is blank to CommonMark and would terminate the
        // enclosing blockquote, splitting one option callout into one blockquote per option.
        output.push(
          (suffix.trim() ? prefix + suffix + " ".repeat(ialSource.length)
            : prefix + " ".repeat(ialSource.length)) + ending,
        );
        offset += line.length;
        continue;
      }
    }
    output.push(line);
    offset += line.length;
  }
  return { markdown: output.join(""), tokens };
}

function looksLikeTopLevelOptionList(list: List): boolean {
  if (list.children.length < 2) return false;
  return list.children.every((item) => {
    const paragraph = firstParagraph(item);
    if (!paragraph) return false;
    const text = toString(paragraph).trim();
    return /^([A-Za-z0-9]+)[.、:：)]\s*.+/su.test(text)
      || ["正确", "错误", "对", "错", "true", "false"].includes(text.toLowerCase());
  });
}

export function splitRootBlocks(root: Root): RootContent[] {
  const blocks: RootContent[] = [];
  for (const node of root.children) {
    if (node.type !== "list" || looksLikeTopLevelOptionList(node)) {
      blocks.push(node);
      continue;
    }
    for (const item of node.children) {
      blocks.push({
        ...node,
        children: [item],
        position: item.position,
      });
    }
  }
  return blocks;
}

export function makeBlocks(
  markdown: string,
  root: Root,
  ialTokens: readonly IalToken[],
  issues: ScanMessage[],
): MarkdownBlock[] {
  const blocks = splitRootBlocks(root).map((node): MarkdownBlock => ({
      node,
      raw: rawNode(markdown, node),
      attributes: {},
      line: node.position?.start.line,
  }));
  for (const token of ialTokens) {
    if (token.attributes.type === "doc") continue;
    if (token.errors.length > 0) {
      issues.push({
        code: "invalid-ial",
        message: token.errors.join("; "),
        line: token.line,
      });
    }
    const containing = blocks.find((block) => {
      const start = block.node.position?.start.offset;
      const end = block.node.position?.end.offset;
      return start !== undefined && end !== undefined && start <= token.offset && token.offset <= end;
    });
    const target = containing ?? [...blocks]
      .reverse()
      .find((block) => (block.node.position?.end.offset ?? Number.POSITIVE_INFINITY) <= token.offset);
    if (!target) {
      issues.push({ code: "orphan-ial", message: "IAL has no preceding Markdown block", line: token.line });
      continue;
    }
    Object.assign(target.attributes, token.attributes);
  }
  return blocks;
}

export function isHeading(node: RootContent): node is Heading {
  return node.type === "heading";
}

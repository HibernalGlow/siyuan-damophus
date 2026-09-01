import type { List, ListItem, Paragraph, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import type { QuestionType } from "../../core/types";
import { markdownWriter } from "./markdown";
import type { MarkdownBlock, ParsedOption } from "./types";

export function firstParagraph(item: ListItem): Paragraph | undefined {
  return item.children.find((child): child is Paragraph => child.type === "paragraph");
}

export function parseOptionParagraph(paragraph: Paragraph, type: QuestionType): ParsedOption | undefined {
  const visible = toString(paragraph).trim();
  const labelled = visible.match(/^([A-Za-z0-9]+)[.、:：)]\s*(.+)$/su);
  if (labelled) {
    const markdown = String(markdownWriter.stringify({
      type: "root",
      children: [paragraph],
    })).trim().replace(/^([A-Za-z0-9]+)[.、:：)]\s*/u, "");
    return { id: labelled[1].toUpperCase(), markdown };
  }
  if (type === "true-false") {
    const normalized = visible.toLowerCase();
    if (["正确", "对", "true"].includes(normalized)) return { id: "true", markdown: visible };
    if (["错误", "错", "false"].includes(normalized)) return { id: "false", markdown: visible };
  }
  return undefined;
}

function parseOptionItem(item: ListItem, type: QuestionType): ParsedOption | undefined {
  const paragraph = firstParagraph(item);
  return paragraph ? parseOptionParagraph(paragraph, type) : undefined;
}

export function optionList(list: List, type: QuestionType): ParsedOption[] | undefined {
  const parsed = list.children.map((item) => parseOptionItem(item, type));
  if (parsed.length < 2 || parsed.some((option) => option === undefined)) return undefined;
  return parsed as ParsedOption[];
}

export function explicitOption(block: MarkdownBlock): ParsedOption | undefined {
  const id = block.attributes["custom-qb-option"]?.trim().toUpperCase();
  if (!id || !/^[A-Z0-9]+$/u.test(id)) return undefined;
  if (block.node.type === "list") {
    const paragraph = block.node.children[0] && firstParagraph(block.node.children[0]);
    if (paragraph) return { id, markdown: stringifyNodes([paragraph]) };
  }
  return { id, markdown: stringifyNodes([block.node]) };
}

export function childNodes(node: unknown): RootContent[] {
  if (!node || typeof node !== "object" || !("children" in node)) return [];
  const children = (node as { children?: unknown }).children;
  return Array.isArray(children) ? children as RootContent[] : [];
}

export function collectOptions(nodes: readonly RootContent[], type: QuestionType): ParsedOption[] {
  const options: ParsedOption[] = [];
  const visit = (node: RootContent): void => {
    if (node.type === "list") {
      const parsed = optionList(node, type);
      if (parsed) {
        options.push(...parsed);
        return;
      }
    }
    for (const child of childNodes(node)) visit(child);
  };
  for (const node of nodes) visit(node);
  return options;
}

export function stripOptionLists(node: RootContent, type: QuestionType): RootContent | null {
  if (node.type === "list" && optionList(node, type)) return null;
  const cloned = { ...node } as RootContent & { children?: RootContent[] };
  if ("children" in node && Array.isArray(node.children)) {
    cloned.children = (node.children as RootContent[])
      .map((child) => stripOptionLists(child, type))
      .filter((child): child is RootContent => child !== null);
  }
  return cloned;
}

export function stringifyNodes(nodes: readonly RootContent[]): string {
  if (nodes.length === 0) return "";
  return String(markdownWriter.stringify({ type: "root", children: [...nodes] })).trim();
}

import type { Heading, List, ListItem, Paragraph, Root, RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import { normalizeOptionIds } from "../core/answer";
import { QuestionSchema } from "../core/schema";
import type {
  ObjectiveAnswer,
  Question,
  QuestionGroup,
  QuestionMetadata,
  QuestionScanReport,
  QuestionType,
  ScanMessage,
  TopicNode,
} from "../core/types";
import { parseIal, type IalAttributes } from "./ial";

interface MarkdownBlock {
  node: RootContent;
  raw: string;
  attributes: IalAttributes;
  line?: number;
}

interface IalToken {
  offset: number;
  line: number;
  attributes: IalAttributes;
  errors: string[];
}

interface TopicState {
  node: TopicNode;
  attributes: IalAttributes;
  metadata: Omit<QuestionMetadata, "topicPath" | "topicId" | "parentId">;
}

interface QuestionCandidate {
  blockIndex: number;
  heading: Heading;
  attributes: IalAttributes;
  topics: TopicState[];
}

interface ParsedOption {
  id: string;
  markdown: string;
}

const markdownParser = unified().use(remarkParse).use(remarkGfm);
const markdownWriter = unified().use(remarkParse).use(remarkGfm).use(remarkStringify);
const siyuanNodeId = /^\d{14}-[a-z0-9]{7}$/u;
const questionTypes: readonly QuestionType[] = [
  "single",
  "multiple",
  "true-false",
  "subjective",
  "group",
];

function rawNode(markdown: string, node: RootContent): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  return start === undefined || end === undefined ? "" : markdown.slice(start, end);
}

function extractIalLines(markdown: string): { markdown: string; tokens: IalToken[] } {
  const tokens: IalToken[] = [];
  const output: string[] = [];
  const lines = markdown.match(/.*(?:\r\n|\n|$)/g) ?? [];
  let offset = 0;
  let fence: { marker: string; length: number } | undefined;

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    if (!line) continue;
    const content = line.replace(/\r?\n$/u, "");
    const ending = line.slice(content.length);
    const fenceMatch = content.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!fence) fence = { marker, length: fenceMatch[1].length };
      else if (fence.marker === marker && fenceMatch[1].length >= fence.length) fence = undefined;
      output.push(line);
      offset += line.length;
      continue;
    }

    const standaloneIal = content.match(/^\s*(\{:[^}\r\n]*\})\s*$/u);
    const blockIal = !fence
      ? standaloneIal
        ?? content.match(/^(?:\s{0,3}(?:(?:[-+*]|\d+[.)]|>)\s+))?(\{:[^}\r\n]*\})/u)
      : undefined;
    if (blockIal) {
      const ialSource = blockIal[1];
      const parsed = parseIal(ialSource);
      const standaloneIndent = standaloneIal ? content.indexOf(ialSource) : 0;
      const isSiyuanNestedIal = standaloneIndent < 4
        || siyuanNodeId.test(parsed?.attributes.id ?? "");
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
        output.push(
          (suffix.trim() ? prefix + suffix + " ".repeat(ialSource.length) : " ".repeat(content.length))
          + ending,
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

function splitRootBlocks(root: Root): RootContent[] {
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

function makeBlocks(
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

function isHeading(node: RootContent): node is Heading {
  return node.type === "heading";
}

function inheritedMetadata(attributes: IalAttributes): TopicState["metadata"] {
  return {
    year: attributes["custom-qb-year"],
    subject: attributes["custom-qb-subject"],
    category: attributes["custom-qb-category"],
    collection: attributes["custom-qb-collection"],
    source: attributes["custom-qb-source"],
  };
}

function mergeDefined<T extends object>(base: T, patch: Partial<T>): T {
  const result = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) Object.assign(result, { [key]: value });
  }
  return result;
}

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function inferredTopicId(path: readonly string[]): string {
  return `inferred-${stableHash(path.join("\u001f"))}`;
}

function inferQuestionType(title: string, body: string): QuestionType | undefined {
  const sample = `${title}\n${body}`;
  if (/(?:题组|材料题|共用题干)/u.test(sample)) return "group";
  if (/(?:主观题|简答题|论述题)/u.test(sample)) return "subjective";
  if (/(?:判断题|正确还是错误|对还是错)/u.test(sample)) return "true-false";
  if (/(?:多选|多项选择|[（(]多[）)])/u.test(sample)) return "multiple";
  if (/(?:单选|单项选择|[（(]单[）)])/u.test(sample)) return "single";
  return undefined;
}

function parseChoiceIds(value: string): string[] | undefined {
  const compact = value.trim().toUpperCase();
  if (!compact) return undefined;
  const ids = /[,，、\s]/u.test(compact)
    ? compact.split(/[,，、\s]+/u)
    : /^[A-Z]+$/u.test(compact)
      ? [...compact]
      : [compact];
  const normalized = normalizeOptionIds(ids);
  return normalized.length > 0 ? normalized : undefined;
}

function parseAnswer(value: string | undefined, type: QuestionType): ObjectiveAnswer | undefined {
  if (!value) return undefined;
  if (type === "true-false") {
    const normalized = value.trim().toLowerCase();
    if (["true", "正确", "对"].includes(normalized)) return { kind: "boolean", value: true };
    if (["false", "错误", "错"].includes(normalized)) return { kind: "boolean", value: false };
    return undefined;
  }
  if (type === "single" || type === "multiple") {
    const optionIds = parseChoiceIds(value);
    return optionIds ? { kind: "options", optionIds } : undefined;
  }
  return undefined;
}

function visibleAnswer(solution: string, type: QuestionType): ObjectiveAnswer | undefined {
  if (type === "true-false") {
    const match = solution.match(/(?:正确)?答案\s*(?:为|是|[:：])\s*(正确|错误|对|错|true|false)/iu);
    return parseAnswer(match?.[1], type);
  }
  if (type === "single" || type === "multiple") {
    const match = solution.match(/(?:正确)?答案\s*(?:为|是|[:：])\s*([A-H](?:[\s,，、]*[A-H])*)/iu);
    return parseAnswer(match?.[1], type);
  }
  return undefined;
}

function isLikelySolutionStart(block: MarkdownBlock): boolean {
  const text = toString(block.node).trim();
  return /^(?:综合考向|答案(?:与解析)?|参考答案|正确答案|解析|参考解析|评分要点)\s*(?:[:：]|为|是|$)/iu.test(text);
}

function answersEqual(left: ObjectiveAnswer, right: ObjectiveAnswer): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "boolean" && right.kind === "boolean") return left.value === right.value;
  if (left.kind === "options" && right.kind === "options") {
    const leftIds = normalizeOptionIds(left.optionIds);
    const rightIds = normalizeOptionIds(right.optionIds);
    return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
  }
  return false;
}

function firstParagraph(item: ListItem): Paragraph | undefined {
  return item.children.find((child): child is Paragraph => child.type === "paragraph");
}

function parseOptionItem(item: ListItem, type: QuestionType): ParsedOption | undefined {
  const paragraph = firstParagraph(item);
  if (!paragraph) return undefined;
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

function optionList(list: List, type: QuestionType): ParsedOption[] | undefined {
  const parsed = list.children.map((item) => parseOptionItem(item, type));
  if (parsed.length < 2 || parsed.some((option) => option === undefined)) return undefined;
  return parsed as ParsedOption[];
}

function childNodes(node: unknown): RootContent[] {
  if (!node || typeof node !== "object" || !("children" in node)) return [];
  const children = (node as { children?: unknown }).children;
  return Array.isArray(children) ? children as RootContent[] : [];
}

function collectOptions(nodes: readonly RootContent[], type: QuestionType): ParsedOption[] {
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

function stripOptionLists(node: RootContent, type: QuestionType): RootContent | null {
  if (node.type === "list" && optionList(node, type)) return null;
  const cloned = { ...node } as RootContent & { children?: RootContent[] };
  if ("children" in node && Array.isArray(node.children)) {
    cloned.children = (node.children as RootContent[])
      .map((child) => stripOptionLists(child, type))
      .filter((child): child is RootContent => child !== null);
  }
  return cloned;
}

function stringifyNodes(nodes: readonly RootContent[]): string {
  if (nodes.length === 0) return "";
  return String(markdownWriter.stringify({ type: "root", children: [...nodes] })).trim();
}

function metadataForQuestion(topics: readonly TopicState[], attributes: IalAttributes): QuestionMetadata {
  const inherited = topics.reduce<TopicState["metadata"]>(
    (metadata, topic) => mergeDefined(metadata, topic.metadata),
    {},
  );
  const own = inheritedMetadata(attributes);
  const closestTopic = topics.at(-1);
  return {
    ...mergeDefined(inherited, own),
    topicId: closestTopic?.node.id,
    topicPath: topics.map((topic) => topic.node.title),
    parentId: attributes["custom-qb-parent-id"],
  };
}

function buildQuestion(
  candidate: QuestionCandidate,
  blocks: readonly MarkdownBlock[],
  endIndex: number,
  report: Pick<QuestionScanReport, "inferences" | "conflicts" | "issues">,
): Question | undefined {
  const id = candidate.attributes["custom-qb-id"];
  const title = toString(candidate.heading).trim();
  const bodyBlocks = blocks.slice(candidate.blockIndex + 1, endIndex);
  const bodyText = bodyBlocks.map((block) => block.raw).join("\n\n");
  const explicitType = candidate.attributes["custom-qb-type"];
  let type = questionTypes.includes(explicitType as QuestionType)
    ? explicitType as QuestionType
    : undefined;
  if (!type) {
    type = inferQuestionType(title, bodyText);
    if (type) {
      report.inferences.push({
        code: "inferred-question-type",
        message: `Inferred question type '${type}' from visible text`,
        questionId: id,
        line: candidate.heading.position?.start.line,
      });
    } else {
      report.issues.push({
        code: "missing-question-type",
        message: "Question has no valid custom-qb-type",
        questionId: id,
        line: candidate.heading.position?.start.line,
      });
      return undefined;
    }
  }

  const solutionIndexes = bodyBlocks
    .map((block, index) => block.attributes["custom-qb-section"] === "solution" ? index : -1)
    .filter((index) => index >= 0);
  if (solutionIndexes.length > 1) {
    report.conflicts.push({
      code: "multiple-solution-boundaries",
      message: "Question contains more than one solution boundary",
      questionId: id,
      line: candidate.heading.position?.start.line,
    });
    return undefined;
  }
  let solutionIndex = solutionIndexes[0];
  if (solutionIndex === undefined && type !== "group") {
    solutionIndex = bodyBlocks.findIndex(isLikelySolutionStart);
    if (solutionIndex >= 0) {
      report.inferences.push({
        code: "inferred-solution-boundary",
        message: "Inferred the solution boundary from a visible answer or explanation label",
        questionId: id,
        line: bodyBlocks[solutionIndex].line,
      });
    } else {
      report.issues.push({
        code: "missing-solution-boundary",
        message: "Question has no explicit or safely inferred solution boundary",
        questionId: id,
        line: candidate.heading.position?.start.line,
      });
      return undefined;
    }
  }
  solutionIndex ??= bodyBlocks.length;
  const stemNodes = bodyBlocks.slice(0, solutionIndex).map((block) => block.node);
  const solutionNodes = bodyBlocks.slice(solutionIndex).map((block) => block.node);
  const options = collectOptions(stemNodes, type);
  const cleanedStemNodes = stemNodes
    .map((node) => stripOptionLists(node, type))
    .filter((node): node is RootContent => node !== null);
  const solutionMarkdown = stringifyNodes(solutionNodes);

  const explicitAnswerValue = candidate.attributes["custom-qb-answer"];
  const explicitAnswer = parseAnswer(explicitAnswerValue, type);
  if (explicitAnswerValue && !explicitAnswer) {
    report.issues.push({
      code: "invalid-machine-answer",
      message: `Invalid custom-qb-answer for question type '${type}'`,
      questionId: id,
      line: candidate.heading.position?.start.line,
    });
  }
  const inferredAnswer = visibleAnswer(solutionMarkdown, type);
  if (explicitAnswer && inferredAnswer && !answersEqual(explicitAnswer, inferredAnswer)) {
    report.conflicts.push({
      code: "answer-conflict",
      message: "custom-qb-answer conflicts with the visible solution answer",
      questionId: id,
      line: candidate.heading.position?.start.line,
    });
    return undefined;
  }
  const answer = explicitAnswer ?? inferredAnswer;
  if (!explicitAnswer && inferredAnswer) {
    report.inferences.push({
      code: "inferred-machine-answer",
      message: "Inferred machine answer from the visible solution",
      questionId: id,
      line: candidate.heading.position?.start.line,
    });
  }

  const parsed = QuestionSchema.safeParse({
    id,
    type,
    title,
    stemMarkdown: stringifyNodes(cleanedStemNodes),
    options,
    answer,
    solutionMarkdown,
    metadata: metadataForQuestion(candidate.topics, candidate.attributes),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report.issues.push({
        code: "invalid-question",
        message: issue.message,
        questionId: id,
        line: candidate.heading.position?.start.line,
      });
    }
    return undefined;
  }
  return parsed.data as Question;
}

export function scanQuestionMarkdown(markdown: string): QuestionScanReport {
  const report: QuestionScanReport = {
    document: { questions: [], groups: [], topics: [] },
    inferences: [],
    conflicts: [],
    issues: [],
  };
  const extracted = extractIalLines(markdown);
  const root = markdownParser.parse(extracted.markdown) as Root;
  const blocks = makeBlocks(extracted.markdown, root, extracted.tokens, report.issues);
  const topics: TopicState[] = [];
  const topicIds = new Set<string>();
  const questionCandidates: QuestionCandidate[] = [];
  let activeQuestionDepth: number | undefined;

  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex += 1) {
    const block = blocks[blockIndex];
    if (!isHeading(block.node)) continue;
    const questionId = block.attributes["custom-qb-id"];
    if (questionId) {
      questionCandidates.push({
        blockIndex,
        heading: block.node,
        attributes: block.attributes,
        topics: [...topics],
      });
      activeQuestionDepth = block.node.depth;
      continue;
    }
    if (activeQuestionDepth !== undefined && block.node.depth > activeQuestionDepth) continue;
    activeQuestionDepth = undefined;

    const headingTitle = toString(block.node).trim();
    if (/^(?:\d+[.、]|第.{1,12}题)/u.test(headingTitle)) {
      report.issues.push({
        code: "missing-stable-question-id",
        message: "Question-like heading has no custom-qb-id and was not indexed",
        line: block.line,
      });
      activeQuestionDepth = block.node.depth;
      continue;
    }

    while (topics.at(-1) && topics.at(-1)!.node.level >= block.node.depth) topics.pop();
    const title = headingTitle;
    const explicit = block.attributes["custom-qb-role"] === "topic";
    const path = [...topics.map((topic) => topic.node.title), title];
    const explicitId = block.attributes["custom-qb-topic-id"];
    const id = explicitId || inferredTopicId(path);
    if (explicit && !explicitId) {
      report.issues.push({
        code: "missing-topic-id",
        message: "Explicit topic has no custom-qb-topic-id",
        line: block.line,
      });
    }
    if (topicIds.has(id)) {
      report.conflicts.push({
        code: "duplicate-topic-id",
        message: `Duplicate topic ID: ${id}`,
        line: block.line,
      });
      continue;
    }
    topicIds.add(id);
    const parent = topics.at(-1);
    const node: TopicNode = {
      id,
      title,
      level: block.node.depth,
      parentId: parent?.node.id,
      childIds: [],
      explicit: Boolean(explicitId),
    };
    parent?.node.childIds.push(id);
    const state: TopicState = {
      node,
      attributes: block.attributes,
      metadata: inheritedMetadata(block.attributes),
    };
    topics.push(state);
    report.document.topics.push(node);
    if (!explicitId) {
      report.inferences.push({
        code: "inferred-topic",
        message: `Inferred topic scope '${title}' from the heading tree`,
        line: block.line,
      });
    }
  }

  const questionIds = new Set<string>();
  for (let index = 0; index < questionCandidates.length; index += 1) {
    const candidate = questionCandidates[index];
    const id = candidate.attributes["custom-qb-id"];
    if (questionIds.has(id)) {
      report.conflicts.push({
        code: "duplicate-question-id",
        message: `Duplicate question ID: ${id}`,
        questionId: id,
        line: candidate.heading.position?.start.line,
      });
      continue;
    }
    questionIds.add(id);
    let endIndex = questionCandidates[index + 1]?.blockIndex ?? blocks.length;
    for (let blockIndex = candidate.blockIndex + 1; blockIndex < endIndex; blockIndex += 1) {
      const block = blocks[blockIndex];
      if (isHeading(block.node)
        && !block.attributes["custom-qb-id"]
        && block.node.depth <= candidate.heading.depth) {
        endIndex = blockIndex;
        break;
      }
    }
    const question = buildQuestion(candidate, blocks, endIndex, report);
    if (question) report.document.questions.push(question);
  }

  const groups = report.document.questions.filter((question) => question.type === "group");
  for (const group of groups) {
    const questionIdsForGroup = report.document.questions
      .filter((question) => question.metadata.parentId === group.id)
      .map((question) => question.id);
    const value: QuestionGroup = {
      id: group.id,
      materialMarkdown: group.stemMarkdown,
      questionIds: questionIdsForGroup,
    };
    report.document.groups.push(value);
  }
  for (const question of report.document.questions) {
    const parentId = question.metadata.parentId;
    if (parentId && !groups.some((group) => group.id === parentId)) {
      report.conflicts.push({
        code: "missing-question-group",
        message: `Parent question group does not exist: ${parentId}`,
        questionId: question.id,
      });
    }
  }

  return report;
}

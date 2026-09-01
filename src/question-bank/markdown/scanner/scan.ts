import type { Root } from "mdast";
import { toString } from "mdast-util-to-string";
import type { QuestionGroup, TopicNode } from "../../core/types";
import { stableTopicIdPattern } from "./markdown";
import { inferredTopicId, inheritedMetadata } from "./metadata";
import { extractIalLines, isHeading, makeBlocks } from "./parse-blocks";
import { markdownParser } from "./markdown";
import { buildQuestion } from "./build-question";
import type {
  MarkdownQuestionScanReport,
  QuestionCandidate,
  TopicState,
} from "./types";

export function scanQuestionMarkdown(markdown: string): MarkdownQuestionScanReport {
  const report: MarkdownQuestionScanReport = {
    document: { questions: [], groups: [], topics: [] },
    inferences: [],
    conflicts: [],
    issues: [],
    ialUpdates: [],
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
    const noteTopicAnchor = block.node.type === "paragraph"
      && block.attributes["custom-qb-note-topic-id"] !== undefined
      && /^考点[：:]\s*\S/u.test(toString(block.node).trim());
    if (!isHeading(block.node) && !noteTopicAnchor) continue;
    const questionId = block.attributes["custom-qb-id"];
    if (questionId && isHeading(block.node)) {
      questionCandidates.push({
        blockIndex,
        heading: block.node,
        attributes: block.attributes,
        topics: [...topics],
      });
      activeQuestionDepth = block.node.depth;
      continue;
    }
    const blockDepth = isHeading(block.node) ? block.node.depth : 6;
    if (activeQuestionDepth !== undefined && blockDepth > activeQuestionDepth) continue;
    activeQuestionDepth = undefined;

    const headingTitle = toString(block.node).trim();
    const looksLikeQuestionHeading = isHeading(block.node) && blockDepth >= 4
      && /^(?:\d+[.、]|第.{1,12}题)/u.test(headingTitle);
    if (looksLikeQuestionHeading) {
      report.issues.push({
        code: "missing-stable-question-id",
        message: "Question-like heading has no custom-qb-id and was not indexed",
        line: block.line,
        title: headingTitle,
        sourceMarkdown: block.raw,
      });
      activeQuestionDepth = blockDepth;
      continue;
    }

    while (topics.at(-1) && topics.at(-1)!.node.level >= blockDepth) topics.pop();
    const title = headingTitle;
    const modernId = block.attributes["custom-qb-note-topic-id"];
    const legacyId = block.attributes["custom-qb-topic-id"];
    const legacyTopic = legacyId !== undefined || block.attributes["custom-qb-role"] === "topic";
    const path = [...topics.map((topic) => topic.node.title), title];
    if (modernId && legacyId && modernId !== legacyId) {
      report.conflicts.push({
        code: "conflicting-note-topic-attributes",
        message: "New and legacy note-topic attributes contain different IDs",
        line: block.line,
        title: headingTitle,
        sourceMarkdown: block.raw,
      });
      continue;
    }
    const explicitId = modernId ?? legacyId;
    if (explicitId && !stableTopicIdPattern.test(explicitId)) {
      report.conflicts.push({
        code: "invalid-topic-id",
        message: `Topic ID must use lowercase ASCII kebab-case: ${explicitId}`,
        line: block.line,
        title: headingTitle,
        sourceMarkdown: block.raw,
      });
      continue;
    }
    const id = explicitId || inferredTopicId(path, block.line);
    if (block.attributes["custom-qb-role"] === "topic" && !explicitId) {
      report.issues.push({
        code: "missing-topic-id",
        message: "Explicit legacy topic has no stable topic ID",
        line: block.line,
        title: headingTitle,
        sourceMarkdown: block.raw,
      });
    }
    if (legacyTopic) {
      report.issues.push({
        code: "legacy-note-topic-attribute",
        message: "Migrate custom-qb-role/custom-qb-topic-id to custom-qb-note-topic-id",
        line: block.line,
        title: headingTitle,
        sourceMarkdown: block.raw,
      });
    }
    if (topicIds.has(id)) {
      report.conflicts.push({
        code: "duplicate-topic-id",
        message: `Duplicate topic ID: ${id}`,
        line: block.line,
        title: headingTitle,
        sourceMarkdown: block.raw,
      });
      continue;
    }
    topicIds.add(id);
    const parent = topics.at(-1);
    const node: TopicNode = {
      id,
      title,
      level: blockDepth,
      sourceLine: block.line,
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
        title,
        sourceMarkdown: block.raw,
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
        title: toString(candidate.heading).trim(),
        sourceMarkdown: blocks[candidate.blockIndex].raw,
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

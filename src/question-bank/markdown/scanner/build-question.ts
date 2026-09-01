import type { RootContent } from "mdast";
import { toString } from "mdast-util-to-string";
import { QuestionSchema } from "../../core/schema";
import type { Question, QuestionType } from "../../core/types";
import type { IalAttributes } from "../ial";
import {
  answersEqual,
  inferQuestionType,
  parseAnswer,
  serializeAnswer,
  visibleAnswer,
} from "./answers";
import { questionTypes } from "./markdown";
import { metadataForQuestion, portableTopicIds } from "./metadata";
import {
  collectOptions,
  explicitOption,
  parseOptionParagraph,
  stringifyNodes,
  stripOptionLists,
} from "./options";
import { isLikelySolutionStart, solutionBoundaryIndex } from "./solution";
import type {
  MarkdownBlock,
  MarkdownIalUpdate,
  MarkdownQuestionScanReport,
  ParsedOption,
  QuestionCandidate,
} from "./types";

export function addIalUpdate(
  report: Pick<MarkdownQuestionScanReport, "ialUpdates">,
  block: MarkdownBlock,
  questionId: string,
  attributes: IalAttributes,
  reason: MarkdownIalUpdate["reason"],
): void {
  report.ialUpdates.push({
    blockId: block.attributes.id,
    line: block.line,
    questionId,
    attributes,
    reason,
  });
}

export function buildQuestion(
  candidate: QuestionCandidate,
  blocks: readonly MarkdownBlock[],
  endIndex: number,
  report: Pick<MarkdownQuestionScanReport, "inferences" | "conflicts" | "issues" | "ialUpdates">,
): Question | undefined {
  const id = candidate.attributes["custom-qb-id"];
  const title = toString(candidate.heading).trim();
  const headingBlock = blocks[candidate.blockIndex];
  const headingContext = { title, sourceMarkdown: headingBlock.raw };
  const bodyBlocks = blocks.slice(candidate.blockIndex + 1, endIndex);
  const bodyText = bodyBlocks.map((block) => block.raw).join("\n\n");
  const explicitType = candidate.attributes["custom-qb-type"];
  const answerAttribute = candidate.attributes["custom-qb-answer"];
  if (explicitType !== undefined && !questionTypes.includes(explicitType as QuestionType)) {
    report.issues.push({
      code: "invalid-question-type",
      message: `Invalid custom-qb-type '${explicitType}'`,
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
    });
    return undefined;
  }
  let type = explicitType as QuestionType | undefined;
  if (!type) {
    type = inferQuestionType(title, bodyText, answerAttribute);
    if (type) {
      report.inferences.push({
        code: "inferred-question-type",
        message: `Inferred question type '${type}' from visible text`,
        questionId: id,
        line: candidate.heading.position?.start.line,
        ...headingContext,
      });
      addIalUpdate(
        report,
        blocks[candidate.blockIndex],
        id,
        { "custom-qb-type": type },
        "inferred-question-type",
      );
    } else {
      report.issues.push({
        code: "missing-question-type",
        message: "Question has no valid custom-qb-type",
        questionId: id,
        line: candidate.heading.position?.start.line,
        ...headingContext,
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
      ...headingContext,
    });
    return undefined;
  }
  let solutionIndex = solutionIndexes[0] === undefined
    ? undefined
    : solutionBoundaryIndex(bodyBlocks, solutionIndexes[0]);
  if (solutionIndex === undefined && type !== "group") {
    solutionIndex = bodyBlocks.findIndex(isLikelySolutionStart);
    if (solutionIndex >= 0) {
      report.inferences.push({
        code: "inferred-solution-boundary",
        message: "Inferred the solution boundary from a visible answer or explanation label",
        questionId: id,
        line: bodyBlocks[solutionIndex].line,
        title,
        sourceMarkdown: bodyBlocks[solutionIndex].raw,
      });
      addIalUpdate(
        report,
        bodyBlocks[solutionIndex],
        id,
        { "custom-qb-section": "solution" },
        "inferred-solution-boundary",
      );
    } else {
      report.issues.push({
        code: "missing-solution-boundary",
        message: "Question has no explicit or safely inferred solution boundary",
        questionId: id,
        line: candidate.heading.position?.start.line,
        ...headingContext,
      });
      return undefined;
    }
  }
  solutionIndex ??= bodyBlocks.length;
  const stemBlocks = bodyBlocks.slice(0, solutionIndex);
  const solutionNodes = bodyBlocks.slice(solutionIndex).map((block) => block.node);
  const explicitOptionResults = stemBlocks.map((block) => ({ block, option: explicitOption(block) }));
  const invalidExplicitOption = explicitOptionResults.find(
    ({ block, option }) => block.attributes["custom-qb-option"] !== undefined && !option,
  );
  if (invalidExplicitOption) {
    report.issues.push({
      code: "invalid-option-id",
      message: "custom-qb-option must use a non-empty ASCII alphanumeric ID",
      questionId: id,
      line: invalidExplicitOption.block.line,
      title,
      sourceMarkdown: invalidExplicitOption.block.raw,
    });
    return undefined;
  }
  const paragraphOptions = new Map<MarkdownBlock, ParsedOption>();
  let paragraphRun: Array<[MarkdownBlock, ParsedOption]> = [];
  const commitParagraphRun = (): void => {
    if (paragraphRun.length >= 2) {
      for (const [block, option] of paragraphRun) paragraphOptions.set(block, option);
    }
    paragraphRun = [];
  };
  for (const block of stemBlocks) {
    const option = !block.attributes["custom-qb-option"] && block.node.type === "paragraph"
      ? parseOptionParagraph(block.node, type)
      : undefined;
    if (option) paragraphRun.push([block, option]);
    else commitParagraphRun();
  }
  commitParagraphRun();
  const options: ParsedOption[] = [];
  for (const result of explicitOptionResults) {
    if (result.option) options.push(result.option);
    else if (paragraphOptions.has(result.block)) options.push(paragraphOptions.get(result.block)!);
    else options.push(...collectOptions([result.block.node], type));
  }
  const cleanedStemNodes = stemBlocks
    .filter((block) => !block.attributes["custom-qb-option"] && !paragraphOptions.has(block))
    .map((block) => stripOptionLists(block.node, type))
    .filter((node): node is RootContent => node !== null);
  const solutionMarkdown = stringifyNodes(solutionNodes);

  const explicitAnswerValue = candidate.attributes["custom-qb-answer"];
  const manuallyCorrected = candidate.attributes["custom-qb-answer-corrected"] === "true";
  const explicitAnswer = parseAnswer(explicitAnswerValue, type, options.map((option) => option.id));
  if (explicitAnswerValue && !explicitAnswer) {
    report.issues.push({
      code: "invalid-machine-answer",
      message: `Invalid custom-qb-answer for question type '${type}'`,
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
    });
    return undefined;
  }
  const inferredAnswer = visibleAnswer(solutionMarkdown, type);
  if (!manuallyCorrected && explicitAnswer && inferredAnswer && !answersEqual(explicitAnswer, inferredAnswer)) {
    report.conflicts.push({
      code: "answer-conflict",
      message: "custom-qb-answer conflicts with the visible solution answer",
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
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
      ...headingContext,
    });
    addIalUpdate(
      report,
      blocks[candidate.blockIndex],
      id,
      { "custom-qb-answer": serializeAnswer(inferredAnswer) },
      "inferred-machine-answer",
    );
  }

  const portableTopics = portableTopicIds(candidate.attributes);
  if (candidate.attributes["custom-qb-note-topic-id"] !== undefined
    || candidate.attributes["custom-qb-topic-id"] !== undefined
    || candidate.attributes["custom-qb-role"] === "topic") {
    report.conflicts.push({
      code: "mixed-topic-direction",
      message: "Question IAL must use custom-qb-question-topic-ids, not custom-qb-note-topic-id",
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
    });
    return undefined;
  }
  if (portableTopics.conflictingSources) {
    report.conflicts.push({
      code: "conflicting-question-topic-attributes",
      message: "New and legacy question-topic attributes contain different IDs",
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
    });
    return undefined;
  }
  if (portableTopics.invalid.length > 0) {
    report.conflicts.push({
      code: "invalid-portable-topic-id",
      message: `Topic IDs must use lowercase ASCII kebab-case: ${portableTopics.invalid.join(", ")}`,
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
    });
    return undefined;
  }
  if (portableTopics.duplicates.length > 0) {
    report.conflicts.push({
      code: "duplicate-portable-topic-id",
      message: `Question topic IDs must not repeat: ${portableTopics.duplicates.join(", ")}`,
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
    });
    return undefined;
  }
  if (portableTopics.legacy) {
    report.issues.push({
      code: "legacy-question-topic-attribute",
      message: "Migrate custom-qb-topic-ids to custom-qb-question-topic-ids",
      questionId: id,
      line: candidate.heading.position?.start.line,
      ...headingContext,
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
    metadata: metadataForQuestion(candidate.topics, candidate.attributes, portableTopics.ids),
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      report.issues.push({
        code: "invalid-question",
        message: issue.message,
        questionId: id,
        line: candidate.heading.position?.start.line,
        ...headingContext,
      });
    }
    return undefined;
  }
  return parsed.data as Question;
}

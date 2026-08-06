import type { Question, ScanMessage } from "../../core/types";
import { parseIal, serializeIal } from "../../markdown/ial";
import {
  scanQuestionMarkdown,
  type MarkdownIalUpdate,
  type MarkdownQuestionScanReport,
} from "../../markdown/scanner";
import { suggestStableQuestionId } from "../../assembly/fingerprint";
import type { IalAttributes } from "../../markdown/ial";
import type { SiyuanKernelClient } from "./types";

const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

export interface SiyuanIalWriteAction extends Omit<MarkdownIalUpdate, "blockId"> {
  blockId: string;
}

export interface SiyuanDocumentScan {
  documentId: string;
  kramdown: string;
  report: MarkdownQuestionScanReport;
  blockIdsByQuestionId: ReadonlyMap<string, string>;
  topicBlockIdsByTopicId: ReadonlyMap<string, string>;
  ialWriteActions: SiyuanIalWriteAction[];
  sourceIssues: ScanMessage[];
}

interface HeadingIal {
  line: number;
  attributes: IalAttributes;
}

function headingIals(kramdown: string): HeadingIal[] {
  const result: HeadingIal[] = [];
  const lines = kramdown.split(/\r?\n/u);
  let headingLine: number | undefined;
  let fence: { marker: string; length: number } | undefined;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/u);
    if (fence) {
      if (fenceMatch
        && fenceMatch[1][0] === fence.marker
        && fenceMatch[1].length >= fence.length
        && line.slice(fenceMatch[0].length).trim() === "") {
        fence = undefined;
      }
      continue;
    }
    if (fenceMatch) {
      fence = { marker: fenceMatch[1][0], length: fenceMatch[1].length };
      headingLine = undefined;
      continue;
    }
    if (/^#{1,6}\s+\S/u.test(line)) {
      headingLine = index + 1;
      continue;
    }
    if (headingLine === undefined || line.trim() === "") continue;
    const parsed = parseIal(line.trim());
    if (parsed) result.push({ line: headingLine, attributes: parsed.attributes });
    headingLine = undefined;
  }
  return result;
}

function questionBlockIds(headings: readonly HeadingIal[]): { ids: Map<string, string>; issues: ScanMessage[] } {
  const ids = new Map<string, string>();
  const issues: ScanMessage[] = [];
  for (const heading of headings) {
    const questionId = heading.attributes["custom-qb-id"];
    if (!questionId) continue;
    const blockId = heading.attributes.id;
    if (!blockId || !nodeIdPattern.test(blockId)) {
      issues.push({
        code: "missing-siyuan-block-id",
        message: `Question '${questionId}' has no valid SiYuan block ID in its IAL`,
        questionId,
        line: heading.line,
      });
      continue;
    }
    const existing = ids.get(questionId);
    if (existing && existing !== blockId) {
      issues.push({
        code: "duplicate-siyuan-question-binding",
        message: `Question '${questionId}' resolves to more than one SiYuan block`,
        questionId,
      });
      continue;
    }
    ids.set(questionId, blockId);
  }
  return { ids, issues };
}

export async function scanSiyuanDocument(
  client: SiyuanKernelClient,
  documentId: string,
): Promise<SiyuanDocumentScan> {
  const result = await client.request<{ id: string; kramdown: string }>("/api/block/getBlockKramdown", {
    id: documentId,
  });
  const initialReport = scanQuestionMarkdown(result.kramdown);
  const missing = initialReport.issues.filter((issue) => issue.code === "missing-stable-question-id");
  let kramdown = result.kramdown;
  const suggested: Array<{ line: number; blockId: string; questionId: string }> = [];
  if (missing.length > 0) {
    const lines = kramdown.split(/\r?\n/u);
    for (const [index, issue] of missing.entries()) {
      if (!issue.line) continue;
      const headingLine = issue.line;
      let ialLine = headingLine;
      while (ialLine < lines.length && lines[ialLine].trim() === "") ialLine += 1;
      const parsed = parseIal(lines[ialLine]?.trim() ?? "");
      if (!parsed || parsed.errors.length > 0) continue;
      const temporaryId = `__damophus_pending_${index}`;
      lines[ialLine] = serializeIal({ ...parsed.attributes, "custom-qb-id": temporaryId });
      const temporaryReport = scanQuestionMarkdown(lines.join("\n"));
      const question = temporaryReport.document.questions.find((candidate) => candidate.id === temporaryId);
      const blockId = parsed.attributes.id;
      if (!question || !blockId || !nodeIdPattern.test(blockId)) continue;
      const visibleNumber = issue.title?.match(/^(\d+)/u)?.[1];
      const { id: _temporaryId, ...questionWithoutId } = question;
      const questionId = await suggestStableQuestionId({ question: questionWithoutId, visibleNumber });
      lines[ialLine] = serializeIal({ ...parsed.attributes, "custom-qb-id": questionId });
      suggested.push({ line: headingLine, blockId, questionId });
      kramdown = lines.join("\n");
    }
  }
  const headings = headingIals(kramdown);
  const bindings = questionBlockIds(headings);
  const report = scanQuestionMarkdown(kramdown);
  for (const update of suggested) {
    report.ialUpdates.push({
      blockId: update.blockId,
      line: update.line,
      questionId: update.questionId,
      attributes: { "custom-qb-id": update.questionId },
      reason: "suggested-stable-question-id",
    });
  }
  const headingIds = new Map(headings.flatMap((heading) => {
    const blockId = heading.attributes.id;
    return blockId && nodeIdPattern.test(blockId) ? [[heading.line, blockId] as const] : [];
  }));
  const sourceIssues = [...bindings.issues];
  const topicBlockIdsByTopicId = new Map<string, string>();
  for (const topic of report.document.topics) {
    const blockId = topic.sourceLine === undefined ? undefined : headingIds.get(topic.sourceLine);
    if (blockId) topicBlockIdsByTopicId.set(topic.id, blockId);
    else {
      sourceIssues.push({
        code: "missing-siyuan-topic-block-id",
        message: `Topic '${topic.title}' has no SiYuan heading block ID`,
        line: topic.sourceLine,
      });
    }
  }
  const ialWriteActions: SiyuanIalWriteAction[] = [];
  for (const update of report.ialUpdates) {
    if (!update.blockId || !nodeIdPattern.test(update.blockId)) {
      sourceIssues.push({
        code: "missing-siyuan-ial-target",
        message: `Inferred metadata for question '${update.questionId}' has no writable SiYuan block`,
        questionId: update.questionId,
        line: update.line,
      });
      continue;
    }
    ialWriteActions.push({ ...update, blockId: update.blockId });
  }
  return {
    documentId,
    kramdown,
    report,
    blockIdsByQuestionId: bindings.ids,
    topicBlockIdsByTopicId,
    ialWriteActions,
    sourceIssues,
  };
}

export function getQuestionBlockId(scan: SiyuanDocumentScan, question: Question): string | undefined {
  return scan.blockIdsByQuestionId.get(question.id);
}

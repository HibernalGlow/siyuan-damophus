import type { Question, QuestionScanReport, ScanMessage } from "../../core/types";
import { parseIal } from "../../markdown/ial";
import { scanQuestionMarkdown } from "../../markdown/scanner";
import type { SiyuanKernelClient } from "./types";

export interface SiyuanDocumentScan {
  documentId: string;
  kramdown: string;
  report: QuestionScanReport;
  blockIdsByQuestionId: ReadonlyMap<string, string>;
  sourceIssues: ScanMessage[];
}

function questionBlockIds(kramdown: string): { ids: Map<string, string>; issues: ScanMessage[] } {
  const ids = new Map<string, string>();
  const issues: ScanMessage[] = [];
  for (const match of kramdown.matchAll(/\{:[^}\r\n]*\}/gu)) {
    const parsed = parseIal(match[0]);
    const questionId = parsed?.attributes["custom-qb-id"];
    if (!questionId) continue;
    const blockId = parsed?.attributes.id;
    if (!blockId) {
      issues.push({
        code: "missing-siyuan-block-id",
        message: `Question '${questionId}' has no SiYuan block ID in its IAL`,
        questionId,
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
  const bindings = questionBlockIds(result.kramdown);
  return {
    documentId,
    kramdown: result.kramdown,
    report: scanQuestionMarkdown(result.kramdown),
    blockIdsByQuestionId: bindings.ids,
    sourceIssues: bindings.issues,
  };
}

export function getQuestionBlockId(scan: SiyuanDocumentScan, question: Question): string | undefined {
  return scan.blockIdsByQuestionId.get(question.id);
}

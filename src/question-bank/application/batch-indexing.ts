import type { ScanMessage } from "../core/types";
import { questionContentSignature } from "../assembly/fingerprint";
import {
  applyQuestionIndexPreview,
  previewQuestionIndexSync,
  type QuestionIndexPreview,
} from "./indexing";
import type { QuestionBankBinding } from "../adapters/siyuan/binding";
import type { SiyuanKernelClient } from "../adapters/siyuan/types";

export interface QuestionIndexBatchAlias {
  questionId: string;
  canonicalDocumentId: string;
  aliasDocumentIds: string[];
}

export interface QuestionIndexBatchPreview {
  token: string;
  generatedAt: string;
  documentIds: string[];
  documents: QuestionIndexPreview[];
  aliases: QuestionIndexBatchAlias[];
  blockers: ScanMessage[];
}

function batchToken(previews: readonly QuestionIndexPreview[], aliases: readonly QuestionIndexBatchAlias[]): string {
  const source = JSON.stringify({
    previews: previews.map((preview) => ({
      documentId: preview.documentId,
      token: preview.token,
      actions: preview.actions.map((action) => [action.kind, action.question.id, action.blockId]),
      staleQuestionIds: preview.staleQuestionIds,
      blockers: preview.blockers.map((blocker) => [blocker.code, blocker.questionId, blocker.message]),
    })),
    aliases,
  });
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

interface QuestionOccurrence {
  documentId: string;
  preview: QuestionIndexPreview;
  signature: string;
  alreadyIndexed: boolean;
}

function conflictMessage(questionId: string, documentIds: readonly string[]): ScanMessage {
  return {
    code: "batch-question-id-conflict",
    message: `Question '${questionId}' has different content in documents: ${documentIds.join(", ")}`,
    questionId,
  };
}

function withoutAliasedQuestions(
  preview: QuestionIndexPreview,
  aliasIds: ReadonlySet<string>,
): QuestionIndexPreview {
  return {
    ...preview,
    actions: preview.actions.filter((action) => !aliasIds.has(action.question.id)),
    ialWriteActions: preview.ialWriteActions.filter((action) => !aliasIds.has(action.questionId)),
    blockers: preview.blockers.filter((blocker) => !(
      blocker.questionId
      && aliasIds.has(blocker.questionId)
      && blocker.code === "question-id-rebound"
    )),
  };
}

export function prepareQuestionIndexBatch(
  source: readonly QuestionIndexPreview[],
): QuestionIndexBatchPreview {
  const previews = source.map((preview) => ({ ...preview }));
  const byQuestionId = new Map<string, QuestionOccurrence[]>();
  for (const preview of previews) {
    const actionIds = new Set(preview.actions.map((action) => action.question.id));
    for (const question of preview.scan.report.document.questions) {
      byQuestionId.set(question.id, [...(byQuestionId.get(question.id) ?? []), {
        documentId: preview.documentId,
        preview,
        signature: questionContentSignature(question),
        alreadyIndexed: !actionIds.has(question.id),
      }]);
    }
  }
  const aliases: QuestionIndexBatchAlias[] = [];
  const blockers: ScanMessage[] = [];
  const aliasIdsByDocument = new Map<string, Set<string>>();
  for (const [questionId, occurrences] of byQuestionId) {
    const documentIds = [...new Set(occurrences.map((occurrence) => occurrence.documentId))];
    if (documentIds.length < 2) continue;
    const signatures = new Set(occurrences.map((occurrence) => occurrence.signature));
    if (signatures.size !== 1) {
      const blocker = conflictMessage(questionId, documentIds);
      blockers.push(blocker);
      for (const occurrence of occurrences) occurrence.preview.blockers = [...occurrence.preview.blockers, blocker];
      continue;
    }
    const ordered = [...occurrences].sort((left, right) => {
      if (left.alreadyIndexed !== right.alreadyIndexed) return left.alreadyIndexed ? -1 : 1;
      return left.documentId.localeCompare(right.documentId);
    });
    const canonical = ordered[0];
    const aliasDocumentIds = [...new Set(ordered.slice(1).map((occurrence) => occurrence.documentId))];
    aliases.push({ questionId, canonicalDocumentId: canonical.documentId, aliasDocumentIds });
    for (const documentId of aliasDocumentIds) {
      const ids = aliasIdsByDocument.get(documentId) ?? new Set<string>();
      ids.add(questionId);
      aliasIdsByDocument.set(documentId, ids);
    }
  }
  const sanitized = previews.map((preview) => withoutAliasedQuestions(
    preview,
    aliasIdsByDocument.get(preview.documentId) ?? new Set(),
  ));
  return {
    token: batchToken(sanitized, aliases),
    generatedAt: new Date().toISOString(),
    documentIds: sanitized.map((preview) => preview.documentId),
    documents: sanitized,
    aliases,
    blockers,
  };
}

export async function previewQuestionIndexBatch(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  documentIds: readonly string[],
): Promise<QuestionIndexBatchPreview> {
  const unique = [...new Set(documentIds)];
  const previews = await Promise.all(unique.map((documentId) => (
    previewQuestionIndexSync(client, binding, documentId)
  )));
  return prepareQuestionIndexBatch(previews);
}

export async function confirmQuestionIndexBatch(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  documentIds: readonly string[],
  expectedToken: string,
): Promise<QuestionIndexBatchPreview> {
  const preview = await previewQuestionIndexBatch(client, binding, documentIds);
  if (preview.token !== expectedToken) throw new Error("Question index batch preview is stale; scan again before confirming");
  const documents: QuestionIndexPreview[] = [];
  for (const document of preview.documents) {
    if (document.blockers.length > 0) {
      documents.push(document);
      continue;
    }
    documents.push(await applyQuestionIndexPreview(client, binding, document));
  }
  return { ...preview, documents };
}


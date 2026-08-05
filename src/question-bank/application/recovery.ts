import type { AttemptEvent, ScanMessage } from "../core/types";
import {
  parseAttemptArchive,
  type AttemptArchive,
} from "../core/recovery";
import {
  appendAttemptEvent,
  readAttemptEvents,
} from "../adapters/siyuan/attempt-store";
import {
  readAttributeView,
  requireQuestionBankBinding,
  type QuestionBankBinding,
} from "../adapters/siyuan/binding";
import type { NodeIdGenerator, SiyuanKernelClient } from "../adapters/siyuan/types";

export interface AttemptImportPreview {
  token: string;
  schemaVersion: 1;
  pluginVersion: string;
  total: number;
  importable: number;
  duplicateAttemptIds: string[];
  orphanQuestionIds: string[];
  existingRowIssues: ScanMessage[];
}

export interface AttemptImportResult extends AttemptImportPreview {
  imported: number;
  failures: Array<{ attemptId: string; message: string }>;
}

interface PreparedImport {
  preview: AttemptImportPreview;
  events: AttemptEvent[];
}

function hash(value: string): string {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return (result >>> 0).toString(36);
}

export function createAttemptImportPlan(
  archive: AttemptArchive,
  existingAttemptIds: ReadonlySet<string>,
  indexedQuestionBlockIds: ReadonlyMap<string, string>,
  existingRowIssues: ScanMessage[] = [],
): PreparedImport {
  const seen = new Set(existingAttemptIds);
  const duplicateAttemptIds = new Set<string>();
  const events: AttemptEvent[] = [];
  const orphanQuestionIds = new Set<string>();
  for (const event of archive.attempts) {
    const currentBlockId = indexedQuestionBlockIds.get(event.question_id);
    if (!currentBlockId) orphanQuestionIds.add(event.question_id);
    if (seen.has(event.attempt_id)) {
      duplicateAttemptIds.add(event.attempt_id);
      continue;
    }
    seen.add(event.attempt_id);
    const normalized = { ...event };
    if (currentBlockId) normalized.question_relation = currentBlockId;
    else delete normalized.question_relation;
    events.push(normalized);
  }
  const token = hash(JSON.stringify({
    archive,
    existingAttemptIds: [...existingAttemptIds].sort(),
    indexedQuestionBlockIds: [...indexedQuestionBlockIds].sort(([left], [right]) => left.localeCompare(right)),
    duplicateAttemptIds: [...duplicateAttemptIds],
    orphanQuestionIds: [...orphanQuestionIds].sort(),
  }));
  return {
    preview: {
      token,
      schemaVersion: 1,
      pluginVersion: archive.plugin_version,
      total: archive.attempts.length,
      importable: events.length,
      duplicateAttemptIds: [...duplicateAttemptIds],
      orphanQuestionIds: [...orphanQuestionIds].sort(),
      existingRowIssues,
    },
    events,
  };
}

async function readIndexedQuestionBlockIds(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<Map<string, string>> {
  await requireQuestionBankBinding(client, binding);
  const av = await readAttributeView(client, binding.questionIndex.avId);
  const questionValues = av.keyValues.find(
    (item) => item.key.id === binding.questionIndex.keys.question_id,
  )?.values ?? [];
  const primaryValues = av.keyValues.find(
    (item) => item.key.id === binding.questionIndex.keys.block_id,
  )?.values ?? [];
  const blockIdByItemId = new Map(primaryValues.map((value) => [value.blockID, value.block?.id]));
  const result = new Map<string, string>();
  for (const value of questionValues) {
    const questionId = value.text?.content;
    const blockId = blockIdByItemId.get(value.blockID);
    if (questionId && blockId) result.set(questionId, blockId);
  }
  return result;
}

async function prepareAttemptImport(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  source: string,
): Promise<PreparedImport> {
  const archive = parseAttemptArchive(source);
  const [existing, questionBlockIds] = await Promise.all([
    readAttemptEvents(client, binding),
    readIndexedQuestionBlockIds(client, binding),
  ]);
  return createAttemptImportPlan(
    archive,
    new Set(existing.events.map((event) => event.attempt_id)),
    questionBlockIds,
    existing.issues,
  );
}

export async function previewAttemptImport(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  source: string,
): Promise<AttemptImportPreview> {
  return (await prepareAttemptImport(client, binding, source)).preview;
}

export async function confirmAttemptImport(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  source: string,
  expectedToken: string,
  idGenerator: NodeIdGenerator,
): Promise<AttemptImportResult> {
  const prepared = await prepareAttemptImport(client, binding, source);
  if (prepared.preview.token !== expectedToken) {
    throw new Error("Attempt import preview is stale; preview the archive again");
  }
  let imported = 0;
  const failures: AttemptImportResult["failures"] = [];
  for (const event of prepared.events) {
    try {
      const result = await appendAttemptEvent(client, binding, event, idGenerator);
      if (result.status === "created") imported += 1;
    } catch (error) {
      failures.push({
        attemptId: event.attempt_id,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return { ...prepared.preview, imported, failures };
}

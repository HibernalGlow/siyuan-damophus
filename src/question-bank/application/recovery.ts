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
  indexedQuestionIds: ReadonlySet<string>,
  existingRowIssues: ScanMessage[] = [],
): PreparedImport {
  const seen = new Set(existingAttemptIds);
  const duplicateAttemptIds = new Set<string>();
  const events: AttemptEvent[] = [];
  const orphanQuestionIds = new Set<string>();
  for (const event of archive.attempts) {
    if (!indexedQuestionIds.has(event.question_id)) orphanQuestionIds.add(event.question_id);
    if (seen.has(event.attempt_id)) {
      duplicateAttemptIds.add(event.attempt_id);
      continue;
    }
    seen.add(event.attempt_id);
    events.push(event);
  }
  const token = hash(JSON.stringify({
    archive,
    existingAttemptIds: [...existingAttemptIds].sort(),
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

async function readIndexedQuestionIds(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<Set<string>> {
  await requireQuestionBankBinding(client, binding);
  const av = await readAttributeView(client, binding.questionIndex.avId);
  const keyId = binding.questionIndex.keys.question_id;
  const values = av.keyValues.find((item) => item.key.id === keyId)?.values ?? [];
  return new Set(values.map((value) => value.text?.content).filter((value): value is string => Boolean(value)));
}

async function prepareAttemptImport(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  source: string,
): Promise<PreparedImport> {
  const archive = parseAttemptArchive(source);
  const [existing, questionIds] = await Promise.all([
    readAttemptEvents(client, binding),
    readIndexedQuestionIds(client, binding),
  ]);
  return createAttemptImportPlan(
    archive,
    new Set(existing.events.map((event) => event.attempt_id)),
    questionIds,
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

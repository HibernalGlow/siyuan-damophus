import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import { parseIal } from "../src/question-bank/markdown/ial";
import { questionContentSignature } from "../src/question-bank/assembly/fingerprint";
import { scanSiyuanDocument, getQuestionBlockId } from "../src/question-bank/adapters/siyuan/document";
import {
  migrateQuestionBankBinding,
  type QuestionBankBinding,
} from "../src/question-bank/adapters/siyuan/binding";
import {
  readAttemptEvents,
  readExamSummaryEvents,
} from "../src/question-bank/adapters/siyuan/attempt-store";
import type { RawAttributeView, SiyuanKernelClient } from "../src/question-bank/adapters/siyuan/types";
import type { LegacyMigrationInput } from "./migrate-av-to-tinybase";
import type {
  QuestionCatalogRecord,
  QuestionTopicRecord,
  SourceDocumentRecord,
  TopicAnchorRecord,
} from "../src/question-bank/storage/schemas";

const execFileAsync = promisify(execFile);
const nodeIdPattern = /^\d{14}-[a-z0-9]{7}$/u;

interface SqlDocumentRow {
  id: string;
  box: string;
  content?: string;
  path?: string;
  hpath?: string;
  updated?: string;
  root_id?: string;
  ial?: string;
}

interface CliOptions {
  workspace: string;
  output: string;
}

function cliArgs(workspace: string, command: readonly string[]): string[] {
  return ["-w", workspace, ...command, "-f", "json"];
}

async function runCli(workspace: string, command: readonly string[]): Promise<string> {
  const result = await execFileAsync("siyuan", cliArgs(workspace, command), {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.stdout.trim();
}

async function runJson<T>(workspace: string, command: readonly string[]): Promise<T> {
  const raw = await runCli(workspace, command);
  return JSON.parse(raw) as T;
}

function sqlCommand(statement: string): string[] {
  return ["sql", statement, "-l", "10000"];
}

function textValue(value: any): string | undefined {
  const result = value?.mSelect?.[0]?.content ?? value?.text?.content ?? value?.block?.content;
  return typeof result === "string" && result.length > 0 ? result : undefined;
}

function numberValue(value: any): number | undefined {
  return value?.number?.isNotEmpty === false ? undefined : value?.number?.content;
}

function arrayValue(value: any): string[] {
  if (Array.isArray(value?.mSelect)) return value.mSelect.map((item: any) => item.content).filter(Boolean);
  const source = value?.text?.content;
  if (!source) return [];
  try {
    const parsed = JSON.parse(source) as unknown;
    return Array.isArray(parsed) && parsed.every((item) => typeof item === "string") ? parsed : [];
  } catch {
    return [];
  }
}

function dateValue(value: any): string | undefined {
  const timestamp = value?.date?.content;
  return typeof timestamp === "number" ? new Date(timestamp).toISOString() : undefined;
}

function valuesByBlock(av: RawAttributeView, keyId: string): Map<string, any> {
  return new Map((av.keyValues.find((entry) => entry.key.id === keyId)?.values ?? [])
    .map((value) => [value.blockID, value]));
}

function decodeHtml(value: string): string {
  return value
    .replaceAll("&quot;", "\"")
    .replaceAll("&#123;", "{")
    .replaceAll("&#125;", "}")
    .replaceAll("&amp;", "&");
}

function parseOptions(argv: readonly string[]): CliOptions {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(name);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const workspace = value("--workspace");
  const output = value("--output");
  if (!workspace || !output) {
    throw new Error("Usage: export-av-inventory --workspace D:/SIYUAN --output inventory.json");
  }
  return {workspace, output};
}

async function readBinding(
  workspace: string,
): Promise<{binding: QuestionBankBinding; rawBinding: unknown; systemDocumentId: string}> {
  const rows = await runJson<SqlDocumentRow[]>(workspace, sqlCommand(
    "SELECT id FROM blocks WHERE type = 'd' AND hpath = '/Damophus' LIMIT 1",
  ));
  const systemDocumentId = rows[0]?.id;
  if (!systemDocumentId) throw new Error("Damophus system document was not found");
  const attrs = await runJson<Record<string, string>>(workspace, ["attr", "get", "--id", systemDocumentId]);
  const raw = attrs["custom-damophus-question-bank-binding"];
  if (!raw) throw new Error("Damophus binding attribute is missing");
  const rawBinding = JSON.parse(decodeHtml(raw));
  const binding = migrateQuestionBankBinding(rawBinding);
  if (!binding) throw new Error("Damophus binding attribute is invalid");
  return {binding, rawBinding, systemDocumentId};
}

async function readAvs(
  workspace: string,
  binding: QuestionBankBinding,
): Promise<Map<string, RawAttributeView>> {
  const ids = [binding.questionIndex.avId, binding.topicIndex.avId, binding.attemptLog.avId];
  const entries = await Promise.all(ids.map(async (id) => [
    id,
    await runJson<RawAttributeView>(workspace, ["database", "get", "--av", id]),
  ] as const));
  return new Map(entries);
}

function createClient(
  workspace: string,
  avs: ReadonlyMap<string, RawAttributeView>,
): SiyuanKernelClient {
  return {
    async request<T>(endpoint: string, payload: any): Promise<T> {
      if (endpoint === "/api/av/getAttributeView") {
        const av = avs.get(payload.id);
        if (!av) throw new Error(`Unknown attribute view '${payload.id}'`);
        return {av} as T;
      }
      if (endpoint === "/api/block/getBlockKramdown") {
        const kramdown = await runCli(workspace, ["block", "kramdown", "--id", payload.id]);
        return {id: payload.id, kramdown} as T;
      }
      throw new Error(`Unsupported read-only inventory endpoint '${endpoint}'`);
    },
  };
}

async function exportInventory(options: CliOptions): Promise<LegacyMigrationInput> {
  const {binding, rawBinding, systemDocumentId} = await readBinding(options.workspace);
  const avs = await readAvs(options.workspace, binding);
  const client = createClient(options.workspace, avs);
  const rootRows = await runJson<SqlDocumentRow[]>(options.workspace, sqlCommand(
    "SELECT DISTINCT root_id FROM blocks WHERE ial LIKE '%custom-qb-id=%' ORDER BY root_id",
  ));
  const documents: Array<{documentId: string; document: SourceDocumentRecord}> = [];
  const questions: Array<{questionId: string; question: QuestionCatalogRecord}> = [];
  const questionTopics: QuestionTopicRecord[] = [];
  for (const root of rootRows) {
    const documentId = root.root_id;
    if (!documentId || !nodeIdPattern.test(documentId)) continue;
    const [sourceRows, scan] = await Promise.all([
      runJson<SqlDocumentRow[]>(options.workspace, sqlCommand(
        `SELECT id, box, content, path, hpath, updated FROM blocks WHERE id = '${documentId}' LIMIT 1`,
      )),
      scanSiyuanDocument(client, documentId),
    ]);
    const source = sourceRows[0];
    if (!source?.box) continue;
    const indexedAt = new Date().toISOString();
    const issueCount = scan.report.issues.length + scan.report.conflicts.length + scan.sourceIssues.length;
    documents.push({
      documentId,
      document: {
        notebook_id: source.box,
        title: source.content || source.hpath?.split("/").filter(Boolean).at(-1) || documentId,
        path: source.path,
        hpath: source.hpath,
        source_updated_at: source.updated,
        content_signature: scan.kramdown,
        scan_status: issueCount === 0 ? "valid" : "partial",
        issue_count: issueCount,
        indexed_at: indexedAt,
      },
    });
    for (const question of scan.report.document.questions) {
      const blockId = getQuestionBlockId(scan, question);
      if (!blockId) continue;
      questions.push({
        questionId: question.id,
        question: {
          block_id: blockId,
          document_id: documentId,
          notebook_id: source.box,
          question_type: question.type,
          title: question.title,
          year: question.metadata.year,
          subject: question.metadata.subject,
          category: question.metadata.category,
          collection: question.metadata.collection,
          source: question.metadata.source,
          parent_id: question.metadata.parentId,
          content_signature: questionContentSignature(question),
          indexed_at: indexedAt,
          available: true,
        },
      });
      const topicIds = [...new Set(question.metadata.topicIds ?? (
        question.metadata.topicId ? [question.metadata.topicId] : []
      ))];
      for (const topicId of topicIds) questionTopics.push({question_id: question.id, topic_id: topicId, document_id: documentId});
    }
  }
  const anchorRows = await runJson<SqlDocumentRow[]>(options.workspace, sqlCommand(
    "SELECT id, root_id, box, content, path, hpath, updated, ial FROM blocks WHERE ial LIKE '%custom-qb-note-topic-id=%' ORDER BY id",
  ));
  const topicAnchors = anchorRows.flatMap((row) => {
    if (!row.id || !row.root_id || !row.box || !row.ial) return [];
    const parsed = parseIal(row.ial);
    const topicId = parsed.attributes["custom-qb-note-topic-id"];
    if (!topicId) return [];
    return [{anchorId: row.id, anchor: {
      topic_id: topicId,
      document_id: row.root_id,
      notebook_id: row.box,
      title: row.content ?? row.id,
      path: row.path,
      hpath: row.hpath,
      source_updated_at: row.updated,
      available: true,
    }}];
  });
  const attemptResult = await readAttemptEvents(client, binding);
  const examResult = await readExamSummaryEvents(client, binding);
  const practiceFile = `${options.workspace}/data/storage/petal/siyuan-damophus/damophus-practice-sessions`;
  let practiceSessions: any[] = [];
  try {
    const raw = JSON.parse(await readFile(practiceFile, "utf8")) as {sessions?: Record<string, unknown>};
    practiceSessions = Object.values(raw.sessions ?? []).filter((value) => value && typeof value === "object");
  } catch {
    practiceSessions = [];
  }
  return {
    binding: {systemDocumentId, rawBinding},
    documents,
    questions,
    questionTopics,
    topicAnchors,
    attempts: attemptResult.events,
    exams: examResult.events,
    practiceSessions,
    evidence: {
      systemDocumentId,
      binding,
      questionIndexAvId: binding.questionIndex.avId,
      topicIndexAvId: binding.topicIndex.avId,
      attemptLogAvId: binding.attemptLog.avId,
      attemptIssues: attemptResult.issues,
      examIssues: examResult.issues,
      rootDocumentCount: rootRows.length,
      anchorRowCount: anchorRows.length,
    },
  };
}

async function main(): Promise<void> {
  const options = parseOptions(process.argv.slice(2));
  const inventory = await exportInventory(options);
  await writeFile(options.output, `${JSON.stringify(inventory, null, 2)}\n`, "utf8");
  process.stdout.write(JSON.stringify({
    output: options.output,
    documents: inventory.documents?.length ?? 0,
    questions: inventory.questions?.length ?? 0,
    questionTopics: inventory.questionTopics?.length ?? 0,
    topicAnchors: inventory.topicAnchors?.length ?? 0,
    attempts: inventory.attempts?.length ?? 0,
    exams: inventory.exams?.length ?? 0,
  }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();

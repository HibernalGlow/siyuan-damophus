import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { canonicalJson, contentHash } from "../src/question-bank/storage/canonical-json";
import type { AttemptEvent, ExamSummaryEvent } from "../src/question-bank/core/types";
import type { PracticeSessionSnapshot } from "../src/question-bank/core/session-schema";
import type { ExamSessionSnapshot } from "../src/question-bank/exam/schema";
import type { QuestionSetBlueprint } from "../src/question-bank/assembly/schema";
import type {
  QuestionCatalogRecord,
  QuestionTopicRecord,
  SourceDocumentRecord,
  TopicAnchorRecord,
} from "../src/question-bank/storage/schemas";
import { AnnualShardRouter } from "../src/question-bank/adapters/tinybase/shard-router";
import { TinyBaseWarehouse } from "../src/question-bank/adapters/tinybase/warehouse";
import {
  TinyBaseAttemptEventRepository,
  TinyBaseAggregateRepository,
  TinyBaseCoreCatalogRepository,
  TinyBaseExamEventRepository,
  TinyBaseExamSessionRepository,
  TinyBasePracticeSessionRepository,
  TinyBaseQuestionSetBlueprintRepository,
} from "../src/question-bank/adapters/tinybase/repositories";
import type { StoreFileIO } from "../src/question-bank/adapters/tinybase/file-persistence";
import { DAMOPHUS_STORE_ROOT } from "../src/question-bank/adapters/tinybase/file-persistence";

export interface LegacyMigrationInput {
  binding?: unknown;
  documents?: Array<{documentId: string; document: SourceDocumentRecord}>;
  questions?: Array<{questionId: string; question: QuestionCatalogRecord}>;
  questionTopics?: QuestionTopicRecord[];
  topicAnchors?: Array<{anchorId: string; anchor: TopicAnchorRecord}>;
  attempts?: AttemptEvent[];
  exams?: ExamSummaryEvent[];
  practiceSessions?: PracticeSessionSnapshot[];
  examSession?: ExamSessionSnapshot;
  blueprints?: QuestionSetBlueprint[];
  evidence?: Record<string, unknown>;
}

export interface MigrationReport {
  schema_version: 1;
  migration_version: 1 | 0;
  migration_device_id: string;
  generated_at: string;
  input_hash: string;
  counts: {
    documents: number;
    questions: number;
    question_topics: number;
    topic_anchors: number;
    attempts_created: number;
    attempts_duplicates: number;
    exam_events_created: number;
    exam_events_duplicates: number;
    practice_sessions: number;
    exam_session: number;
    blueprints: number;
  };
  conflicts: string[];
  evidence?: Record<string, unknown>;
}

class NodeStoreFileIO implements StoreFileIO {
  constructor(private readonly workspace: string) {}

  private absolute(path: string): string {
    if (!path.startsWith("/data/")) throw new Error(`Store path is outside the SiYuan data root: ${path}`);
    return resolve(this.workspace, `.${path}`);
  }

  async read(path: string): Promise<string | undefined> {
    try { return await readFile(this.absolute(path), "utf8"); } catch { return undefined; }
  }

  async write(path: string, content: string): Promise<void> {
    const target = this.absolute(path);
    await mkdir(dirname(target), {recursive: true});
    await writeFile(target, content, "utf8");
  }

  async list(path: string): Promise<string[]> {
    try { return await readdir(this.absolute(path)); } catch { return []; }
  }

  async quarantine(path: string, content: string, reason: string): Promise<string> {
    const target = `${path}.quarantine-${Date.now()}.json`;
    await this.write(target, JSON.stringify({
      quarantined_at: new Date().toISOString(),
      source_path: path,
      reason,
      raw_content: content,
    }, null, 2));
    return target;
  }
}

function migrationDeviceId(value: string | undefined): string {
  const normalized = value?.trim();
  if (normalized && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(normalized)) return normalized;
  return "migration-legacy";
}

export async function migrateLegacyExport(
  input: LegacyMigrationInput,
  options: {workspace: string; deviceId?: string; now?: () => Date},
): Promise<MigrationReport> {
  const deviceId = migrationDeviceId(options.deviceId);
  const io = new NodeStoreFileIO(options.workspace);
  const warehouse = new TinyBaseWarehouse(io, deviceId, options.now);
  await warehouse.initializeLocal();
  const local = warehouse.getLocalContribution();
  const catalog = new TinyBaseCoreCatalogRepository(local.core);
  const router = new AnnualShardRouter();
  const attempts = new TinyBaseAttemptEventRepository(local.events, router);
  const exams = new TinyBaseExamEventRepository(local.events, router);
  const conflicts: string[] = [];

  for (const item of input.documents ?? []) await catalog.upsertDocument(item.documentId, item.document);
  for (const item of input.questions ?? []) await catalog.upsertQuestion(item.questionId, item.question);
  const topicsByDocument = new Map<string, QuestionTopicRecord[]>();
  for (const topic of input.questionTopics ?? []) {
    topicsByDocument.set(topic.document_id, [...(topicsByDocument.get(topic.document_id) ?? []), topic]);
  }
  for (const [documentId, topics] of topicsByDocument) await catalog.replaceQuestionTopics(documentId, topics);
  for (const item of input.topicAnchors ?? []) await catalog.upsertAnchor(item.anchorId, item.anchor);

  let attemptsCreated = 0;
  let attemptsDuplicates = 0;
  const touchedShards = new Set<string>();
  for (const event of input.attempts ?? []) {
    try {
      const status = await attempts.append(event);
      if (status === "created") {
        attemptsCreated += 1;
        touchedShards.add(router.routeAttempt(event.answered_at));
      } else attemptsDuplicates += 1;
    } catch (error) {
      conflicts.push(error instanceof Error ? error.message : String(error));
    }
  }
  let examEventsCreated = 0;
  let examEventsDuplicates = 0;
  for (const event of input.exams ?? []) {
    try {
      const status = await exams.append(event);
      if (status === "created") {
        examEventsCreated += 1;
        touchedShards.add(router.routeAttempt(event.answered_at));
      } else examEventsDuplicates += 1;
    } catch (error) {
      conflicts.push(error instanceof Error ? error.message : String(error));
    }
  }
  const sessions = new TinyBasePracticeSessionRepository(local.sessions, deviceId);
  for (const snapshot of input.practiceSessions ?? []) {
    try { await sessions.save(snapshot); } catch (error) { conflicts.push(error instanceof Error ? error.message : String(error)); }
  }
  if (input.examSession) {
    try { await new TinyBaseExamSessionRepository(local.sessions, deviceId).save(input.examSession); }
    catch (error) { conflicts.push(error instanceof Error ? error.message : String(error)); }
  }
  const blueprints = new TinyBaseQuestionSetBlueprintRepository(local.core);
  for (const blueprint of input.blueprints ?? []) {
    try { await blueprints.save(blueprint); } catch (error) { conflicts.push(error instanceof Error ? error.message : String(error)); }
  }

  const aggregate = new TinyBaseAggregateRepository(local.core, () => attempts.list());
  await aggregate.rebuild();
  await warehouse.persistCore();
  await warehouse.persistSessions();
  for (const shardId of touchedShards) await warehouse.persistEventShard(shardId);
  local.core.setValue("migration_version", conflicts.length === 0 ? 1 : 0);
  await warehouse.persistCore();

  const inputHash = await contentHash(JSON.parse(canonicalJson(input)));
  const report: MigrationReport = {
    schema_version: 1,
    migration_version: conflicts.length === 0 ? 1 : 0,
    migration_device_id: deviceId,
    generated_at: (options.now ?? (() => new Date()))().toISOString(),
    input_hash: inputHash,
    counts: {
      documents: input.documents?.length ?? 0,
      questions: input.questions?.length ?? 0,
      question_topics: input.questionTopics?.length ?? 0,
      topic_anchors: input.topicAnchors?.length ?? 0,
      attempts_created: attemptsCreated,
      attempts_duplicates: attemptsDuplicates,
      exam_events_created: examEventsCreated,
      exam_events_duplicates: examEventsDuplicates,
      practice_sessions: input.practiceSessions?.length ?? 0,
      exam_session: input.examSession ? 1 : 0,
      blueprints: input.blueprints?.length ?? 0,
    },
    conflicts,
    evidence: input.evidence,
  };
  const reportPath = resolve(options.workspace, `.${DAMOPHUS_STORE_ROOT}/migration-report.json`);
  await mkdir(dirname(reportPath), {recursive: true});
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  return report;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const value = (name: string): string | undefined => {
    const index = args.indexOf(name);
    return index >= 0 ? args[index + 1] : undefined;
  };
  const inputPath = value("--input");
  const workspace = value("--workspace") ?? process.cwd();
  if (!inputPath) throw new Error("Usage: migrate-av-to-tinybase --input inventory.json [--workspace D:/SIYUAN] [--device-id migration-legacy]");
  const input = JSON.parse(await readFile(resolve(inputPath), "utf8")) as LegacyMigrationInput;
  const report = await migrateLegacyExport(input, {workspace, deviceId: value("--device-id")});
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (report.conflicts.length > 0) process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void main();

import { describe, expect, it, vi } from "vitest";
import type { AttemptEvent } from "../../core/types";
import { createPracticeSessionSnapshot } from "../../core/session-schema";
import { createAttemptEvent } from "../../core/attempts";
import type { NewAttemptInput } from "../../core/attempts";
import { createDamophusStore, TABLE } from "./tables";
import { AnnualShardRouter, ShardSizeMigrationRequiredError } from "./shard-router";
import {
  createEnvelope,
  readStoreEnvelope,
  serializeStoreEnvelope,
  storeFilePath,
  writeStoreEnvelope,
  type StoreFileIO,
} from "./file-persistence";
import {
  TinyBaseAggregateRepository,
  TinyBaseAttemptEventRepository,
  TinyBaseCoreCatalogRepository,
  TinyBasePracticeSessionRepository,
} from "./repositories";
import { TinyBaseWarehouse } from "./warehouse";
import { TinyBaseRuntime } from "../../../lets-question-bank/tinybase-runtime";

class MemoryFiles implements StoreFileIO {
  readonly files = new Map<string, string>();
  readonly quarantined: string[] = [];
  async read(path: string): Promise<string | undefined> { return this.files.get(path); }
  async write(path: string, content: string): Promise<void> { this.files.set(path, content); }
  async list(path: string): Promise<string[]> {
    return [...this.files.keys()].filter((item) => item.startsWith(path));
  }
  async quarantine(path: string): Promise<string> {
    this.quarantined.push(path);
    return `${path}.quarantine`;
  }
}

const location = {deviceId: "device-1", storeKind: "core" as const, shardId: "core"};

function attempt(overrides: Partial<NewAttemptInput> = {}): AttemptEvent {
  return createAttemptEvent({
    attemptId: "attempt-1",
    questionId: "question-1",
    sessionId: "session-1",
    answeredAt: "2026-08-08T08:00:00.000Z",
    questionType: "single",
    optionOrder: ["A", "B"],
    selectedOptionIds: ["A"],
    objectiveCorrect: true,
    masteryRating: "good",
    durationMs: 1000,
    ...overrides,
  });
}

describe("TinyBase device stores", () => {
  it("round-trips validated mergeable content through a hashed envelope", async () => {
    const files = new MemoryFiles();
    const store = createDamophusStore("test");
    store.setRow(TABLE.questions, "question-1", {
      block_id: "block-1", document_id: "doc-1", notebook_id: "box-1",
      question_type: "single", title: "Question", available: true,
    });
    files.files.set(storeFilePath(location), await serializeStoreEnvelope(location, store));
    const result = await readStoreEnvelope(files, location);
    expect(result.status).toBe("valid");
    expect(result.store.getCell(TABLE.questions, "question-1", "title")).toBe("Question");
    expect(result.envelope?.content_hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("quarantines a hash mismatch and never loads its rows", async () => {
    const files = new MemoryFiles();
    const store = createDamophusStore("test").setCell(TABLE.questions, "question-1", "title", "Question");
    const envelope = await createEnvelope(location, store);
    files.files.set(storeFilePath(location), JSON.stringify({...envelope, content_hash: "0".repeat(64)}));
    const result = await readStoreEnvelope(files, location);
    expect(result.status).toBe("invalid");
    expect(result.store.hasRow(TABLE.questions, "question-1")).toBe(false);
    expect(files.quarantined).toEqual([storeFilePath(location)]);
  });

  it("routes by UTC year and enforces annual shard budgets", () => {
    const warn = vi.fn();
    const router = new AnnualShardRouter(warn);
    expect(router.routeAttempt("2026-12-31T23:59:59.000Z")).toBe("2026");
    expect(router.checkSize("2026", 25 * 1024 * 1024)).toBe("warn");
    expect(warn).toHaveBeenCalledOnce();
    expect(() => router.checkSize("2026", 50 * 1024 * 1024))
      .toThrow(ShardSizeMigrationRequiredError);
  });
});

describe("TinyBase repositories", () => {
  it("indexes catalog rows and materializes many-to-many topic references", async () => {
    const repository = new TinyBaseCoreCatalogRepository(createDamophusStore("core"));
    await repository.upsertQuestion("question-1", {
      block_id: "block-1", document_id: "doc-1", notebook_id: "box-1",
      question_type: "single", title: "Question", subject: "Civil law", available: true,
    });
    await repository.replaceQuestionTopics("doc-1", [
      {question_id: "question-1", topic_id: "topic-a", document_id: "doc-1"},
      {question_id: "question-1", topic_id: "topic-b", document_id: "doc-1"},
    ]);
    expect(await repository.listQuestions({subject: "Civil law"})).toHaveLength(1);
    expect((await repository.listQuestionTopics("question-1")).map((item) => item.topic_id).sort())
      .toEqual(["topic-a", "topic-b"]);
    await repository.markDocumentUnavailable("doc-1");
    expect((await repository.listQuestions())[0].available).toBe(false);
  });

  it("appends events idempotently and rejects conflicting immutable payloads", async () => {
    const stores = new Map<string, ReturnType<typeof createDamophusStore>>();
    const repository = new TinyBaseAttemptEventRepository(stores, new AnnualShardRouter());
    await expect(repository.append(attempt())).resolves.toBe("created");
    await expect(repository.append(attempt())).resolves.toBe("duplicate");
    await expect(repository.append(attempt({objectiveCorrect: false}))).rejects.toThrow("Immutable event conflict");
    expect([...stores.keys()]).toEqual(["2026"]);
    expect(await repository.list()).toHaveLength(1);
  });

  it("keeps complete per-device session versions and applies optimistic revisions", async () => {
    const store = createDamophusStore("sessions");
    const question = {
      id: "question-1", type: "single" as const, title: "Question", stemMarkdown: "Stem",
      options: [{id: "A", markdown: "A"}, {id: "B", markdown: "B"}],
      answer: {kind: "options" as const, optionIds: ["A"]}, solutionMarkdown: "Solution",
      metadata: {topicPath: []},
    };
    const first = createPracticeSessionSnapshot({
      sessionId: "session-1", sourceKey: "doc-1", filter: "all", order: "sequential",
      queue: [{question, optionOrder: ["A", "B"]}], now: new Date("2026-08-08T00:00:00.000Z"),
    });
    const deviceA = new TinyBasePracticeSessionRepository(store, "device-a");
    const deviceB = new TinyBasePracticeSessionRepository(store, "device-b");
    await deviceA.save(first);
    await deviceB.save({...first, session_id: "session-2", updated_at: "2026-08-08T00:01:00.000Z"});
    expect(await deviceA.list()).toHaveLength(2);
    expect(await deviceA.load("doc-1")).toMatchObject({
      status: "ok",
      snapshot: {session_id: "session-2"},
    });
    await expect(deviceA.save({...first, revision: 2}, 1)).rejects.toThrow("changed in another window");
  });

  it("continues a remote practice session in the local device contribution", async () => {
    const readView = createDamophusStore("sessions");
    const local = createDamophusStore("sessions");
    const question = {
      id: "question-1", type: "single" as const, title: "Question", stemMarkdown: "Stem",
      options: [{id: "A", markdown: "A"}, {id: "B", markdown: "B"}],
      answer: {kind: "options" as const, optionIds: ["A"]}, solutionMarkdown: "Solution",
      metadata: {topicPath: []},
    };
    const first = createPracticeSessionSnapshot({
      sessionId: "session-1", sourceKey: "doc-1", filter: "all", order: "sequential",
      queue: [{question, optionOrder: ["A", "B"]}], now: new Date("2026-08-08T00:00:00.000Z"),
    });
    await new TinyBasePracticeSessionRepository(readView, "device-a").save(first);
    const deviceB = new TinyBasePracticeSessionRepository(local, "device-b", {readView});

    await expect(deviceB.load("doc-1")).resolves.toMatchObject({status: "ok"});
    await expect(deviceB.save({...first, revision: 1, updated_at: "2026-08-08T00:01:00.000Z"}, 0)).resolves.toBeUndefined();
    await expect(new TinyBasePracticeSessionRepository(local, "device-b").load("doc-1"))
      .resolves.toMatchObject({status: "ok", snapshot: {revision: 1}});
  });

  it("keeps a completed remote practice session deleted on every device", async () => {
    const store = createDamophusStore("sessions");
    const question = {
      id: "question-1", type: "single" as const, title: "Question", stemMarkdown: "Stem",
      options: [{id: "A", markdown: "A"}, {id: "B", markdown: "B"}],
      answer: {kind: "options" as const, optionIds: ["A"]}, solutionMarkdown: "Solution",
      metadata: {topicPath: []},
    };
    const first = createPracticeSessionSnapshot({
      sessionId: "session-1", sourceKey: "doc-1", filter: "all", order: "sequential",
      queue: [{question, optionOrder: ["A", "B"]}], now: new Date("2026-08-08T00:00:00.000Z"),
    });
    const deviceA = new TinyBasePracticeSessionRepository(store, "device-a");
    const deviceB = new TinyBasePracticeSessionRepository(store, "device-b", {
      now: () => new Date("2026-08-08T00:01:00.000Z"),
    });
    await deviceA.save(first);
    await expect(deviceB.load("doc-1")).resolves.toMatchObject({status: "ok"});
    await deviceB.remove("doc-1", "session-1");

    await expect(deviceA.load("doc-1")).resolves.toBeUndefined();
    await expect(deviceB.load("doc-1")).resolves.toBeUndefined();
    expect(await deviceA.list()).toHaveLength(1);
  });

  it("rebuilds aggregate cache exclusively from immutable events", async () => {
    const core = createDamophusStore("core");
    const events = [attempt(), attempt({attemptId: "attempt-2", objectiveCorrect: false, masteryRating: "again"})];
    const repository = new TinyBaseAggregateRepository(core, async () => events);
    await repository.rebuild();
    const aggregate = await repository.get("question-1");
    expect(aggregate).toMatchObject({attempts: 2, objective_correct: 1, objective_incorrect: 1});
  });

  it("keeps attempts and aggregates after the source document becomes unavailable and the plugin reloads", async () => {
    const files = new MemoryFiles();
    const firstWarehouse = new TinyBaseWarehouse(files, "device-a");
    const firstRuntime = new TinyBaseRuntime(firstWarehouse);
    await firstRuntime.ensureReady();

    const catalog = new TinyBaseCoreCatalogRepository(firstWarehouse.getLocalContribution().core);
    await catalog.upsertDocument("doc-1", {
      notebook_id: "box-1",
      title: "Source document",
      scan_status: "valid",
      issue_count: 0,
    });
    await catalog.upsertQuestion("question-1", {
      block_id: "block-1",
      document_id: "doc-1",
      notebook_id: "box-1",
      question_type: "single",
      title: "Question",
      available: true,
    });
    await firstWarehouse.persistCore();

    await expect(firstRuntime.appendAttempt(attempt())).resolves.toBe("created");
    await catalog.markDocumentUnavailable("doc-1");
    await firstWarehouse.persistCore();

    const reloadedWarehouse = new TinyBaseWarehouse(files, "device-a");
    const reloadedRuntime = new TinyBaseRuntime(reloadedWarehouse);
    await reloadedRuntime.ensureReady();
    const reloadedCatalog = new TinyBaseCoreCatalogRepository(reloadedWarehouse.getReadView().core);

    expect((await reloadedCatalog.listQuestions())[0]).toMatchObject({
      document_id: "doc-1",
      available: false,
    });
    expect((await reloadedRuntime.listAttemptEvents()).map((event) => event.attempt_id)).toEqual(["attempt-1"]);
    expect(await reloadedRuntime.loadAggregates()).toEqual(new Map([
      ["question-1", expect.objectContaining({attempts: 1, objectiveCorrect: 1})],
    ]));
  });
});

describe("TinyBase warehouse", () => {
  it("initializes lazily from local files without enumerating devices", async () => {
    const files = new MemoryFiles();
    const list = vi.spyOn(files, "list");
    const warehouse = new TinyBaseWarehouse(files, "device-a");
    expect(warehouse.isInitialized()).toBe(false);
    await warehouse.initializeLocal();
    expect(list).not.toHaveBeenCalledWith("/data/storage/petal/siyuan-damophus/store/devices");
  });

  it("merges device contributions into a read view without rewriting local files", async () => {
    const files = new MemoryFiles();
    const local = createDamophusStore("local").setCell(TABLE.questions, "question-a", "title", "Local");
    const remote = createDamophusStore("remote").setCell(TABLE.questions, "question-b", "title", "Remote");
    await writeStoreEnvelope(files, {deviceId: "device-a", storeKind: "core", shardId: "core"}, local);
    await writeStoreEnvelope(files, {deviceId: "device-b", storeKind: "core", shardId: "core"}, remote);
    const before = files.files.get(storeFilePath({deviceId: "device-a", storeKind: "core", shardId: "core"}));
    files.list = async (path: string) => {
      if (path.endsWith("/devices")) return ["device-a", "device-b"];
      return [];
    };
    const warehouse = new TinyBaseWarehouse(files, "device-a");
    await warehouse.initializeLocal();
    const view = await warehouse.mergeAfterSync();
    expect(view.core.getCell(TABLE.questions, "question-a", "title")).toBe("Local");
    expect(view.core.getCell(TABLE.questions, "question-b", "title")).toBe("Remote");
    expect(files.files.get(storeFilePath({deviceId: "device-a", storeKind: "core", shardId: "core"})))
      .toBe(before);
  });

  it("keeps the last validated read view when a remote contribution becomes corrupt", async () => {
    const files = new MemoryFiles();
    const remoteLocation = {deviceId: "device-b", storeKind: "core" as const, shardId: "core"};
    const remote = createDamophusStore("remote").setCell(TABLE.questions, "question-b", "title", "Remote");
    await writeStoreEnvelope(files, remoteLocation, remote);
    files.list = async (path: string) => path.endsWith("/devices") ? ["device-a", "device-b"] : [];
    const warehouse = new TinyBaseWarehouse(files, "device-a");
    await warehouse.initializeLocal();
    await warehouse.mergeAfterSync();
    expect(warehouse.getReadView().core.hasRow(TABLE.questions, "question-b")).toBe(true);
    files.files.set(storeFilePath(remoteLocation), "{broken");
    const next = await warehouse.mergeAfterSync();
    expect(next.core.hasRow(TABLE.questions, "question-b")).toBe(true);
    expect(warehouse.getDiagnostics().length).toBeGreaterThan(0);
  });
});

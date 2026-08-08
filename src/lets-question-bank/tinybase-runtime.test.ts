import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "../question-bank/core/attempts";
import { createPracticeSessionSnapshot } from "../question-bank/core/session-schema";
import {
  readStoreEnvelope,
  type StoreFileIO,
} from "../question-bank/adapters/tinybase/file-persistence";
import { TABLE } from "../question-bank/adapters/tinybase/tables";
import { TinyBaseWarehouse } from "../question-bank/adapters/tinybase/warehouse";
import { TinyBaseRuntime } from "./tinybase-runtime";

class MemoryFiles implements StoreFileIO {
  readonly files = new Map<string, string>();
  async read(path: string): Promise<string | undefined> { return this.files.get(path); }
  async write(path: string, content: string): Promise<void> { this.files.set(path, content); }
  async list(path: string): Promise<string[]> {
    const prefix = `${path.replace(/\/$/, "")}/`;
    return [...new Set([...this.files.keys()]
      .filter((item) => item.startsWith(prefix))
      .map((item) => item.slice(prefix.length).split("/")[0])
      .filter(Boolean))];
  }
}

function attempt(objectiveCorrect = true) {
  return createAttemptEvent({
    attemptId: "attempt-1",
    questionId: "question-1",
    sessionId: "session-1",
    answeredAt: "2026-08-08T08:00:00.000Z",
    questionType: "single",
    optionOrder: ["A", "B"],
    selectedOptionIds: ["A"],
    objectiveCorrect,
    masteryRating: "good",
    durationMs: 1000,
  });
}

describe("TinyBase runtime", () => {
  it("stays lazy until a feature reads or writes state", async () => {
    const files = new MemoryFiles();
    const warehouse = new TinyBaseWarehouse(files, "device-a");
    new TinyBaseRuntime(warehouse);
    expect(warehouse.isInitialized()).toBe(false);
    expect(files.files.size).toBe(0);
  });

  it("persists local immutable events and rebuildable aggregate cache", async () => {
    const files = new MemoryFiles();
    const runtime = new TinyBaseRuntime(new TinyBaseWarehouse(files, "device-a"));
    await expect(runtime.appendAttempt(attempt())).resolves.toBe("created");
    await expect(runtime.appendAttempt(attempt())).resolves.toBe("duplicate");
    await expect(runtime.appendAttempt(attempt(false))).rejects.toThrow("Immutable event conflict");

    const eventFile = await readStoreEnvelope(files, {
      deviceId: "device-a",
      storeKind: "events",
      shardId: "2026",
    });
    expect(eventFile.status).toBe("valid");
    expect(eventFile.store.hasRow(TABLE.attemptEvents, "attempt-1")).toBe(true);

    const coreFile = await readStoreEnvelope(files, {
      deviceId: "device-a",
      storeKind: "core",
      shardId: "core",
    });
    expect(coreFile.store.getCell(TABLE.questionAggregates, "question-1", "attempts")).toBe(1);
    expect((await runtime.loadAggregates()).get("question-1")?.objectiveCorrect).toBe(1);
  });

  it("keeps a remotely completed practice session absent after both devices merge", async () => {
    const files = new MemoryFiles();
    const deviceA = new TinyBaseRuntime(new TinyBaseWarehouse(files, "device-a"));
    const snapshot = createPracticeSessionSnapshot({
      sessionId: "session-1",
      sourceKey: "doc-1",
      filter: "all",
      order: "sequential",
      queue: [{
        question: {
          id: "question-1",
          type: "single",
          title: "Question",
          stemMarkdown: "Stem",
          options: [{id: "A", markdown: "A"}, {id: "B", markdown: "B"}],
          answer: {kind: "options", optionIds: ["A"]},
          solutionMarkdown: "Solution",
          metadata: {topicPath: []},
        },
        optionOrder: ["A", "B"],
      }],
      now: new Date("2026-08-08T00:00:00.000Z"),
    });
    await deviceA.savePracticeSession(snapshot);

    const deviceB = new TinyBaseRuntime(new TinyBaseWarehouse(files, "device-b"));
    await deviceB.mergeAfterSync();
    await expect(deviceB.loadPracticeSession("doc-1")).resolves.toMatchObject({status: "ok"});
    await deviceB.removePracticeSession("doc-1", "session-1");
    await expect(deviceB.listPracticeSessions()).resolves.toEqual([]);

    await deviceA.mergeAfterSync();
    await expect(deviceA.loadPracticeSession("doc-1")).resolves.toBeUndefined();
    await expect(deviceA.listPracticeSessions()).resolves.toEqual([]);
  });
});

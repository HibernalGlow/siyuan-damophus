import { describe, expect, it } from "vitest";
import { createPracticeSessionSnapshot } from "../question-bank/core/session-schema";
import type { Question } from "../question-bank/core/types";
import {
  PracticeSessionConflictError,
  SiyuanPracticeSessionRepository,
  type PluginDataApi,
} from "./session-host";

const question: Question = {
  id: "question-1",
  type: "subjective",
  title: "Question",
  stemMarkdown: "Stem",
  options: [],
  solutionMarkdown: "Solution",
  metadata: { topicPath: [] },
};

function snapshot(revision = 0) {
  return {
    ...createPracticeSessionSnapshot({
      sessionId: "session-1",
      sourceKey: "source-1",
      filter: "all",
      order: "sequential",
      queue: [{ question, optionOrder: [] }],
      now: new Date("2026-08-06T00:00:00.000Z"),
    }),
    revision,
  };
}

class MemoryData implements PluginDataApi {
  value: unknown;

  async loadData(): Promise<unknown> {
    return this.value;
  }

  async saveData(_storageName: string, content: unknown): Promise<void> {
    this.value = structuredClone(content);
  }
}

describe("SiYuan practice session repository", () => {
  it("stores independent snapshots by source key", async () => {
    const data = new MemoryData();
    const repository = new SiyuanPracticeSessionRepository(data);
    await repository.save(snapshot());

    const loaded = await repository.load("source-1");
    expect(loaded?.status).toBe("ok");
    expect(loaded?.status === "ok" && loaded.snapshot.session_id).toBe("session-1");
    expect(await repository.list()).toHaveLength(1);
  });

  it("serializes concurrent writes for different source sessions", async () => {
    const data = new MemoryData();
    const repository = new SiyuanPracticeSessionRepository(data);
    const second = {
      ...snapshot(),
      session_id: "session-2",
      source_key: "source-2",
    };

    await Promise.all([repository.save(snapshot()), repository.save(second)]);

    expect((await repository.list()).map((item) => item.sourceKey).sort()).toEqual([
      "source-1",
      "source-2",
    ]);
  });

  it("rejects a stale revision instead of overwriting newer progress", async () => {
    const data = new MemoryData();
    const repository = new SiyuanPracticeSessionRepository(data);
    await repository.save(snapshot());
    await repository.save(snapshot(1), 0);

    await expect(repository.save(snapshot(2), 0)).rejects.toBeInstanceOf(PracticeSessionConflictError);
    const loaded = await repository.load("source-1");
    expect(loaded?.status === "ok" && loaded.snapshot.revision).toBe(1);
  });

  it("preserves an unsupported snapshot for diagnostics", async () => {
    const data = new MemoryData();
    data.value = { schema_version: 1, sessions: { "source-1": { schema_version: 99 } } };
    const repository = new SiyuanPracticeSessionRepository(data);

    expect(await repository.load("source-1")).toEqual({ status: "unsupported", schemaVersion: 99 });
    expect(await repository.diagnostic("source-1")).toContain('"schema_version": 99');
  });
});

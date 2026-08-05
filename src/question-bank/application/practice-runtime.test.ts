import { describe, expect, it, vi } from "vitest";
import type { Question } from "../core/types";
import { createPracticeSessionSnapshot } from "../core/session-schema";
import { PracticeSessionRuntime, type PracticeSessionRuntimeHost } from "./practice-runtime";

const question: Question = {
  id: "question-1",
  type: "subjective",
  title: "Question",
  stemMarkdown: "Stem",
  options: [],
  solutionMarkdown: "Solution",
  metadata: { topicPath: [] },
};

function snapshot() {
  return createPracticeSessionSnapshot({
    sessionId: "session-1",
    sourceKey: "source-1",
    filter: "all",
    order: "sequential",
    queue: [{ question, optionOrder: [] }],
    now: new Date("2026-08-06T00:00:00.000Z"),
  });
}

function host(): PracticeSessionRuntimeHost & {
  savePracticeSession: ReturnType<typeof vi.fn>;
  removePracticeSession: ReturnType<typeof vi.fn>;
  releasePracticeSession: ReturnType<typeof vi.fn>;
} {
  return {
    savePracticeSession: vi.fn(async () => undefined),
    removePracticeSession: vi.fn(async () => undefined),
    releasePracticeSession: vi.fn(async () => undefined),
  };
}

describe("practice session runtime", () => {
  it("creates the first persisted revision without requiring an existing snapshot", async () => {
    vi.useFakeTimers();
    const storage = host();
    const runtime = new PracticeSessionRuntime({
      host: storage,
      input: { snapshot: snapshot(), now: 1_000 },
      persistedRevision: -1,
      autosaveDelayMs: 100,
    });

    await vi.advanceTimersByTimeAsync(100);

    expect(storage.savePracticeSession).toHaveBeenCalledWith(expect.objectContaining({ revision: 0 }), undefined);
    await runtime.dispose();
    vi.useRealTimers();
  });

  it("coalesces autosaves and flushes before pause returns", async () => {
    vi.useFakeTimers();
    const storage = host();
    const runtime = new PracticeSessionRuntime({
      host: storage,
      input: { snapshot: snapshot(), now: 1_000 },
      persistedRevision: 0,
      autosaveDelayMs: 100,
    });
    runtime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { subjective_score: 40 },
      now: 2_000,
    });
    runtime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { subjective_score: 60 },
      now: 2_100,
    });
    await vi.advanceTimersByTimeAsync(100);
    expect(storage.savePracticeSession).toHaveBeenCalledTimes(1);
    expect(storage.savePracticeSession.mock.calls[0][0].revision).toBe(2);

    await runtime.pause(3_000);
    expect(storage.savePracticeSession).toHaveBeenCalledTimes(2);
    expect(storage.releasePracticeSession).toHaveBeenCalledWith("source-1");
    await runtime.dispose();
    vi.useRealTimers();
  });

  it("does not report pause success when persistence fails", async () => {
    const storage = host();
    storage.savePracticeSession.mockRejectedValueOnce(new Error("disk full"));
    const runtime = new PracticeSessionRuntime({
      host: storage,
      input: { snapshot: snapshot(), now: 1_000 },
      persistedRevision: 0,
      autosaveDelayMs: 60_000,
    });
    runtime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: "question-1",
      patch: { subjective_score: 60 },
      now: 2_000,
    });

    await expect(runtime.pause(3_000)).rejects.toThrow("disk full");
    expect(runtime.actor.getSnapshot().matches("active")).toBe(true);
    expect(storage.releasePracticeSession).not.toHaveBeenCalled();
    await runtime.dispose();
  });

  it("flushes a submitting snapshot before releasing its lease and cancels later autosaves", async () => {
    vi.useFakeTimers();
    try {
      const storage = host();
      const runtime = new PracticeSessionRuntime({
        host: storage,
        input: { snapshot: snapshot(), now: 1_000 },
        persistedRevision: 0,
        autosaveDelayMs: 100,
      });
      runtime.actor.send({
        type: "DRAFT_CHANGED",
        questionId: "question-1",
        patch: { revealed: true, subjective_score: 60 },
        now: 2_000,
      });
      runtime.actor.send({ type: "BEGIN_SUBMIT", questionId: "question-1", now: 3_000 });
      expect(runtime.actor.getSnapshot().matches("submitting")).toBe(true);

      await runtime.dispose();

      expect(storage.savePracticeSession).toHaveBeenCalledTimes(1);
      expect(storage.savePracticeSession).toHaveBeenCalledWith(
        expect.objectContaining({
          revision: 2,
          drafts: expect.objectContaining({
            "question-1": expect.objectContaining({ revealed: true, subjective_score: 60 }),
          }),
        }),
        0,
      );
      expect(storage.savePracticeSession.mock.invocationCallOrder[0])
        .toBeLessThan(storage.releasePracticeSession.mock.invocationCallOrder[0]);
      expect(storage.releasePracticeSession).toHaveBeenCalledWith("source-1");

      await vi.advanceTimersByTimeAsync(100);
      expect(storage.savePracticeSession).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

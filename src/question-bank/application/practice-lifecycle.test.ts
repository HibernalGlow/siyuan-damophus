import { describe, expect, it, vi } from "vitest";
import { createPracticeSessionSnapshot } from "../core/session-schema";
import type { Question } from "../core/types";
import {
  PracticeSessionLifecycleError,
  replacePracticeSession,
  resumePracticeSession,
  startPracticeSession,
  type PracticeSessionLifecycleHost,
} from "./practice-lifecycle";

const first: Question = {
  id: "question-1",
  type: "subjective",
  title: "First",
  stemMarkdown: "First stem",
  options: [],
  solutionMarkdown: "First solution",
  metadata: { topicPath: [] },
};

const second: Question = { ...first, id: "question-2", title: "Second" };

function snapshot(sourceKey = "source-1") {
  return createPracticeSessionSnapshot({
    sessionId: "session-1",
    sourceKey,
    filter: "all",
    order: "sequential",
    queue: [
      { question: first, optionOrder: [] },
      { question: second, optionOrder: [] },
    ],
    now: new Date("2026-08-06T00:00:00.000Z"),
  });
}

function host(): PracticeSessionLifecycleHost & Record<
  "acquirePracticeSession" | "releasePracticeSession" | "removePracticeSession" | "loadSessionAttempts",
  ReturnType<typeof vi.fn>
> {
  return {
    acquirePracticeSession: vi.fn(async () => true),
    releasePracticeSession: vi.fn(async () => undefined),
    removePracticeSession: vi.fn(async () => undefined),
    loadSessionAttempts: vi.fn(async () => []),
  };
}

describe("practice session lifecycle", () => {
  it("does not create or remove anything when another window owns the source", async () => {
    const storage = host();
    storage.acquirePracticeSession.mockResolvedValue(false);
    const createSnapshot = vi.fn(snapshot);
    const activate = vi.fn(async () => undefined);

    const operation = startPracticeSession({
      host: storage,
      sourceKey: "source-1",
      createSnapshot,
      activate,
    });
    await expect(operation).rejects.toBeInstanceOf(PracticeSessionLifecycleError);
    await expect(operation).rejects.toHaveProperty("code", "session-in-use");

    expect(createSnapshot).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(storage.removePracticeSession).not.toHaveBeenCalled();
  });

  it("releases ownership when activation fails", async () => {
    const storage = host();
    const failure = new Error("activation failed");

    await expect(startPracticeSession({
      host: storage,
      sourceKey: "source-1",
      createSnapshot: snapshot,
      activate: vi.fn(async () => { throw failure; }),
    })).rejects.toBe(failure);

    expect(storage.releasePracticeSession).toHaveBeenCalledWith("source-1");
  });

  it("passes source reconciliation issues through activation", async () => {
    const storage = host();
    const activate = vi.fn(async () => undefined);

    await resumePracticeSession({
      host: storage,
      snapshot: snapshot(),
      questions: [first],
      now: new Date("2026-08-06T00:01:00.000Z"),
      activate,
    });

    expect(activate).toHaveBeenCalledWith(expect.objectContaining({
      persistedRevision: 0,
      recoveryIssues: [{ code: "missing-question", questionId: "question-2" }],
      snapshot: expect.objectContaining({ queue_question_ids: ["question-1"], revision: 1 }),
    }));
    expect(storage.releasePracticeSession).not.toHaveBeenCalled();
  });

  it("releases ownership when every queued question disappeared", async () => {
    const storage = host();
    const activate = vi.fn(async () => undefined);
    const operation = resumePracticeSession({
      host: storage,
      snapshot: snapshot(),
      questions: [],
      activate,
    });

    await expect(operation).rejects.toHaveProperty("code", "session-has-no-questions");
    expect(activate).not.toHaveBeenCalled();
    expect(storage.releasePracticeSession).toHaveBeenCalledWith("source-1");
  });

  it("constructs a valid replacement before deleting stored progress", async () => {
    const storage = host();
    const failure = new Error("queue is empty");

    await expect(replacePracticeSession({
      host: storage,
      previous: snapshot(),
      createSnapshot: () => { throw failure; },
      activate: vi.fn(async () => undefined),
    })).rejects.toBe(failure);

    expect(storage.removePracticeSession).not.toHaveBeenCalled();
    expect(storage.releasePracticeSession).toHaveBeenCalledWith("source-1");
  });

  it("removes the matching snapshot before activating its replacement", async () => {
    const storage = host();
    const activate = vi.fn(async () => undefined);

    await replacePracticeSession({
      host: storage,
      previous: snapshot(),
      createSnapshot: snapshot,
      activate,
    });

    expect(storage.removePracticeSession).toHaveBeenCalledWith("source-1", "session-1");
    expect(storage.removePracticeSession.mock.invocationCallOrder[0])
      .toBeLessThan(activate.mock.invocationCallOrder[0]);
    expect(storage.releasePracticeSession).not.toHaveBeenCalled();
  });

  it("rejects a replacement from another source before deleting progress", async () => {
    const storage = host();
    const activate = vi.fn(async () => undefined);
    const operation = replacePracticeSession({
      host: storage,
      previous: snapshot(),
      createSnapshot: () => snapshot("source-2"),
      activate,
    });

    await expect(operation).rejects.toHaveProperty("code", "replacement-source-mismatch");
    expect(storage.removePracticeSession).not.toHaveBeenCalled();
    expect(activate).not.toHaveBeenCalled();
    expect(storage.releasePracticeSession).toHaveBeenCalledWith("source-1");
  });
});

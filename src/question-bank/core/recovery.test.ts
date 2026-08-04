import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "./attempts";
import { createAttemptArchive, parseAttemptArchive, serializeAttemptArchive } from "./recovery";

const event = createAttemptEvent({
  attemptId: "attempt-1",
  questionId: "question-1",
  sessionId: "session-1",
  answeredAt: "2026-08-04T12:00:00.000Z",
  questionType: "single",
  optionOrder: ["A", "B"],
  selectedOptionIds: ["A"],
  objectiveCorrect: true,
  masteryRating: "good",
});

describe("attempt recovery archive", () => {
  it("serializes and parses versioned attempt archives", () => {
    const archive = createAttemptArchive([event], "0.25.3", "2026-08-04T12:30:00.000Z");
    expect(parseAttemptArchive(serializeAttemptArchive(archive))).toEqual(archive);
  });

  it("rejects unsupported archive versions", () => {
    expect(() => parseAttemptArchive({
      schema_version: 2,
      exported_at: "2026-08-04T12:30:00.000Z",
      plugin_version: "0.25.3",
      attempts: [],
    })).toThrow();
  });
});

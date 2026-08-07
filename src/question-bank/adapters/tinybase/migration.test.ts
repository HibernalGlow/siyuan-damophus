import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createAttemptEvent } from "../../core/attempts";
import { migrateLegacyExport, type LegacyMigrationInput } from "../../../../scripts/migrate-av-to-tinybase";

describe("AV to TinyBase development migration", () => {
  it("is idempotent and records a reconciliation report", async () => {
    const workspace = await mkdtemp(join(tmpdir(), "damophus-migration-"));
    const input: LegacyMigrationInput = {
      attempts: [createAttemptEvent({
        attemptId: "legacy-attempt-1",
        questionId: "question-1",
        sessionId: "session-1",
        answeredAt: "2026-08-08T08:00:00.000Z",
        questionType: "single",
        optionOrder: ["A", "B"],
        selectedOptionIds: ["A"],
        objectiveCorrect: true,
        masteryRating: "good",
      })],
      evidence: {source: "test"},
    };
    try {
      const first = await migrateLegacyExport(input, {workspace, deviceId: "migration-test"});
      const second = await migrateLegacyExport(input, {workspace, deviceId: "migration-test"});
      expect(first).toMatchObject({migration_version: 1, counts: {attempts_created: 1}});
      expect(second).toMatchObject({migration_version: 1, counts: {attempts_created: 0, attempts_duplicates: 1}});
      const report = JSON.parse(await readFile(join(workspace, "data/storage/petal/siyuan-damophus/store/migration-report.json"), "utf8"));
      expect(report.input_hash).toMatch(/^[a-f0-9]{64}$/u);
      expect(report.evidence).toEqual({source: "test"});
    } finally {
      await rm(workspace, {recursive: true, force: true});
    }
  });
});

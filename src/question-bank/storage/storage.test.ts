import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash } from "./canonical-json";
import {
  AttemptEventRecordSchema,
  PracticeSessionVersionRecordSchema,
  StoreEnvelopeSchema,
} from "./schemas";

describe("TinyBase storage contracts", () => {
  it("serializes object keys deterministically without changing array order", () => {
    expect(canonicalJson({ b: 2, a: 1, list: [{ z: true, y: false }] }))
      .toBe('{"a":1,"b":2,"list":[{"y":false,"z":true}]}');
  });

  it("creates a stable content hash", async () => {
    const first = await contentHash({ b: 2, a: 1 });
    await expect(contentHash({ a: 1, b: 2 })).resolves.toBe(first);
    expect(first).toMatch(/^[a-f0-9]{64}$/);
  });

  it("rejects malformed JSON snapshot rows", () => {
    const result = PracticeSessionVersionRecordSchema.safeParse({
      source_key: "doc-1",
      device_id: "device-1",
      session_id: "session-1",
      revision: 0,
      updated_at: "2026-08-08T00:00:00.000Z",
      snapshot_json: "{broken",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an empty snapshot only for a deleted practice session", () => {
    const tombstone = {
      source_key: "doc-1",
      device_id: "device-1",
      session_id: "session-1",
      revision: 2,
      updated_at: "2026-08-08T00:01:00.000Z",
      deleted: true,
      snapshot_json: "",
    };
    expect(PracticeSessionVersionRecordSchema.safeParse(tombstone).success).toBe(true);
    expect(PracticeSessionVersionRecordSchema.safeParse({...tombstone, deleted: false}).success).toBe(false);
  });

  it("validates envelope hashes syntactically before content verification", () => {
    expect(StoreEnvelopeSchema.safeParse({
      format_version: 1,
      store_kind: "core",
      device_id: "device-1",
      shard_id: "core",
      schema_version: 1,
      updated_at: "2026-08-08T00:00:00.000Z",
      content_hash: "0".repeat(64),
      mergeable_content: [],
    }).success).toBe(true);
  });

  it("keeps attempt event validation delegated to the domain schema", () => {
    expect(AttemptEventRecordSchema.safeParse({
      schema_version: 1,
      event_kind: "question_attempt",
      attempt_id: "attempt-1",
      question_id: "question-1",
      session_id: "session-1",
      answered_at: "2026-08-08T00:00:00.000Z",
      question_type: "single",
      option_order: ["A", "B"],
      selected_option_ids: ["A"],
      objective_correct: true,
      mastery_rating: "good",
    }).success).toBe(true);
  });
});

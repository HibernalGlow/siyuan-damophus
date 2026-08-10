import { describe, expect, it } from "vitest";
import {
  canonicalJson,
  configHash,
  decryptAiConfig,
  decideAiSync,
  encryptAiConfig,
  selectLatestEnvelope,
  type AiConfigEnvelope,
} from "./sync-model";

function envelope(overrides: Partial<AiConfigEnvelope> = {}): AiConfigEnvelope {
  return {
    schemaVersion: 1,
    deviceId: "device-a",
    revision: 1,
    updatedAt: 1,
    hash: "a".repeat(64),
    iv: "aXY=",
    encryptedConfig: "Y2lwaGVydGV4dA==",
    ...overrides,
  };
}

describe("AI configuration sync model", () => {
  it("hashes equivalent objects identically regardless of key insertion order", async () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 } })).toBe('{"a":{"c":3,"d":4},"b":2}');
    await expect(configHash({ b: 2, a: 1 })).resolves.toBe(await configHash({ a: 1, b: 2 }));
  });

  it("encrypts synchronized secrets and decrypts them with the workspace sync key", async () => {
    const config = { providers: [{ apiKey: "secret-value" }] };
    const encrypted = await encryptAiConfig(config, "workspace-sync-key");
    expect(encrypted.encryptedConfig).not.toContain("secret-value");
    await expect(decryptAiConfig(envelope(encrypted), "workspace-sync-key")).resolves.toEqual(config);
  });

  it("does not write or apply when the latest synchronized hash is already active", () => {
    const latest = envelope({ revision: 7, hash: "b".repeat(64) });
    expect(decideAiSync({
      currentHash: latest.hash,
      lastObservedHash: latest.hash,
      envelopes: [latest],
    })).toMatchObject({ action: "none", nextRevision: 8 });
  });

  it("publishes a locally edited configuration with the next logical revision", () => {
    const remote = envelope({ revision: 4, hash: "b".repeat(64) });
    expect(decideAiSync({
      currentHash: "c".repeat(64),
      lastObservedHash: "a".repeat(64),
      envelopes: [remote],
    })).toMatchObject({ action: "publish", nextRevision: 5 });
  });

  it("applies the synchronized winner when the local configuration has not changed", () => {
    const remote = envelope({ revision: 4, hash: "b".repeat(64) });
    expect(decideAiSync({
      currentHash: "a".repeat(64),
      lastObservedHash: "a".repeat(64),
      envelopes: [remote],
    })).toMatchObject({ action: "apply", winner: remote, nextRevision: 5 });
  });

  it("selects revisions before timestamps and device ids", () => {
    const olderRevision = envelope({ deviceId: "z", revision: 2, updatedAt: 99 });
    const newerRevision = envelope({ deviceId: "a", revision: 3, updatedAt: 1 });
    expect(selectLatestEnvelope([olderRevision, newerRevision])).toBe(newerRevision);
  });
});

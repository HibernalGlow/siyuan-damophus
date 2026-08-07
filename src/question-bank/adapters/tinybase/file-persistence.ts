import { StoreEnvelopeSchema, type StoreEnvelope } from "../../storage";
import { canonicalJson, contentHash } from "../../storage/canonical-json";
import { createDamophusStore } from "./tables";
import type { MergeableContent, MergeableStore } from "tinybase";

export const DAMOPHUS_STORE_ROOT = "/data/storage/petal/siyuan-damophus/store";

export interface StoreFileIO {
  read(path: string): Promise<string | undefined>;
  write(path: string, content: string): Promise<void>;
  list(path: string): Promise<string[]>;
  quarantine?(path: string, content: string, reason: string): Promise<string | undefined>;
}

export interface StoreFileLocation {
  deviceId: string;
  storeKind: "core" | "sessions" | "events";
  shardId: string;
}

export function storeFilePath(location: StoreFileLocation): string {
  const {deviceId, storeKind, shardId} = location;
  if (![deviceId, shardId].every((value) => /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value))) {
    throw new Error("Invalid store file path component");
  }
  return `${DAMOPHUS_STORE_ROOT}/devices/${deviceId}/${storeKind === "events" ? `events/${shardId}` : shardId}.json`;
}

export async function createEnvelope(
  location: StoreFileLocation,
  store: MergeableStore,
  now = new Date().toISOString(),
): Promise<StoreEnvelope> {
  const mergeableContent = store.getMergeableContent();
  return StoreEnvelopeSchema.parse({
    format_version: 1,
    store_kind: location.storeKind,
    device_id: location.deviceId,
    shard_id: location.shardId,
    schema_version: 1,
    updated_at: now,
    content_hash: await contentHash(mergeableContent),
    mergeable_content: mergeableContent,
  });
}

export async function serializeStoreEnvelope(
  location: StoreFileLocation,
  store: MergeableStore,
  now?: string,
): Promise<string> {
  return JSON.stringify(await createEnvelope(location, store, now), null, 2);
}

export interface ReadStoreResult {
  status: "missing" | "valid" | "invalid";
  store: MergeableStore;
  envelope?: StoreEnvelope;
  diagnostic?: string;
}

export async function readStoreEnvelope(
  io: StoreFileIO,
  location: StoreFileLocation,
): Promise<ReadStoreResult> {
  const path = storeFilePath(location);
  const empty = createDamophusStore(`${location.deviceId}:${location.shardId}`);
  const raw = await io.read(path);
  if (raw === undefined || raw === "") return {status: "missing", store: empty};
  try {
    const parsed = StoreEnvelopeSchema.parse(JSON.parse(raw));
    const actualHash = await contentHash(parsed.mergeable_content);
    if (actualHash !== parsed.content_hash) throw new Error("Store envelope content hash mismatch");
    const store = createDamophusStore(`${location.deviceId}:${location.shardId}`);
    store.setMergeableContent(parsed.mergeable_content as MergeableContent);
    return {status: "valid", store, envelope: parsed};
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    await io.quarantine?.(path, raw, reason);
    return {status: "invalid", store: empty, diagnostic: `${path}: ${reason}`};
  }
}

export async function writeStoreEnvelope(
  io: StoreFileIO,
  location: StoreFileLocation,
  store: MergeableStore,
  now?: string,
): Promise<void> {
  await io.write(storeFilePath(location), await serializeStoreEnvelope(location, store, now));
}

export function serializeMergeableContent(store: MergeableStore): string {
  return canonicalJson(store.getMergeableContent());
}

export type AiConfig = Record<string, unknown>;

export interface AiConfigEnvelope {
  schemaVersion: 1;
  deviceId: string;
  revision: number;
  updatedAt: number;
  hash: string;
  iv: string;
  encryptedConfig: string;
}

export interface AiSyncDecision {
  action: "apply" | "publish" | "none";
  winner?: AiConfigEnvelope;
  nextRevision: number;
}

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.keys(value as Record<string, unknown>)
    .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
    .sort()
    .map((key) => [key, canonicalValue((value as Record<string, unknown>)[key])]));
}

export function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalValue(value));
}

export async function configHash(config: AiConfig): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalJson(config));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function encryptionKey(syncKey: string): Promise<CryptoKey> {
  const material = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(syncKey));
  return crypto.subtle.importKey("raw", material, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptAiConfig(config: AiConfig, syncKey: string): Promise<Pick<AiConfigEnvelope, "iv" | "encryptedConfig">> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await encryptionKey(syncKey),
    new TextEncoder().encode(canonicalJson(config)),
  );
  return {
    iv: bytesToBase64(iv),
    encryptedConfig: bytesToBase64(new Uint8Array(ciphertext)),
  };
}

export async function decryptAiConfig(envelope: AiConfigEnvelope, syncKey: string): Promise<AiConfig> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(envelope.iv) },
    await encryptionKey(syncKey),
    base64ToBytes(envelope.encryptedConfig),
  );
  const value = JSON.parse(new TextDecoder().decode(plaintext)) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The synchronized AI configuration is invalid");
  }
  return value as AiConfig;
}

export function isAiConfigEnvelope(value: unknown): value is AiConfigEnvelope {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AiConfigEnvelope>;
  return item.schemaVersion === 1
    && typeof item.deviceId === "string"
    && item.deviceId.length > 0
    && Number.isSafeInteger(item.revision)
    && (item.revision ?? 0) > 0
    && Number.isFinite(item.updatedAt)
    && typeof item.hash === "string"
    && item.hash.length === 64
    && typeof item.iv === "string"
    && item.iv.length > 0
    && typeof item.encryptedConfig === "string"
    && item.encryptedConfig.length > 0;
}

export function selectLatestEnvelope(envelopes: readonly AiConfigEnvelope[]): AiConfigEnvelope | undefined {
  return [...envelopes].sort((left, right) =>
    right.revision - left.revision
    || right.updatedAt - left.updatedAt
    || right.deviceId.localeCompare(left.deviceId))[0];
}

export function decideAiSync(input: {
  currentHash: string;
  lastObservedHash?: string;
  envelopes: readonly AiConfigEnvelope[];
}): AiSyncDecision {
  const winner = selectLatestEnvelope(input.envelopes);
  const nextRevision = Math.max(0, ...input.envelopes.map((item) => item.revision)) + 1;
  if (!winner) return { action: "publish", nextRevision };
  if (winner.hash === input.currentHash) return { action: "none", winner, nextRevision };
  if (input.lastObservedHash && input.lastObservedHash !== input.currentHash) {
    return { action: "publish", winner, nextRevision };
  }
  return { action: "apply", winner, nextRevision };
}

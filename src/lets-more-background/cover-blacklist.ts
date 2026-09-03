import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import { booruPostDedupKey, normalizeCoverUrl } from "./cover-dedup";
import { coverFavoriteKey } from "./cover-favorites";

const log = getLogger("lets-more-background:blacklist");

/**
 * 题头图黑名单：被 ⛔ 拉黑的图片永远不再出现在随机抽卡里。
 * 独立于去重记忆（seen，有上限且按时间淘汰），黑名单是永久且小体量的。
 */
export const COVER_BLACKLIST_STORAGE_NAME = "more_background_cover_blacklist.json";
export const COVER_BLACKLIST_SCHEMA_VERSION = 1;
export const MAX_COVER_BLACKLIST = 2000;

export interface CoverBlacklistEntry {
  id: string;
  imageUrl: string;
  postUrl?: string;
  site?: string;
  postId?: string | number;
  tags?: string[];
  templateLabel?: string;
  addedAt: string;
}

export type CoverBlacklistInput = Omit<CoverBlacklistEntry, "id" | "addedAt">;

export interface CoverBlacklistStorage {
  loadData(name: string): Promise<unknown>;
  saveData(name: string, value: unknown): Promise<unknown>;
}

let memoryBlacklist: CoverBlacklistEntry[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function storageOrDefault(storage?: CoverBlacklistStorage): CoverBlacklistStorage {
  return storage || (plugin as unknown as CoverBlacklistStorage);
}

function asText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizeEntry(value: unknown, index: number): CoverBlacklistEntry | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CoverBlacklistEntry>;
  const imageUrl = asText(raw.imageUrl);
  if (!imageUrl) return null;
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : undefined;
  return {
    id: asText(raw.id) || `cover-blacklist-${Date.now()}-${index}`,
    imageUrl,
    postUrl: asText(raw.postUrl),
    site: asText(raw.site),
    postId: raw.postId === undefined || raw.postId === null || raw.postId === "" ? undefined : raw.postId,
    tags: tags?.length ? tags : undefined,
    templateLabel: asText(raw.templateLabel),
    addedAt: asText(raw.addedAt) || new Date().toISOString(),
  };
}

/** 与去重排除集同一套键：归一化图片 URL + site:postId，保证两边能对上。 */
export function coverBlacklistKeys(value: Pick<CoverBlacklistEntry, "imageUrl" | "postUrl" | "site" | "postId">): string[] {
  const keys: string[] = [];
  const normalized = normalizeCoverUrl(value.imageUrl) || value.imageUrl.trim();
  if (normalized) keys.push(normalized);
  const postKey = value.site && value.postId !== undefined && value.postId !== ""
    ? booruPostDedupKey(value.site, value.postId)
    : null;
  if (postKey) keys.push(postKey);
  return keys;
}

function parseBlacklist(raw: unknown): CoverBlacklistEntry[] {
  let source: unknown = raw;
  if (typeof raw === "string") {
    try {
      source = JSON.parse(raw);
    } catch {
      source = [];
    }
  }
  if (!Array.isArray(source)) {
    source = (source as { items?: unknown[] } | null)?.items;
  }
  if (!Array.isArray(source)) return [];
  const result: CoverBlacklistEntry[] = [];
  const seenKeys = new Set<string>();
  source.forEach((item, index) => {
    const normalized = normalizeEntry(item, index);
    if (!normalized) return;
    // 键交集语义：同一帖子换 URL 变体仍算重复；无键兜底用原始标识。
    const keys = coverBlacklistKeys(normalized);
    if (keys.length > 0) {
      if (keys.some((key) => seenKeys.has(key))) return;
      for (const key of keys) seenKeys.add(key);
    } else {
      const fallback = coverFavoriteKey(normalized);
      if (seenKeys.has(fallback)) return;
      seenKeys.add(fallback);
    }
    result.push(normalized);
  });
  return result.slice(0, MAX_COVER_BLACKLIST);
}

export async function loadCoverBlacklist(storage?: CoverBlacklistStorage): Promise<CoverBlacklistEntry[]> {
  if (memoryBlacklist) return memoryBlacklist.map((item) => ({ ...item, tags: item.tags ? [...item.tags] : undefined }));
  try {
    memoryBlacklist = parseBlacklist(await storageOrDefault(storage).loadData(COVER_BLACKLIST_STORAGE_NAME));
  } catch (error) {
    log.warn("Failed to load cover blacklist:", error);
    memoryBlacklist = [];
  }
  return memoryBlacklist.map((item) => ({ ...item, tags: item.tags ? [...item.tags] : undefined }));
}

async function saveBlacklist(blacklist: CoverBlacklistEntry[], storage?: CoverBlacklistStorage): Promise<void> {
  const normalized = parseBlacklist(blacklist);
  memoryBlacklist = normalized;
  const target = storageOrDefault(storage);
  writeQueue = writeQueue.then(async () => {
    await target.saveData(COVER_BLACKLIST_STORAGE_NAME, {
      schemaVersion: COVER_BLACKLIST_SCHEMA_VERSION,
      items: normalized,
      updatedAt: new Date().toISOString(),
    });
  });
  await writeQueue;
}

export async function addCoverBlacklistEntry(
  input: CoverBlacklistInput,
  storage?: CoverBlacklistStorage,
): Promise<boolean> {
  const current = await loadCoverBlacklist(storage);
  const incoming = normalizeEntry(input, 0);
  if (!incoming) return false;
  const existingKeys = new Set<string>();
  for (const item of current) {
    for (const key of coverBlacklistKeys(item)) existingKeys.add(key);
  }
  const incomingKeys = coverBlacklistKeys(incoming);
  const duplicated = incomingKeys.length > 0
    ? incomingKeys.some((key) => existingKeys.has(key))
    : existingKeys.has(coverFavoriteKey(incoming));
  if (duplicated) return false;
  const entry: CoverBlacklistEntry = {
    ...incoming,
    id: `cover-blacklist-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    addedAt: new Date().toISOString(),
  };
  await saveBlacklist([entry, ...current], storage);
  log.info("Cover blacklisted", { imageUrl: entry.imageUrl, site: entry.site, postId: entry.postId });
  return true;
}

export async function removeCoverBlacklistEntry(id: string, storage?: CoverBlacklistStorage): Promise<CoverBlacklistEntry[]> {
  const current = await loadCoverBlacklist(storage);
  const blacklist = current.filter((item) => item.id !== id);
  await saveBlacklist(blacklist, storage);
  return blacklist;
}

/** 去重排除集用的键集合（归一化 URL + site:postId 双保险）。 */
export async function loadCoverBlacklistKeys(storage?: CoverBlacklistStorage): Promise<Set<string>> {
  const entries = await loadCoverBlacklist(storage);
  const keys = new Set<string>();
  for (const entry of entries) {
    for (const key of coverBlacklistKeys(entry)) keys.add(key);
  }
  return keys;
}

export async function clearCoverBlacklistCache(): Promise<void> {
  memoryBlacklist = null;
}

import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import { collectHistoryCoverUrls } from "./cover-dedup";
import type { CoverHistoryEntry } from "./sources";

const historyLog = getLogger("lets-more-background:history");

export const COVER_HISTORY_KEY = "damophus_more_background_cover_history";
export const SEEN_COVERS_KEY = "damophus_more_background_seen_covers";
export const COVER_DEDUP_STORAGE_NAME = "more_background_cover_dedup.json";
export const DEFAULT_COVER_HISTORY_LIMIT = 150;
export const DEFAULT_SEEN_COVERS_LIMIT = 800;

let coverHistoryLimit = DEFAULT_COVER_HISTORY_LIMIT;
let seenCoversLimit = DEFAULT_SEEN_COVERS_LIMIT;
let durableCoverHistory: CoverHistoryEntry[] | null = null;
let durableSeenCovers: SeenCoverEntry[] | null = null;
let coverDedupWriteQueue: Promise<void> = Promise.resolve();

interface CoverDedupStorage {
  loadData(name: string): Promise<unknown>;
  saveData(name: string, value: unknown): Promise<unknown>;
}

interface CoverDedupStoragePayload {
  schemaVersion: 1;
  history: CoverHistoryEntry[];
  seen: SeenCoverEntry[];
}

let coverDedupStorage: CoverDedupStorage = plugin as unknown as CoverDedupStorage;

function localCoverHistory(): CoverHistoryEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(COVER_HISTORY_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function localSeenCovers(): SeenCoverEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const parsed = JSON.parse(localStorage.getItem(SEEN_COVERS_KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function mergeStoredEntries<T extends { id: string }>(entries: T[], limit: number, timestamp: (entry: T) => number): T[] {
  const byId = new Map<string, T>();
  for (const entry of entries) {
    if (entry?.id && !byId.has(entry.id)) byId.set(entry.id, entry);
  }
  return [...byId.values()].sort((a, b) => timestamp(b) - timestamp(a)).slice(0, limit);
}

function persistCoverDedupStorage(): void {
  if (!durableCoverHistory || !durableSeenCovers) return;
  const payload: CoverDedupStoragePayload = {
    schemaVersion: 1,
    history: durableCoverHistory,
    seen: durableSeenCovers,
  };
  coverDedupWriteQueue = coverDedupWriteQueue
    .then(async () => { await coverDedupStorage.saveData(COVER_DEDUP_STORAGE_NAME, payload); })
    .catch((error) => { historyLog.warn("Failed to persist cover deduplication storage:", error); });
}

export async function initializeCoverDedupStorage(storage?: CoverDedupStorage): Promise<void> {
  coverDedupStorage = storage || (plugin as unknown as CoverDedupStorage);
  let stored: Partial<CoverDedupStoragePayload> = {};
  try {
    let loaded = await coverDedupStorage.loadData(COVER_DEDUP_STORAGE_NAME);
    if (typeof loaded === "string") loaded = JSON.parse(loaded);
    if (loaded && typeof loaded === "object") stored = loaded as Partial<CoverDedupStoragePayload>;
  } catch (error) {
    historyLog.warn("Failed to load persistent cover deduplication storage:", error);
  }
  durableCoverHistory = mergeStoredEntries(
    [...localCoverHistory(), ...(Array.isArray(stored.history) ? stored.history : [])],
    coverHistoryLimit,
    (entry) => Number(entry.appliedAt) || 0,
  );
  durableSeenCovers = mergeStoredEntries(
    [...localSeenCovers(), ...(Array.isArray(stored.seen) ? stored.seen : [])],
    seenCoversLimit,
    (entry) => Number(entry.seenAt) || 0,
  );
  persistCoverDedupStorage();
  await coverDedupWriteQueue;
  historyLog.info("Initialized persistent cover deduplication storage", {
    history: durableCoverHistory.length,
    seen: durableSeenCovers.length,
  });
}

export function getCoverHistoryLimit(): number {
  return coverHistoryLimit;
}

export function setCoverHistoryLimit(limit: unknown): void {
  const parsed = Number(limit);
  if (Number.isFinite(parsed) && parsed > 0) {
    coverHistoryLimit = Math.floor(parsed);
    const current = getCoverHistory();
    if (current.length > coverHistoryLimit) saveCoverHistory(current);
    historyLog.debug("Cover history limit updated", { limit: coverHistoryLimit, trimmed: current.length - coverHistoryLimit });
  }
}

export function getSeenCoversLimit(): number {
  return seenCoversLimit;
}

export function setSeenCoversLimit(limit: unknown): void {
  const parsed = Number(limit);
  if (Number.isFinite(parsed) && parsed > 0) {
    seenCoversLimit = Math.floor(parsed);
    const current = getSeenCovers();
    if (current.length > seenCoversLimit) saveSeenCovers(current);
    historyLog.debug("Seen cover dedup limit updated", { limit: seenCoversLimit, trimmed: current.length - seenCoversLimit });
  }
}

export function applyCoverLimits(historyLimit?: number, seenLimit?: number): void {
  setCoverHistoryLimit(historyLimit ?? DEFAULT_COVER_HISTORY_LIMIT);
  setSeenCoversLimit(seenLimit ?? DEFAULT_SEEN_COVERS_LIMIT);
  historyLog.debug("Applied cover history and dedup limits", {
    history: getCoverHistoryLimit(),
    seen: getSeenCoversLimit(),
  });
}

export interface SeenCoverEntry {
  id: string;
  docId: string;
  docTitle?: string;
  imageUrl: string;
  /** Original remote image URL when the displayed title image is stored locally. */
  sourceUrl?: string;
  postUrl?: string;
  site?: string;
  postId?: string | number;
  tags?: string[];
  seenAt: number;
}

export function getCoverHistory(): CoverHistoryEntry[] {
  if (durableCoverHistory) return durableCoverHistory;
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(COVER_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    historyLog.warn("Failed to load cover history from localStorage:", e);
    return [];
  }
}

export function saveCoverHistory(list: CoverHistoryEntry[]): void {
  const trimmed = list.slice(0, coverHistoryLimit);
  if (durableCoverHistory) durableCoverHistory = trimmed;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(COVER_HISTORY_KEY, JSON.stringify(trimmed));
    }
  } catch (e) {
    historyLog.warn("Failed to save cover history to localStorage:", e);
  }
  persistCoverDedupStorage();
}

export function recordCoverHistory(entry: Omit<CoverHistoryEntry, "id" | "appliedAt">): void {
  const fullEntry: CoverHistoryEntry = {
    ...entry,
    id: `cov-hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    appliedAt: Date.now(),
  };

  const list = getCoverHistory();
  const nextList = [fullEntry, ...list.filter((it) => it.imageUrl !== fullEntry.imageUrl || it.docId !== fullEntry.docId)].slice(0, coverHistoryLimit);
  saveCoverHistory(nextList);
  historyLog.debug("Recorded cover history entry", {
    id: fullEntry.id,
    docId: fullEntry.docId,
    docTitle: fullEntry.docTitle,
    imageUrl: fullEntry.imageUrl,
    sourceUrl: fullEntry.sourceUrl,
    site: fullEntry.site,
    postId: fullEntry.postId,
    kind: fullEntry.kind || "applied",
  });
}

export function removeCoverHistoryEntry(id: string): CoverHistoryEntry[] {
  const list = getCoverHistory().filter((it) => it.id !== id);
  saveCoverHistory(list);
  return list;
}

export function clearCoverHistory(): void {
  if (durableCoverHistory) durableCoverHistory = [];
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(COVER_HISTORY_KEY);
    historyLog.info("Cleared visible cover history (deduplication memory is kept separately)");
  } catch {}
  persistCoverDedupStorage();
}

export function getSeenCovers(): SeenCoverEntry[] {
  if (durableSeenCovers) return durableSeenCovers;
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(SEEN_COVERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    historyLog.warn("Failed to load seen covers from localStorage:", e);
    return [];
  }
}

export function saveSeenCovers(list: SeenCoverEntry[]): void {
  const trimmed = list.slice(0, seenCoversLimit);
  if (durableSeenCovers) durableSeenCovers = trimmed;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(SEEN_COVERS_KEY, JSON.stringify(trimmed));
    }
  } catch (e) {
    historyLog.warn("Failed to save seen covers to localStorage:", e);
  }
  persistCoverDedupStorage();
}

/**
 * Record a cover into the durable deduplication memory. Unlike the visible
 * history, this store is not cleared by the history UI and has a larger cap.
 * Returns null when the entry carries no usable dedup identity.
 */
export function recordSeenCover(entry: Omit<SeenCoverEntry, "id" | "seenAt">): SeenCoverEntry | null {
  const keys = collectHistoryCoverUrls([entry]);
  if (keys.size === 0) return null;

  const fullEntry: SeenCoverEntry = {
    ...entry,
    id: `cov-seen-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    seenAt: Date.now(),
  };

  const list = getSeenCovers();
  const nextList = [fullEntry, ...list.filter((it) => {
    const existingKeys = collectHistoryCoverUrls([it]);
    for (const key of keys) {
      if (existingKeys.has(key)) return false;
    }
    return true;
  })].slice(0, seenCoversLimit);
  saveSeenCovers(nextList);
  historyLog.debug("Recorded seen cover for deduplication", {
    id: fullEntry.id,
    docId: fullEntry.docId,
    imageUrl: fullEntry.imageUrl,
    sourceUrl: fullEntry.sourceUrl,
    site: fullEntry.site,
    postId: fullEntry.postId,
    keys: [...keys],
  });
  return fullEntry;
}

export function clearSeenCovers(): void {
  if (durableSeenCovers) durableSeenCovers = [];
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(SEEN_COVERS_KEY);
  } catch {}
  persistCoverDedupStorage();
}

import { FSRS_PARAMETER_COUNT, validateFsrsWeights } from "./fsrs-optimizer-protocol";

export const FSRS_WEIGHT_HISTORY_STORAGE = "flashcard/fsrs-weight-history.json";
export const FSRS_WEIGHT_HISTORY_LIMIT = 30;

export interface FsrsWeightHistoryEntry {
  id: string;
  createdAt: number;
  source: "optimizer" | "undo";
  previous: number[];
  next: number[];
}

export interface FsrsWeightHistoryStorage {
  loadData(storageName: string): Promise<unknown>;
  saveData(storageName: string, content: unknown): Promise<unknown>;
}

function parseJson(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
}

function isHistoryEntry(value: unknown): value is FsrsWeightHistoryEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Record<string, unknown>;
  if (typeof entry.id !== "string" || typeof entry.createdAt !== "number") return false;
  if (entry.source !== "optimizer" && entry.source !== "undo") return false;
  if (!Array.isArray(entry.previous) || !Array.isArray(entry.next)) return false;
  try {
    validateFsrsWeights(entry.previous);
    validateFsrsWeights(entry.next);
    return true;
  } catch {
    return false;
  }
}

export function parseFsrsWeightHistory(value: unknown): FsrsWeightHistoryEntry[] {
  const parsed = parseJson(value);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter(isHistoryEntry)
    .map((entry) => ({
      id: entry.id,
      createdAt: entry.createdAt,
      source: entry.source,
      previous: validateFsrsWeights(entry.previous),
      next: validateFsrsWeights(entry.next),
    }))
    .sort((left, right) => right.createdAt - left.createdAt)
    .slice(0, FSRS_WEIGHT_HISTORY_LIMIT);
}

export async function loadFsrsWeightHistory(storage: FsrsWeightHistoryStorage): Promise<FsrsWeightHistoryEntry[]> {
  try {
    return parseFsrsWeightHistory(await storage.loadData(FSRS_WEIGHT_HISTORY_STORAGE));
  } catch {
    return [];
  }
}

export async function saveFsrsWeightHistory(
  storage: FsrsWeightHistoryStorage,
  entries: readonly FsrsWeightHistoryEntry[],
): Promise<void> {
  const normalized = parseFsrsWeightHistory(entries).slice(0, FSRS_WEIGHT_HISTORY_LIMIT);
  await storage.saveData(FSRS_WEIGHT_HISTORY_STORAGE, JSON.stringify(normalized));
}

export async function appendFsrsWeightHistory(
  storage: FsrsWeightHistoryStorage,
  entry: Omit<FsrsWeightHistoryEntry, "id" | "createdAt"> & Partial<Pick<FsrsWeightHistoryEntry, "id" | "createdAt">>,
): Promise<FsrsWeightHistoryEntry[]> {
  const nextEntry: FsrsWeightHistoryEntry = {
    id: entry.id ?? `fsrs-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: entry.createdAt ?? Date.now(),
    source: entry.source,
    previous: validateFsrsWeights(entry.previous),
    next: validateFsrsWeights(entry.next),
  };
  const history = [nextEntry, ...(await loadFsrsWeightHistory(storage))].slice(0, FSRS_WEIGHT_HISTORY_LIMIT);
  await saveFsrsWeightHistory(storage, history);
  return history;
}

export function isFsrsWeightHistoryEntry(value: unknown): value is FsrsWeightHistoryEntry {
  return isHistoryEntry(value) && value.previous.length === FSRS_PARAMETER_COUNT;
}

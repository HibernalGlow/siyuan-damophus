import { plugin } from "@/utils";
import { getLogger } from "@/libs/logger";

const log = getLogger("lets-more-background:favorites");

export const COVER_FAVORITES_STORAGE_NAME = "more_background_cover_favorites.json";
export const COVER_FAVORITES_SCHEMA_VERSION = 1;
export const MAX_COVER_FAVORITES = 2000;

export interface CoverFavorite {
  id: string;
  imageUrl: string;
  postUrl?: string;
  site?: string;
  postId?: string | number;
  tags?: string[];
  width?: number | string;
  height?: number | string;
  sourceScore?: number | string;
  rating: number;
  documentId?: string;
  documentTitle?: string;
  documentPath?: string;
  cachePath?: string;
  addedAt: string;
  updatedAt: string;
  remoteSync?: "unsupported" | "not-configured" | "pending" | "synced" | "failed";
  remoteSyncMessage?: string;
}

export type CoverFavoriteInput = Omit<
  CoverFavorite,
  "id" | "rating" | "addedAt" | "updatedAt" | "remoteSync" | "remoteSyncMessage"
> & { rating?: number };

export interface CoverFavoriteStorage {
  loadData(name: string): Promise<unknown>;
  saveData(name: string, value: unknown): Promise<unknown>;
}

let memoryFavorites: CoverFavorite[] | null = null;
let writeQueue: Promise<void> = Promise.resolve();

function storageOrDefault(storage?: CoverFavoriteStorage): CoverFavoriteStorage {
  return storage || (plugin as unknown as CoverFavoriteStorage);
}

function asText(value: unknown): string | undefined {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function normalizeRating(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(5, Math.round(parsed))) : 0;
}

function normalizeFavorite(value: unknown, index: number): CoverFavorite | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<CoverFavorite>;
  const imageUrl = asText(raw.imageUrl);
  if (!imageUrl) return null;
  const now = new Date().toISOString();
  const tags = Array.isArray(raw.tags)
    ? raw.tags.map((tag) => String(tag).trim()).filter(Boolean)
    : undefined;
  return {
    id: asText(raw.id) || `cover-favorite-${Date.now()}-${index}`,
    imageUrl,
    postUrl: asText(raw.postUrl),
    site: asText(raw.site),
    postId: raw.postId === undefined || raw.postId === null || raw.postId === "" ? undefined : raw.postId,
    tags: tags?.length ? tags : undefined,
    width: raw.width,
    height: raw.height,
    sourceScore: raw.sourceScore,
    rating: normalizeRating(raw.rating),
    documentId: asText(raw.documentId),
    documentTitle: asText(raw.documentTitle),
    documentPath: asText(raw.documentPath),
    cachePath: asText(raw.cachePath),
    addedAt: asText(raw.addedAt) || now,
    updatedAt: asText(raw.updatedAt) || now,
    remoteSync: raw.remoteSync,
    remoteSyncMessage: asText(raw.remoteSyncMessage),
  };
}

export function coverFavoriteKey(value: Pick<CoverFavoriteInput, "imageUrl" | "postUrl" | "site" | "postId">): string {
  const postKey = value.site && value.postId ? `${value.site}:${value.postId}` : "";
  return postKey || asText(value.postUrl) || value.imageUrl.trim();
}

function parseFavorites(raw: unknown): CoverFavorite[] {
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
  const result: CoverFavorite[] = [];
  const seen = new Set<string>();
  source.forEach((item, index) => {
    const normalized = normalizeFavorite(item, index);
    if (!normalized) return;
    const key = coverFavoriteKey(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    result.push(normalized);
  });
  return result.slice(0, MAX_COVER_FAVORITES);
}

export async function loadCoverFavorites(storage?: CoverFavoriteStorage): Promise<CoverFavorite[]> {
  if (memoryFavorites) return memoryFavorites.map((item) => ({ ...item, tags: item.tags ? [...item.tags] : undefined }));
  try {
    memoryFavorites = parseFavorites(await storageOrDefault(storage).loadData(COVER_FAVORITES_STORAGE_NAME));
  } catch (error) {
    log.warn("Failed to load cover favorites:", error);
    memoryFavorites = [];
  }
  return memoryFavorites.map((item) => ({ ...item, tags: item.tags ? [...item.tags] : undefined }));
}

export async function saveCoverFavorites(
  favorites: CoverFavorite[],
  storage?: CoverFavoriteStorage,
): Promise<void> {
  const normalized = parseFavorites(favorites);
  memoryFavorites = normalized;
  const target = storageOrDefault(storage);
  writeQueue = writeQueue.then(async () => {
    await target.saveData(COVER_FAVORITES_STORAGE_NAME, {
      schemaVersion: COVER_FAVORITES_SCHEMA_VERSION,
      items: normalized,
      updatedAt: new Date().toISOString(),
    });
  });
  await writeQueue;
}

export async function upsertCoverFavorite(
  input: CoverFavoriteInput,
  storage?: CoverFavoriteStorage,
): Promise<CoverFavorite> {
  const current = await loadCoverFavorites(storage);
  const key = coverFavoriteKey(input);
  const existingIndex = current.findIndex((item) => coverFavoriteKey(item) === key);
  const now = new Date().toISOString();
  const existing = existingIndex >= 0 ? current[existingIndex] : undefined;
  const favorite: CoverFavorite = {
    ...existing,
    ...input,
    id: existing?.id || `cover-favorite-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    imageUrl: input.imageUrl.trim(),
    rating: normalizeRating(input.rating ?? existing?.rating),
    addedAt: existing?.addedAt || now,
    updatedAt: now,
    remoteSync: existing?.remoteSync || "unsupported",
  };
  const next = existingIndex >= 0
    ? current.map((item, index) => (index === existingIndex ? favorite : item))
    : [favorite, ...current];
  await saveCoverFavorites(next, storage);
  return favorite;
}

export async function removeCoverFavorite(id: string, storage?: CoverFavoriteStorage): Promise<CoverFavorite[]> {
  const current = await loadCoverFavorites(storage);
  const next = current.filter((item) => item.id !== id);
  await saveCoverFavorites(next, storage);
  return next;
}

export async function updateCoverFavorite(
  id: string,
  patch: Partial<Pick<CoverFavorite, "rating" | "remoteSync" | "remoteSyncMessage">>,
  storage?: CoverFavoriteStorage,
): Promise<CoverFavorite | null> {
  const current = await loadCoverFavorites(storage);
  const found = current.find((item) => item.id === id);
  if (!found) return null;
  const updated = { ...found, ...patch, rating: normalizeRating(patch.rating ?? found.rating), updatedAt: new Date().toISOString() };
  await saveCoverFavorites(current.map((item) => (item.id === id ? updated : item)), storage);
  return updated;
}

export async function clearCoverFavoritesCache(): Promise<void> {
  memoryFavorites = null;
}


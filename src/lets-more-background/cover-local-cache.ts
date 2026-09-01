import { getLogger } from "@/libs/logger";
import {
  extractBlockIdFromDocumentLink,
  maintainDocumentTree,
  type LegacyCoverMaintenanceResult,
} from "./local-cover-cache-maintenance";
import { proxyFetchImageBlob } from "./booru";
import { collectCacheIndexCoverUrls } from "./cover-dedup";

const dedupLog = getLogger("lets-more-background:dedup");

/** Block attributes recording the remote source URL and local cache path of a cover. */
export const COVER_SOURCE_ATTRIBUTE = "custom-damophus-cover-source-url";
export const COVER_CACHE_ATTRIBUTE = "custom-damophus-cover-cache-path";

export type CoverCacheMaxEdge = "none" | "1280" | "1920" | "2560";

export const LOCAL_CACHE_QUALITY = 75;
export const DEFAULT_LOCAL_CACHE_ROOT = "/storage/petal/siyuan-damophus/more-background/covers";
export const DEFAULT_LOCAL_CACHE_PATH_TEMPLATE = "{year}/{month}/{hash}.webp";
const SYNCIGNORE_PATH = "/data/.siyuan/syncignore";
const LOCAL_CACHE_INDEX_NAME = "index.json";

const objectUrls = new WeakMap<HTMLImageElement, string>();

function generateTimestampId(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function cacheHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function normalizeLocalCacheRoot(root: string): string {
  const normalized = String(root || DEFAULT_LOCAL_CACHE_ROOT).replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutData = normalized.replace(/^\/?data\//i, "");
  const safe = withoutData.split("/").filter((segment) => segment && segment !== "." && segment !== "..").join("/");
  return `/data/${safe || DEFAULT_LOCAL_CACHE_ROOT.replace(/^\//, "")}`;
}

function sanitizeTemplateValue(value: unknown, fallback = "unknown"): string {
  const text = String(value ?? "").trim().replace(/[\\/:*?"<>|\s]+/g, "-");
  return text || fallback;
}

export function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function inferCoverSourceFromImage(image: HTMLImageElement): string | null {
  const candidate = image.currentSrc || image.src || "";
  return isRemoteImageUrl(candidate) ? candidate.trim() : null;
}

/**
 * Captures an already-loaded <img> as a Blob via canvas. Returns null when the
 * element is unusable or the canvas is tainted by a cross-origin image without
 * CORS headers; callers fall back to re-fetching the URL in that case.
 */
export async function extractImageElementBlob(image: HTMLImageElement): Promise<Blob | null> {
  try {
    if (!image.naturalWidth || !image.naturalHeight) return null;
    const canvas = document.createElement("canvas");
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0);
    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((blob) => resolve(blob), "image/webp", 0.92);
    });
  } catch {
    return null;
  }
}

export interface LocalCachePathContext {
  sourceUrl: string;
  maxEdge: CoverCacheMaxEdge;
  site?: string;
  postId?: string | number;
  now?: Date;
}

export function localCachePath(root: string, template: string, context: LocalCachePathContext): string {
  const now = context.now ?? new Date();
  const sourceHash = cacheHash(`${context.sourceUrl}|${context.maxEdge}|webp-q${LOCAL_CACHE_QUALITY}`);
  const values: Record<string, string> = {
    hash: sourceHash,
    sourceHash,
    year: String(now.getFullYear()),
    month: String(now.getMonth() + 1).padStart(2, "0"),
    day: String(now.getDate()).padStart(2, "0"),
    site: sanitizeTemplateValue(context.site, "source"),
    postId: sanitizeTemplateValue(context.postId, "unknown"),
    maxEdge: context.maxEdge,
    quality: String(LOCAL_CACHE_QUALITY),
    ext: "webp",
  };
  const rendered = String(template || DEFAULT_LOCAL_CACHE_PATH_TEMPLATE).replace(/\{([a-zA-Z]+)\}/g, (_, key: string) => values[key] ?? "");
  const safeRelative = rendered.split("/").map((segment) => sanitizeTemplateValue(segment, "cover")).join("/");
  const filename = safeRelative.toLowerCase().endsWith(".webp") ? safeRelative : `${safeRelative}.webp`;
  return `${normalizeLocalCacheRoot(root)}/${filename}`;
}

export async function convertToWebp(blob: Blob, maxEdge: CoverCacheMaxEdge): Promise<Blob> {
  if (typeof document === "undefined" || typeof createImageBitmap === "undefined") return blob;
  const bitmap = await createImageBitmap(blob);
  const edge = maxEdge === "none" ? 0 : Number(maxEdge);
  const scale = edge > 0 ? Math.min(1, edge / Math.max(bitmap.width, bitmap.height)) : 1;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("Canvas 2D context is unavailable");
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => {
      if (result && result.size > 0) resolve(result);
      else reject(new Error("WebP conversion failed"));
    }, "image/webp", LOCAL_CACHE_QUALITY / 100);
  });
}

export async function readLocalCache(path: string): Promise<Blob | null> {
  try {
    const response = await fetch("/api/file/getFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!response.ok || response.status === 202) return null;
    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch {
    return null;
  }
}

export interface LocalCacheIndexEntry {
  path: string;
  sourceUrl: string;
  createdAt: string;
  maxEdge: CoverCacheMaxEdge;
  quality: number;
  site?: string;
  postId?: string | number;
  width?: number;
  height?: number;
  size?: number;
}

async function readTextFile(path: string): Promise<string> {
  try {
    const response = await fetch("/api/file/getFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    if (!response.ok || response.status === 202) return "";
    return await response.text();
  } catch {
    return "";
  }
}

async function putTextFile(path: string, content: string): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append("path", path);
    formData.append("isDir", "false");
    formData.append("file", new Blob([content], { type: "text/plain;charset=utf-8" }), path.split("/").pop() || "file.txt");
    const response = await fetch("/api/file/putFile", { method: "POST", body: formData });
    const data = await response.json();
    return data.code === 0;
  } catch {
    return false;
  }
}

export async function ensureSyncIgnore(root: string): Promise<void> {
  const relativeRoot = normalizeLocalCacheRoot(root).replace(/^\/data\//i, "");
  if (!relativeRoot) return;
  const current = await readTextFile(SYNCIGNORE_PATH);
  const lines = current.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const rule = `${relativeRoot}/**/*`;
  if (!lines.includes(rule)) {
    lines.push(rule);
    await putTextFile(SYNCIGNORE_PATH, `${lines.join("\n")}\n`);
  }
}

export async function updateLocalCacheIndex(root: string, entry: LocalCacheIndexEntry): Promise<void> {
  const cacheRoot = normalizeLocalCacheRoot(root);
  const indexPath = `${cacheRoot}/${LOCAL_CACHE_INDEX_NAME}`;
  const raw = await readTextFile(indexPath);
  let entries: LocalCacheIndexEntry[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed as LocalCacheIndexEntry[];
  } catch {
    entries = [];
  }
  const next = [entry, ...entries.filter((item) => item.path !== entry.path)].slice(0, 1000);
  await putTextFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
}

export async function removeLocalCacheIndexEntry(root: string, path: string): Promise<void> {
  const cacheRoot = normalizeLocalCacheRoot(root);
  const indexPath = `${cacheRoot}/${LOCAL_CACHE_INDEX_NAME}`;
  const raw = await readTextFile(indexPath);
  let entries: LocalCacheIndexEntry[] = [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) entries = parsed as LocalCacheIndexEntry[];
  } catch {
    return;
  }
  const next = entries.filter((item) => item.path !== path);
  if (next.length === entries.length) return;
  await putTextFile(indexPath, `${JSON.stringify(next, null, 2)}\n`);
}

export async function loadLocalCacheDedupUrls(root: string): Promise<Set<string>> {
  const indexPath = `${normalizeLocalCacheRoot(root)}/${LOCAL_CACHE_INDEX_NAME}`;
  const raw = await readTextFile(indexPath);
  if (!raw) return new Set();
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? collectCacheIndexCoverUrls(parsed as LocalCacheIndexEntry[]) : new Set();
  } catch (error) {
    dedupLog.warn("Failed to parse local cover cache index for deduplication:", error);
    return new Set();
  }
}

export function displayLocalCache(image: HTMLImageElement, blob: Blob): void {
  const previous = objectUrls.get(image);
  if (previous) URL.revokeObjectURL(previous);
  const objectUrl = URL.createObjectURL(blob);
  objectUrls.set(image, objectUrl);
  image.src = objectUrl;
}

export function releaseLocalCacheObjectUrl(image: HTMLImageElement): void {
  const objectUrl = objectUrls.get(image);
  if (!objectUrl) return;
  URL.revokeObjectURL(objectUrl);
  objectUrls.delete(image);
}

export async function detectImageTypeAndName(blob: Blob): Promise<{ type: string; name: string }> {
  const buffer = await blob.slice(0, 4).arrayBuffer();
  const view = new Uint8Array(buffer);
  const hex = Array.from(view)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  switch (hex) {
    case "89504E47":
      return { type: "image/png", name: `${generateTimestampId()}.png` };
    case "FFD8FFDB":
    case "FFD8FFE0":
    case "FFD8FFE1":
    case "FFD8FFE2":
    case "FFD8FFE3":
      return { type: "image/jpeg", name: `${generateTimestampId()}.jpg` };
    case "47494638":
      return { type: "image/gif", name: `${generateTimestampId()}.gif` };
    case "52494646":
      return { type: "image/webp", name: `${generateTimestampId()}.webp` };
    case "3C737667":
      return { type: "image/svg+xml", name: `${generateTimestampId()}.svg` };
    case "0000000C":
      return { type: "image/avif", name: `${generateTimestampId()}.avif` };
    default:
      return { type: "image/png", name: `${generateTimestampId()}.png` };
  }
}

/** Ensures a cover area with a lazy/hidden placeholder image becomes visible. */
export function triggerRandomIfNoImg(currentPage: HTMLElement): void {
  currentPage
    .querySelector(".protyle-background__img > img.fn__none")
    ?.classList.remove("fn__none");
  currentPage
    .querySelector(".protyle-background")
    ?.setAttribute("style", "min-height: 30vh;");
  currentPage
    .querySelector(
      '.protyle-background__img > .protyle-icons > span[data-type="position"]',
    )
    ?.classList.remove("fn__none");
}

export interface CoverCacheConfig {
  localCache: boolean;
  localCacheRoot: string;
  localCachePathTemplate: string;
  localCacheMaxEdge: CoverCacheMaxEdge;
}

/**
 * Walks every block of a document (see maintainDocumentTree) and mirrors its
 * remote cover into the local WebP cache, rewriting the block attrs to point
 * at the cached copy.
 */
export async function maintainDocumentCoverCache(
  config: CoverCacheConfig,
  documentLink: string,
): Promise<LegacyCoverMaintenanceResult> {
  if (!config.localCache) throw new Error("Local cover cache is disabled");
  const rootId = extractBlockIdFromDocumentLink(documentLink);
  if (!rootId) throw new Error("A valid SiYuan document link or block ID is required");
  return maintainDocumentTree(rootId, {
    getAttrs: async (id) => {
      const response = await fetch("/api/attr/getBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const data = await response.json();
      return (data?.data || {}) as Record<string, string>;
    },
    cacheRemoteCover: async (_id, sourceUrl, attrs) => {
      const cachePath = localCachePath(config.localCacheRoot, config.localCachePathTemplate, {
        sourceUrl,
        maxEdge: config.localCacheMaxEdge,
        site: attrs["custom-damophus-post-site"],
        postId: attrs["custom-damophus-post-id"],
      });
      await ensureSyncIgnore(config.localCacheRoot);
      if (await readLocalCache(cachePath)) return cachePath;

      let blob = await proxyFetchImageBlob(sourceUrl);
      if (!blob || blob.size === 0) {
        const response = await fetch(sourceUrl, { referrerPolicy: "no-referrer" });
        if (response.ok) blob = await response.blob();
      }
      if (!blob || blob.size === 0) return null;
      const processed = await convertToWebp(blob, config.localCacheMaxEdge);
      await ensureSyncIgnore(config.localCacheRoot);
      if (!await uploadLocalCacheBlob(processed, cachePath)) return null;
      await updateLocalCacheIndex(config.localCacheRoot, {
        path: cachePath,
        sourceUrl,
        createdAt: new Date().toISOString(),
        maxEdge: config.localCacheMaxEdge,
        quality: LOCAL_CACHE_QUALITY,
        site: attrs["custom-damophus-post-site"],
        postId: attrs["custom-damophus-post-id"],
        size: processed.size,
      });
      return cachePath;
    },
    setAttrs: async (id, attrs) => {
      await fetch("/api/attr/setBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, attrs }),
      });
    },
  });
}

export async function uploadLocalCacheBlob(blob: Blob, path: string): Promise<boolean> {
  try {
    const formData = new FormData();
    formData.append("path", path);
    formData.append("file", blob, path.split("/").pop() || "cover.webp");
    formData.append("isDir", "false");
    const res = await fetch("/api/file/putFile", { method: "POST", body: formData });
    const data = await res.json();
    return data.code === 0;
  } catch {
    return false;
  }
}

import { confirm, Dialog, Menu, showMessage } from "siyuan";
import { isMobile, plugin } from "@/utils";
import { getLogger } from "@/libs/logger";
import {
  openCoverTagViewer,
  mountCoverHoverOverlay,
} from "./tag-viewer";
import {
  type CoverSourceItem,
  type CoverHistoryEntry,
  DEFAULT_COVER_SOURCES,
  DEFAULT_BLACKLISTED_TAGS,
  formatCoverUrl,
  isVideoUrl,
  sanitizeAssetsPath,
  type SiteCredential,
} from "./sources";
import { isBooruSource, proxyFetchImageBlob, resolveBooruImageInfo, resolveManualBooruUrl, type BooruResolvedInfo } from "./booru";
import { settings } from "@/settings";
import {
  cleanupLocalCoverCache,
  extractBlockIdFromDocumentLink,
  maintainDocumentTree,
  type LegacyCoverMaintenanceResult,
} from "./local-cover-cache-maintenance";
import {
  collectHistoryCoverUrls,
  collectUsedCoverUrls,
  loadUsedCoverUrls,
  normalizeCoverAssetPath,
  normalizeCoverUrl,
} from "./cover-dedup";
import { sql } from "@/api";
import { getHPathByID } from "@/api";
import {
  coverFavoriteKey,
  loadCoverFavorites,
  removeCoverFavorite,
  upsertCoverFavorite,
  type CoverFavoriteInput,
} from "./cover-favorites";

const log = getLogger("lets-more-background");
const dedupLog = getLogger("lets-more-background:dedup");
const historyLog = getLogger("lets-more-background:history");
const BUTTON_ATTR = "data-damophus-more-background";
const COVER_LAYOUT_STYLE_ID = "damophus-more-background-layout-style";
const LOCAL_CACHE_QUALITY = 75;
const DEFAULT_LOCAL_CACHE_ROOT = "/storage/petal/siyuan-damophus/more-background/covers";
const DEFAULT_LOCAL_CACHE_PATH_TEMPLATE = "{year}/{month}/{hash}.webp";
const SYNCIGNORE_PATH = "/data/.siyuan/syncignore";
const LOCAL_CACHE_INDEX_NAME = "index.json";
const COVER_SOURCE_ATTRIBUTE = "custom-damophus-cover-source-url";
const COVER_CACHE_ATTRIBUTE = "custom-damophus-cover-cache-path";
export const COVER_POSITION_ATTRIBUTE = "custom-damophus-cover-position";
const FAVORITE_BUTTON_ATTR = "data-damophus-cover-favorite";
const FAVORITES_CHANGED_EVENT = "damophus-cover-favorites-changed";
const objectUrls = new WeakMap<HTMLImageElement, string>();

function setNativeSymbolIcon(host: HTMLElement, symbol: string): void {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  const use = document.createElementNS("http://www.w3.org/2000/svg", "use");
  use.setAttribute("href", `#${symbol}`);
  use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", `#${symbol}`);
  svg.appendChild(use);
  host.replaceChildren(svg);
}

export type CoverToolbarPosition = "adaptive" | "belowTags" | "belowIcon" | "native" | "custom";

export interface MoreBackgroundOptions {
  width: number;
  height: number;
  assetsLocation: string;
  readFromAssets: boolean;
  writeToAssets: boolean;
  localCache: boolean;
  autoCacheLegacyCovers: boolean;
  purgeCacheOnCoverChange?: boolean;
  localCacheRoot: string;
  localCachePathTemplate: string;
  localCacheMaxEdge: "none" | "1280" | "1920" | "2560";
  directDrag?: boolean;
  toolbarPosition?: CoverToolbarPosition;
  toolbarCustomX?: number;
  toolbarCustomY?: number;
  coverBreadcrumb?: boolean;
  coverDocumentMenu?: boolean;
  confirmRemoveCover?: boolean;
  autoAddCoverOnEmptyDoc?: boolean;
  autoRetryOnFailure?: boolean;
  deduplicateNewCovers?: boolean;
  coverHistoryLimit?: number;
  coverSeenLimit?: number;
  blacklistedTags?: string;
  siteCredentials?: SiteCredential[];
  sources?: CoverSourceItem[];
  t: (key: string) => string;
}

export interface MoreBackgroundHandle {
  scanRoot(root: HTMLElement): void;
  disposeRoot(root: HTMLElement): void;
  dispose(): void;
  updateOptions(options: MoreBackgroundOptions): void;
  maintainLocalCache(documentLink: string): Promise<LegacyCoverMaintenanceResult>;
  cleanupLocalCache(): Promise<{ removed: number; kept: number }>;
}

const coverLayoutCss = `
.protyle[data-damophus-cover-layer="raised"] > .protyle-breadcrumb { position: relative; z-index: auto; }
.protyle[data-damophus-cover-layer="raised"] .protyle-background { z-index: 2; }
.protyle[data-damophus-cover-layer="raised"] .av__header { position: relative !important; z-index: 3 !important; }
.protyle[data-damophus-cover-layer="raised"] .av__views { z-index: 3 !important; }
/* Neo+ IDE hides the native toolbar and reserves the first 42px for document tabs.
   Attribute-view tabs are fixed to the viewport, so keep them below that tab strip. */
.neo-ide-body.body--toolbar-hide .av__views--fixed { top: 42px !important; }
.protyle[data-damophus-cover-breadcrumb="preserve"] > .protyle-breadcrumb > .protyle-breadcrumb__bar,
.protyle[data-damophus-cover-breadcrumb="preserve"] > .protyle-breadcrumb > .protyle-breadcrumb__space { position: relative; z-index: 3; }
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="readonly"],
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="doc"],
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="more"],
.protyle[data-damophus-cover-menu="preserve"] > .protyle-breadcrumb > [data-type="context"] { position: relative; z-index: 3; }
.protyle-icons[data-damophus-cover-toolbar] { opacity: 0; pointer-events: none; transition: opacity .2s ease-in-out; }
.protyle-top:hover .protyle-icons[data-damophus-cover-toolbar],
.protyle-background:hover .protyle-icons[data-damophus-cover-toolbar] { opacity: 1; pointer-events: auto; }
.protyle-icons[data-damophus-cover-toolbar="belowIcon"] { position: static; width: max-content; max-width: 100%; margin: 0 0 8px; }
.protyle-icons[data-damophus-cover-toolbar="custom"] { position: absolute; right: auto; left: var(--damophus-cover-toolbar-x); top: var(--damophus-cover-toolbar-y); transform: translate(var(--damophus-cover-toolbar-offset-x), var(--damophus-cover-toolbar-offset-y)); }
`;

function clampPercent(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : fallback;
}

/** Read the vertical cover position from a SiYuan title-img declaration. */
export function parseCoverPosition(value: unknown): number | null {
  const text = String(value ?? "")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&amp;/gi, "&");
  const match = text.match(/(?:object|background)-position\s*:\s*(?:[^;\s]+\s+)?(-?\d+(?:\.\d+)?)\s*%/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

export function normalizeCoverPosition(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? Math.max(0, Math.min(100, parsed)) : null;
}

export function serializeCoverPosition(value: unknown): string | null {
  const normalized = normalizeCoverPosition(value);
  return normalized === null ? null : String(Number(normalized.toFixed(2)));
}

async function assertAttrWriteSucceeded(response: Response): Promise<void> {
  let body: { code?: number } | null = null;
  try { body = await response.json() as { code?: number }; } catch { /* some test hosts return an empty body */ }
  if (response.ok === false || (typeof body?.code === "number" && body.code !== 0)) {
    throw new Error(`setBlockAttrs failed (${body?.code ?? response.status})`);
  }
}

export function applyCoverLayout(root: HTMLElement, options: Pick<MoreBackgroundOptions,
  "toolbarPosition" | "toolbarCustomX" | "toolbarCustomY" | "coverBreadcrumb" | "coverDocumentMenu"
>): () => void {
  const background = root.querySelector<HTMLElement>(".protyle-background");
  const imageContainer = background?.querySelector<HTMLElement>(".protyle-background__img");
  const toolbar = background?.querySelector<HTMLElement>(
    '.protyle-icons[data-damophus-cover-toolbar], .protyle-background__img > .protyle-icons',
  );
  if (!background || !imageContainer || !toolbar) return () => {};

  const position: CoverToolbarPosition = options.toolbarPosition === "native" || options.toolbarPosition === "custom"
    ? options.toolbarPosition
    : "belowIcon";
  const placeholder = document.createComment("damophus-cover-toolbar");
  toolbar.before(placeholder);

  toolbar.dataset.damophusCoverToolbar = position;
  const customX = clampPercent(options.toolbarCustomX, 50);
  const customY = clampPercent(options.toolbarCustomY, 15);
  toolbar.style.setProperty("--damophus-cover-toolbar-x", `${customX}%`);
  toolbar.style.setProperty("--damophus-cover-toolbar-y", `${customY}%`);
  toolbar.style.setProperty("--damophus-cover-toolbar-offset-x", `${-customX}%`);
  toolbar.style.setProperty("--damophus-cover-toolbar-offset-y", `${-customY}%`);

  if (position === "belowIcon") {
    const infoArea = background.querySelector<HTMLElement>(".protyle-background__ia");
    const tags = infoArea?.querySelector<HTMLElement>(".b3-chips__doctag");
    if (infoArea) infoArea.insertBefore(toolbar, tags ?? infoArea.querySelector(".protyle-background__action"));
  } else if (toolbar.parentElement !== imageContainer) {
    imageContainer.prepend(toolbar);
  }

  const raised = options.coverBreadcrumb === true || options.coverDocumentMenu === true;
  root.dataset.damophusCoverLayer = raised ? "raised" : "native";
  root.dataset.damophusCoverBreadcrumb = options.coverBreadcrumb === true ? "cover" : "preserve";
  root.dataset.damophusCoverMenu = options.coverDocumentMenu === true ? "cover" : "preserve";

  return () => {
    if (placeholder.parentNode) placeholder.replaceWith(toolbar);
    toolbar.removeAttribute("data-damophus-cover-toolbar");
    toolbar.style.removeProperty("--damophus-cover-toolbar-x");
    toolbar.style.removeProperty("--damophus-cover-toolbar-y");
    toolbar.style.removeProperty("--damophus-cover-toolbar-offset-x");
    toolbar.style.removeProperty("--damophus-cover-toolbar-offset-y");
    root.removeAttribute("data-damophus-cover-layer");
    root.removeAttribute("data-damophus-cover-breadcrumb");
    root.removeAttribute("data-damophus-cover-menu");
  };
}

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

function normalizeLocalCacheRoot(root: string): string {
  const normalized = String(root || DEFAULT_LOCAL_CACHE_ROOT).replace(/\\/g, "/").replace(/\/+/g, "/");
  const withoutData = normalized.replace(/^\/?data\//i, "");
  const safe = withoutData.split("/").filter((segment) => segment && segment !== "." && segment !== "..").join("/");
  return `/data/${safe || DEFAULT_LOCAL_CACHE_ROOT.replace(/^\//, "")}`;
}

function sanitizeTemplateValue(value: unknown, fallback = "unknown"): string {
  const text = String(value ?? "").trim().replace(/[\\/:*?"<>|\s]+/g, "-");
  return text || fallback;
}

function isRemoteImageUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

export function inferCoverSourceFromImage(image: HTMLImageElement): string | null {
  const candidate = image.currentSrc || image.src || "";
  return isRemoteImageUrl(candidate) ? candidate.trim() : null;
}

export interface LocalCachePathContext {
  sourceUrl: string;
  maxEdge: MoreBackgroundOptions["localCacheMaxEdge"];
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

async function convertToWebp(blob: Blob, maxEdge: MoreBackgroundOptions["localCacheMaxEdge"]): Promise<Blob> {
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

async function readLocalCache(path: string): Promise<Blob | null> {
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

interface LocalCacheIndexEntry {
  path: string;
  sourceUrl: string;
  createdAt: string;
  maxEdge: MoreBackgroundOptions["localCacheMaxEdge"];
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

async function ensureSyncIgnore(root: string): Promise<void> {
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

async function updateLocalCacheIndex(root: string, entry: LocalCacheIndexEntry): Promise<void> {
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

async function removeLocalCacheIndexEntry(root: string, path: string): Promise<void> {
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

async function loadDedupCoverUrls(background?: HTMLElement): Promise<Set<string>> {
  const databaseUrls = await loadUsedCoverUrls();
  const historyUrls = collectHistoryCoverUrls(getCoverHistory());
  const seenUrls = collectHistoryCoverUrls(getSeenCovers());
  const urls = new Set<string>([...databaseUrls, ...historyUrls, ...seenUrls]);
  dedupLog.info("Loaded cover deduplication set", {
    database: databaseUrls.size,
    history: historyUrls.size,
    seen: seenUrls.size,
    total: urls.size,
  });
  dedupLog.debug("Deduplication set entries", [...urls].slice(0, 80));

  // The current document may have been changed before history was introduced,
  // or before the history write completed. Include its live attrs as a final
  // exclusion source so it cannot be selected immediately again.
  if (background) {
    const blockId =
      background.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
      "";
    const rows: Array<{ block_id?: string; name?: string; value?: string }> = [];
    if (blockId) {
      try {
        const response = await fetch("/api/attr/getBlockAttrs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: blockId }),
        });
        const data = await response.json();
        const attrs = (data?.data || {}) as Record<string, string>;
        for (const name of [
          COVER_SOURCE_ATTRIBUTE,
          "title-img",
          "custom-title-img",
          "custom-damophus-post-site",
          "custom-damophus-post-id",
        ]) {
          if (attrs[name]) rows.push({ block_id: blockId, name, value: attrs[name] });
        }
      } catch (error) {
        dedupLog.debug("Failed to load current cover attrs for deduplication:", error);
      }
    }
    const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
    const liveSource =
      background.getAttribute(COVER_SOURCE_ATTRIBUTE) ||
      image?.dataset.damophusOriginalUrl ||
      image?.getAttribute("data-damophus-post-image-url") ||
      "";
    if (liveSource) rows.push({ block_id: blockId, name: COVER_SOURCE_ATTRIBUTE, value: liveSource });
    const liveSite = background.getAttribute("data-damophus-post-site") || image?.getAttribute("data-damophus-post-site") || "";
    const livePostId = background.getAttribute("data-damophus-post-id") || image?.getAttribute("data-damophus-post-id") || "";
    if (liveSite) rows.push({ block_id: blockId, name: "custom-damophus-post-site", value: liveSite });
    if (livePostId) rows.push({ block_id: blockId, name: "custom-damophus-post-id", value: livePostId });
    const liveUrls = collectUsedCoverUrls(rows);
    for (const url of liveUrls) urls.add(url);
    dedupLog.debug("Added live current-cover attrs to deduplication set", { blockId, liveRows: rows.length, liveUrls: liveUrls.size, total: urls.size });
  }
  return urls;
}

function displayLocalCache(image: HTMLImageElement, blob: Blob): void {
  const previous = objectUrls.get(image);
  if (previous) URL.revokeObjectURL(previous);
  const objectUrl = URL.createObjectURL(blob);
  objectUrls.set(image, objectUrl);
  image.src = objectUrl;
}

async function detectImageTypeAndName(blob: Blob): Promise<{ type: string; name: string }> {
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

function triggerRandomIfNoImg(currentPage: HTMLElement): void {
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

const LAST_USED_SOURCE_KEY = "damophus_more_background_last_used_source";
let memoryLastUsedSource: CoverSourceItem | null = null;

export function getLastUsedSource(): CoverSourceItem | null {
  if (memoryLastUsedSource) return memoryLastUsedSource;
  try {
    if (typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(LAST_USED_SOURCE_KEY);
      if (raw) {
        memoryLastUsedSource = JSON.parse(raw);
        return memoryLastUsedSource;
      }
    }
  } catch {}
  return null;
}

export function updateAllLastUsedButtons(item: CoverSourceItem): void {
  if (typeof document === "undefined") return;
  const lastLabel = item.label ? `${item.label}` : "上次使用的模板";
  const newTitle = `使用上次配置: ${lastLabel}`;
  const buttons = document.querySelectorAll<HTMLElement>('[data-type="more-background-last"]');
  buttons.forEach((btn) => {
    if (btn.title !== newTitle) {
      btn.title = newTitle;
    }
    const labelSpan = btn.querySelector<HTMLElement>(".damophus-last-label");
    if (labelSpan) {
      if (labelSpan.textContent !== `⚡ ${lastLabel}`) {
        labelSpan.textContent = `⚡ ${lastLabel}`;
      }
    } else {
      if (btn.tagName === "BUTTON") {
        btn.innerHTML = `<svg><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;
      } else {
        btn.innerHTML = `<svg class="svg"><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;
      }
    }
  });
}

export function setLastUsedSource(item: CoverSourceItem): void {
  memoryLastUsedSource = item;
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(LAST_USED_SOURCE_KEY, JSON.stringify(item));
    }
  } catch {}
  updateAllLastUsedButtons(item);
}

export const COVER_HISTORY_KEY = "damophus_more_background_cover_history";
export const SEEN_COVERS_KEY = "damophus_more_background_seen_covers";
export const DEFAULT_COVER_HISTORY_LIMIT = 150;
export const DEFAULT_SEEN_COVERS_LIMIT = 800;

let coverHistoryLimit = DEFAULT_COVER_HISTORY_LIMIT;
let seenCoversLimit = DEFAULT_SEEN_COVERS_LIMIT;

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

function applyCoverLimits(options: MoreBackgroundOptions): void {
  setCoverHistoryLimit(options.coverHistoryLimit ?? DEFAULT_COVER_HISTORY_LIMIT);
  setSeenCoversLimit(options.coverSeenLimit ?? DEFAULT_SEEN_COVERS_LIMIT);
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
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(COVER_HISTORY_KEY, JSON.stringify(list.slice(0, coverHistoryLimit)));
  } catch (e) {
    historyLog.warn("Failed to save cover history to localStorage:", e);
  }
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
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(COVER_HISTORY_KEY);
    historyLog.info("Cleared visible cover history (deduplication memory is kept separately)");
  } catch {}
}

export function getSeenCovers(): SeenCoverEntry[] {
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
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(SEEN_COVERS_KEY, JSON.stringify(list.slice(0, seenCoversLimit)));
  } catch (e) {
    historyLog.warn("Failed to save seen covers to localStorage:", e);
  }
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
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.removeItem(SEEN_COVERS_KEY);
  } catch {}
}

export function checkAndAutoAddCover(root: HTMLElement, controller: MoreBackgroundController): void {
  const opts = controller.getOptions();
  if (opts.autoAddCoverOnEmptyDoc !== true) return;

  const bg = root.querySelector<HTMLElement>(".protyle-background");
  const img = bg?.querySelector("img");
  const hasCoverImg = img && img.getAttribute("src");
  if (hasCoverImg) return;

  const blockId =
    bg?.getAttribute("data-node-id") ||
    root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
    root.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

  if (!blockId) return;

  if (root.hasAttribute("data-damophus-auto-cover-attempted")) return;
  root.setAttribute("data-damophus-auto-cover-attempted", "true");

  const sources = opts.sources?.length ? opts.sources : DEFAULT_COVER_SOURCES;
  const lastUsed = getLastUsedSource() || sources[0];
  if (lastUsed) {
    setTimeout(() => {
      if (!root.isConnected) return;
      const currentBg = root.querySelector<HTMLElement>(".protyle-background") || root;
      void controller.applyRandomSource(lastUsed, root, currentBg);
    }, 200);
  }
}

export function ensureNoReferrerMeta(): void {
  if (typeof document === "undefined") return;
  let meta = document.querySelector<HTMLMetaElement>('meta[name="referrer"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "referrer";
    meta.content = "no-referrer";
    document.head.appendChild(meta);
  } else if (meta.content !== "no-referrer") {
    meta.content = "no-referrer";
  }
}

export class MoreBackgroundController implements MoreBackgroundHandle {
  private options: MoreBackgroundOptions;
  private readonly rootCleanups = new Map<HTMLElement, () => void>();

  constructor(options: MoreBackgroundOptions) {
    this.options = options;
    applyCoverLimits(options);
    ensureNoReferrerMeta();
    if (!document.getElementById(COVER_LAYOUT_STYLE_ID)) {
      const style = document.createElement("style");
      style.id = COVER_LAYOUT_STYLE_ID;
      style.textContent = coverLayoutCss;
      document.head.append(style);
    }
  }

  getOptions(): MoreBackgroundOptions {
    return this.options;
  }

  updateOptions(options: MoreBackgroundOptions): void {
    this.options = options;
    applyCoverLimits(options);
    for (const root of [...this.rootCleanups.keys()]) this.scanRoot(root);
  }

  async maintainLocalCache(documentLink: string): Promise<LegacyCoverMaintenanceResult> {
    if (!this.options.localCache) throw new Error("Local cover cache is disabled");
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
        const cachePath = localCachePath(this.options.localCacheRoot, this.options.localCachePathTemplate, {
          sourceUrl,
          maxEdge: this.options.localCacheMaxEdge,
          site: attrs["custom-damophus-post-site"],
          postId: attrs["custom-damophus-post-id"],
        });
        await ensureSyncIgnore(this.options.localCacheRoot);
        if (await readLocalCache(cachePath)) return cachePath;

        let blob = await proxyFetchImageBlob(sourceUrl);
        if (!blob || blob.size === 0) {
          const response = await fetch(sourceUrl, { referrerPolicy: "no-referrer" });
          if (response.ok) blob = await response.blob();
        }
        if (!blob || blob.size === 0) return null;
        const processed = await convertToWebp(blob, this.options.localCacheMaxEdge);
        await ensureSyncIgnore(this.options.localCacheRoot);
        if (!await this.uploadToLocalCache(processed, cachePath)) return null;
        await updateLocalCacheIndex(this.options.localCacheRoot, {
          path: cachePath,
          sourceUrl,
          createdAt: new Date().toISOString(),
          maxEdge: this.options.localCacheMaxEdge,
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

  async cleanupLocalCache(): Promise<{ removed: number; kept: number }> {
    if (!this.options.localCache) throw new Error("Local cover cache is disabled");
    return cleanupLocalCoverCache(this.options.localCacheRoot);
  }

  private async purgeCoverCacheFile(cachePath: string, exceptBlockId?: string): Promise<void> {
    if (!cachePath) return;
    try {
      const escaped = cachePath.replace(/'/g, "''");
      const blockFilter = exceptBlockId
        ? ` AND block_id != '${exceptBlockId.replace(/'/g, "''")}'`
        : "";
      const rows = await sql(
        `SELECT block_id FROM attributes WHERE name = '${COVER_CACHE_ATTRIBUTE}' AND value = '${escaped}'${blockFilter}`,
      );
      if (Array.isArray(rows) && rows.length > 0) {
        log.debug("Skip purging cover cache still referenced by other documents:", cachePath);
        return;
      }
      const response = await fetch("/api/file/removeFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: cachePath }),
      });
      const data = await response.json();
      if (data?.code === 0) {
        await removeLocalCacheIndexEntry(this.options.localCacheRoot, cachePath);
        log.info("Purged local cover cache file:", cachePath);
      }
    } catch (error) {
      log.warn("Failed to purge local cover cache file:", error);
    }
  }

  private async reconcileCoverCache(background: HTMLElement): Promise<void> {
    if (!this.options.localCache) return;
    if (!background.isConnected) return;
    const blockId =
      background.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id");
    if (!blockId) return;
    try {
      const response = await fetch("/api/attr/getBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId }),
      });
      const data = await response.json();
      const attrs = (data?.data || {}) as Record<string, string>;
      const sourceUrl = attrs[COVER_SOURCE_ATTRIBUTE] || "";
      const cachePath = attrs[COVER_CACHE_ATTRIBUTE] || "";
      if (!sourceUrl && !cachePath) return;
      const titleImage = attrs["title-img"] || "";
      const titleUrl = normalizeCoverUrl(titleImage);
      const sourceNorm = normalizeCoverUrl(sourceUrl);
      const titleAssetPath = normalizeCoverAssetPath(titleImage);
      const cacheAssetPath = normalizeCoverAssetPath(cachePath);
      const titleMatchesCache = Boolean(titleAssetPath && cacheAssetPath && titleAssetPath === cacheAssetPath);
      if (titleMatchesCache || (titleUrl && sourceNorm && titleUrl === sourceNorm)) return;
      // title cover was removed or replaced via native controls → custom attrs are stale
      await fetch("/api/attr/setBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: blockId,
          attrs: {
            [COVER_SOURCE_ATTRIBUTE]: "",
            [COVER_CACHE_ATTRIBUTE]: "",
            "custom-damophus-post-tags": "",
            "custom-damophus-post-site": "",
            "custom-damophus-post-id": "",
            "custom-damophus-post-url": "",
            "custom-damophus-post-score": "",
            "custom-damophus-post-dimensions": "",
          },
        }),
      });
      log.info("Cleared stale cover metadata after native title cover change:", blockId);
      if (cachePath && this.options.purgeCacheOnCoverChange) {
        await this.purgeCoverCacheFile(cachePath, blockId);
      }
    } catch (error) {
      log.debug("Failed to reconcile cover cache:", error);
    }
  }

  private initCoverCacheReconciler(background: HTMLElement): () => void {
    const targets = new Set<Element>();
    const img = background.querySelector<HTMLImageElement>(".protyle-background__img img");
    const imgContainer = background.querySelector<HTMLElement>(".protyle-background__img");
    if (img) targets.add(img);
    if (imgContainer) targets.add(imgContainer);
    if (targets.size === 0) return () => {};
    let timer: ReturnType<typeof setTimeout> | null = null;
    const observer = new MutationObserver(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void this.reconcileCoverCache(background);
      }, 600);
    });
    for (const target of targets) {
      observer.observe(target, { attributes: true, attributeFilter: ["src", "class"] });
    }
    return () => {
      if (timer) clearTimeout(timer);
      observer.disconnect();
    };
  }

  scanRoot(root: HTMLElement): void {
    if (!root || !root.isConnected) return;
    this.disposeRoot(root);

    const cleanups: Array<() => void> = [];

    cleanups.push(applyCoverLayout(root, this.options));

    // 1. 初始化标题栏与题头图控制按钮
    const coverControlsCleanup = this.initTitleCoverControls(root);
    cleanups.push(coverControlsCleanup);
    void this.hydrateLocalCache(root).finally(() => {
      const background = root.querySelector<HTMLElement>(".protyle-background");
      if (background) void this.restoreCoverPosition(background);
    });
    cleanups.push(() => this.releaseLocalCache(root));

    // 2. 初始化视频背景与题头图多合一位置调整 (Alt拖拽/长按/滚轮/直接拖)
    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (background) {
      const bgCleanup = this.initVideoBackground(background);
      cleanups.push(bgCleanup);
      const cacheReconcileCleanup = this.initCoverCacheReconciler(background);
      cleanups.push(cacheReconcileCleanup);
      const posCleanup = this.initCoverPositionControls(background);
      cleanups.push(posCleanup);
      void this.restoreCoverPosition(background);
      const tagOverlayCleanup = this.initCoverTagOverlay(root);
      cleanups.push(tagOverlayCleanup);
    }

    // 3. 画廊视频观察器
    const wysiwyg = root.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (wysiwyg) {
      const galleryCleanup = this.observeGalleryVideos(wysiwyg);
      cleanups.push(galleryCleanup);
    }

    // 4. 自动为无题头图文档添加题头图
    checkAndAutoAddCover(root, this);

    this.rootCleanups.set(root, () => {
      for (const cleanup of cleanups) {
        try {
          cleanup();
        } catch (e) {
          log.warn("Error cleaning up root:", e);
        }
      }
    });
  }

  private async restoreCoverPosition(background: HTMLElement): Promise<void> {
    const blockId =
      background.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id");
    if (!blockId || !background.isConnected) {
      log.debug("restore position skipped", { blockId, connected: background.isConnected });
      return;
    }
    try {
      log.debug("restore position: reading attrs", { blockId });
      const response = await fetch("/api/attr/getBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId }),
      });
      if (!response.ok) {
        log.warn("restore position: attr read failed", { blockId, status: response.status });
        return;
      }
      const data = await response.json();
      const attrs = (data?.data || {}) as Record<string, string>;
      const position = normalizeCoverPosition(attrs[COVER_POSITION_ATTRIBUTE]) ?? parseCoverPosition(
        attrs["title-img"] || attrs["custom-title-img"],
      );
      log.debug("restore position: attrs received", {
        blockId,
        storedPosition: attrs[COVER_POSITION_ATTRIBUTE] ?? null,
        titleImg: attrs["title-img"] ?? null,
        parsedPosition: position,
      });
      if (position === null) return;
      const media = [...background.querySelectorAll<HTMLElement>(
        ".protyle-background__img img, .protyle-background__video",
      )];
      if (media.length === 0) {
        log.warn("restore position: media not found", { blockId });
        return;
      }
      const objectPosition = `center ${Number(position.toFixed(2))}%`;
      media.forEach((element) => { element.style.objectPosition = objectPosition; });
      log.info("restore position: applied", { blockId, position, mediaCount: media.length });
      if (attrs[COVER_POSITION_ATTRIBUTE] !== serializeCoverPosition(position)) {
        await this.persistCoverPosition(blockId, position);
      }
    } catch (error) {
      log.error("restore position failed", { blockId, error });
    }
  }

  private async persistCoverPosition(blockId: string, position: number): Promise<void> {
    const serialized = serializeCoverPosition(position);
    if (serialized === null) return;
    log.info("persist position: writing attr", { blockId, position, serialized });
    try {
      const response = await fetch("/api/attr/setBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId, attrs: { [COVER_POSITION_ATTRIBUTE]: serialized } }),
      });
      await assertAttrWriteSucceeded(response);
      log.info("persist position: write succeeded", { blockId, position, status: response.status });
    } catch (error) {
      log.error("persist position: write failed", { blockId, position, error });
      throw error;
    }
  }

  disposeRoot(root: HTMLElement): void {
    const cleanup = this.rootCleanups.get(root);
    if (cleanup) {
      cleanup();
      this.rootCleanups.delete(root);
    }
  }

  dispose(): void {
    for (const [, cleanup] of this.rootCleanups) {
      try {
        cleanup();
      } catch (e) {
        log.warn("Error during dispose:", e);
      }
    }
    this.rootCleanups.clear();
    document.getElementById(COVER_LAYOUT_STYLE_ID)?.remove();
  }

  private initTitleCoverControls(root: HTMLElement): () => void {
    const injectButtons = () => {
      if (!root.isConnected) return;
      const sources = this.options.sources?.length ? this.options.sources : DEFAULT_COVER_SOURCES;
      const lastUsed = getLastUsedSource() || sources[0];

      // 1. 未添加题头图时：在 .protyle-background__action / .protyle-background__tags 注入按钮
      const actionContainers = root.querySelectorAll<HTMLElement>(
        ".protyle-background__action, .protyle-background__tags",
      );

      actionContainers.forEach((container) => {
        if (container.querySelector("[data-damophus-more-background-title-btn]")) return;

        const isButtonType = container.classList.contains("protyle-background__action");
        const randomBtn =
          container.querySelector<HTMLElement>('[data-type="random"]') ||
          container.querySelector<HTMLElement>('[data-type="background"]') ||
          container.querySelector<HTMLElement>('[data-type="tag"]') ||
          (container.lastElementChild as HTMLElement);

        const lastLabel = lastUsed?.label ? `${lastUsed.label}` : this.options.t("lets-more-background.useLastTemplate");
        const chooseLabel = this.options.t("lets-more-background.chooseTemplate");

        if (isButtonType) {
          // 按钮 1: ⚡ 使用上次配置 (一键出图，无需二次点击)
          const lastBtn = document.createElement("button");
          lastBtn.className = "b3-button b3-button--cancel";
          lastBtn.setAttribute("data-damophus-more-background-title-btn", "true");
          lastBtn.setAttribute("data-type", "more-background-last");
          lastBtn.title = `使用上次配置: ${lastLabel}`;
          lastBtn.innerHTML = `<svg><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;

          // 按钮 2: 🎨 选择模板 (弹出菜单)
          const menuBtn = document.createElement("button");
          menuBtn.className = "b3-button b3-button--cancel";
          menuBtn.setAttribute("data-damophus-more-background-title-btn", "true");
          menuBtn.setAttribute("data-type", "more-background-menu");
          menuBtn.title = chooseLabel;
          menuBtn.innerHTML = `<svg><use xlink:href="#iconImage"></use></svg><span>${chooseLabel}</span>`;

          if (randomBtn) {
            randomBtn.after(menuBtn);
            randomBtn.after(lastBtn);
          } else {
            container.appendChild(lastBtn);
            container.appendChild(menuBtn);
          }

          lastBtn.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const currentSources = this.options.sources?.length ? this.options.sources : DEFAULT_COVER_SOURCES;
            const currentLast = getLastUsedSource() || currentSources[0];
            if (currentLast) {
              const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
              void this.applyRandomSource(currentLast, root, bg);
            }
          });

          menuBtn.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = menuBtn.getBoundingClientRect();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            this.showBackgroundMenu(rect, root, bg);
          });
        } else {
          // 标签风格
          const spanLast = document.createElement("span");
          spanLast.className = "protyle-background__tag protyle-background__tag--text";
          spanLast.setAttribute("data-damophus-more-background-title-btn", "true");
          spanLast.setAttribute("data-type", "more-background-last");
          spanLast.style.cursor = "pointer";
          spanLast.title = `使用上次配置: ${lastLabel}`;
          spanLast.innerHTML = `<svg class="svg"><use xlink:href="#iconRefresh"></use></svg><span class="damophus-last-label">⚡ ${lastLabel}</span>`;

          const spanMenu = document.createElement("span");
          spanMenu.className = "protyle-background__tag protyle-background__tag--text";
          spanMenu.setAttribute("data-damophus-more-background-title-btn", "true");
          spanMenu.setAttribute("data-type", "more-background-menu");
          spanMenu.style.cursor = "pointer";
          spanMenu.title = chooseLabel;
          spanMenu.innerHTML = `<svg class="svg"><use xlink:href="#iconImage"></use></svg><span>${chooseLabel}</span>`;

          if (randomBtn) {
            randomBtn.after(spanMenu);
            randomBtn.after(spanLast);
          } else {
            container.appendChild(spanLast);
            container.appendChild(spanMenu);
          }

          spanLast.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const currentSources = this.options.sources?.length ? this.options.sources : DEFAULT_COVER_SOURCES;
            const currentLast = getLastUsedSource() || currentSources[0];
            if (currentLast) {
              const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
              void this.applyRandomSource(currentLast, root, bg);
            }
          });

          spanMenu.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const rect = spanMenu.getBoundingClientRect();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            this.showBackgroundMenu(rect, root, bg);
          });
        }
      });

      // 2. 已有题头图时：注入右上角操作条中的随机图源按钮与 Tag 详情按钮 (.protyle-icons)
      const topIcons = root.querySelectorAll<HTMLElement>(
        ".protyle-top .protyle-icons, .protyle-background .protyle-icons, .protyle-background__img .protyle-icons",
      );
      topIcons.forEach((iconsContainer) => {
        const firstIcon =
          iconsContainer.querySelector(".protyle-icon.ariaLabel") || iconsContainer.firstElementChild;
        if (!firstIcon) return;

        if (!iconsContainer.querySelector(`[${BUTTON_ATTR}]`)) {
          // 按钮 1: 随机换图 / 模板菜单
          const button = document.createElement("span");
          button.className = "protyle-icon ariaLabel";
          button.setAttribute(BUTTON_ATTR, "true");
          button.setAttribute("data-link", "more-background");
          button.setAttribute("aria-label", this.options.t("lets-more-background.moreBackgroundBtn"));
          button.innerHTML = '<svg><use xlink:href="#iconImage"></use></svg>';

          button.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            this.showBackgroundMenu(rect, root, bg);
          });

          // 按钮 2: Tag 标签查看按钮
          const tagButton = document.createElement("span");
          tagButton.className = "protyle-icon ariaLabel";
          tagButton.setAttribute(BUTTON_ATTR, "true");
          tagButton.setAttribute("data-link", "more-background-tag");
          tagButton.setAttribute("aria-label", "查看题头图 Tag 标签 (中英对照)");
          tagButton.innerHTML = '<svg><use xlink:href="#iconTag"></use></svg>';

          tagButton.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            this.openTagViewerForBackground(bg);
          });

          firstIcon.before(button);
          firstIcon.before(tagButton);
        }

        if (!iconsContainer.querySelector(`[${FAVORITE_BUTTON_ATTR}]`)) {
          const favoriteButton = document.createElement("span");
          favoriteButton.className = "protyle-icon ariaLabel";
          favoriteButton.setAttribute(FAVORITE_BUTTON_ATTR, "true");
          favoriteButton.setAttribute("aria-label", "收藏当前题头图");
          favoriteButton.title = "收藏当前题头图（再次点击取消收藏）";
          setNativeSymbolIcon(favoriteButton, "iconStar");
          favoriteButton.addEventListener("click", (e: MouseEvent) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
            void this.toggleCoverFavorite(root, bg, favoriteButton);
          });
          firstIcon.before(favoriteButton);
          const bg = root.querySelector<HTMLElement>(".protyle-background") || root;
          void this.refreshFavoriteButton(root, bg, favoriteButton);
        }
      });
    };

    injectButtons();

    // 局部事件代理：仅当鼠标进入 header / background / title 区域时才检查是否需要补全按钮
    const handleHeaderMouse = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".protyle-background, .protyle-top, .protyle-title")) {
        injectButtons();
      }
    };

    const backgroundEl = root.querySelector<HTMLElement>(".protyle-background");
    const topEl = root.querySelector<HTMLElement>(".protyle-top");
    const titleEl = root.querySelector<HTMLElement>(".protyle-title");

    backgroundEl?.addEventListener("mouseover", handleHeaderMouse, { passive: true });
    topEl?.addEventListener("mouseover", handleHeaderMouse, { passive: true });
    titleEl?.addEventListener("mouseover", handleHeaderMouse, { passive: true });

    const approvedNativeRemovals = new WeakSet<Element>();
    const handleNativeRemove = (event: MouseEvent) => {
      if (this.options.confirmRemoveCover === false) return;
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>('[data-type="remove"]')
        : null;
      if (!target || !backgroundEl?.contains(target)) return;
      if (approvedNativeRemovals.has(target)) {
        approvedNativeRemovals.delete(target);
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      confirm(
        this.options.t("lets-more-background.confirmRemoveCoverTitle"),
        this.options.t("lets-more-background.confirmRemoveCoverDescription"),
        () => {
          approvedNativeRemovals.add(target);
          target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
        },
      );
    };

    backgroundEl?.addEventListener("click", handleNativeRemove, true);

    // 针对 background / top 的轻量级 MutationObserver（使用 rAF 节流，绝不 observe root 或 wysiwyg）
    let bgObserver: MutationObserver | null = null;
    let scheduledRaf = 0;
    const scheduleInject = () => {
      if (scheduledRaf) return;
      scheduledRaf = requestAnimationFrame(() => {
        scheduledRaf = 0;
        injectButtons();
      });
    };

    if (backgroundEl) {
      bgObserver = new MutationObserver(() => {
        scheduleInject();
      });
      bgObserver.observe(backgroundEl, {
        childList: true,
        subtree: true,
      });
    }

    return () => {
      if (scheduledRaf) cancelAnimationFrame(scheduledRaf);
      if (bgObserver) bgObserver.disconnect();
      backgroundEl?.removeEventListener("mouseover", handleHeaderMouse);
      topEl?.removeEventListener("mouseover", handleHeaderMouse);
      titleEl?.removeEventListener("mouseover", handleHeaderMouse);
      backgroundEl?.removeEventListener("click", handleNativeRemove, true);
      const injected = root.querySelectorAll(
        `[${BUTTON_ATTR}], [${FAVORITE_BUTTON_ATTR}], [data-damophus-more-background-title-btn]`,
      );
      injected.forEach((el) => el.remove());
    };
  }

  private openTagViewerForBackground(background: HTMLElement): void {
    const currentPostTags =
      background.getAttribute("data-damophus-post-tags") ||
      background.querySelector("img")?.getAttribute("data-damophus-post-tags") ||
      "";
    const currentPostUrl =
      background.getAttribute("data-damophus-post-url") ||
      background.querySelector("img")?.getAttribute("data-damophus-post-url") ||
      "";
    const currentPostSite = background.getAttribute("data-damophus-post-site") || "";
    const currentPostId = background.getAttribute("data-damophus-post-id") || "";
    const currentDimensions = background.getAttribute("data-damophus-post-dimensions") || "";
    const currentScore = background.getAttribute("data-damophus-post-score") || "";
    openCoverTagViewer({
      site: currentPostSite,
      postId: currentPostId,
      postUrl: currentPostUrl,
      tags: currentPostTags,
      score: currentScore,
      width: currentDimensions ? currentDimensions.split("×")[0]?.trim() : "",
      height: currentDimensions ? currentDimensions.split("×")[1]?.trim() : "",
    });
  }

  private findCoverBlockId(root: HTMLElement, background: HTMLElement): string {
    return background.getAttribute("data-node-id") ||
      root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
      root.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id") ||
      "";
  }

  private async getCoverFavoriteInput(root: HTMLElement, background: HTMLElement): Promise<CoverFavoriteInput | null> {
    const blockId = this.findCoverBlockId(root, background);
    if (!blockId) return null;
    let attrs: Record<string, string> = {};
    try {
      const response = await fetch("/api/attr/getBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId }),
      });
      const data = await response.json();
      attrs = (data?.data || {}) as Record<string, string>;
    } catch {}

    const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
    const sourceUrl = attrs[COVER_SOURCE_ATTRIBUTE] ||
      background.getAttribute(COVER_SOURCE_ATTRIBUTE) ||
      background.getAttribute("data-damophus-post-image-url") ||
      image?.getAttribute("data-damophus-post-image-url") ||
      (image?.currentSrc && /^https?:\/\//i.test(image.currentSrc) ? image.currentSrc : "");
    const titleImage = attrs["title-img"] || "";
    const titleRemoteUrl = normalizeCoverUrl(titleImage);
    const sourceRemoteUrl = normalizeCoverUrl(sourceUrl);
    const currentSourceUrl = titleRemoteUrl && sourceRemoteUrl && titleRemoteUrl !== sourceRemoteUrl
      ? titleRemoteUrl
      : sourceUrl;
    const cachePath = attrs[COVER_CACHE_ATTRIBUTE] || background.getAttribute(COVER_CACHE_ATTRIBUTE) || "";
    const imageUrl = currentSourceUrl || cachePath || titleRemoteUrl || image?.currentSrc || image?.src || "";
    if (!imageUrl) return null;
    const dimensions = attrs["custom-damophus-post-dimensions"] || background.getAttribute("data-damophus-post-dimensions") || "";
    const [width, height] = dimensions.split("×").map((value) => value?.trim()).filter(Boolean);
    const documentTitle = root.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim();
    let documentPath: string | undefined;
    try {
      documentPath = await getHPathByID(blockId);
    } catch {}
    const rawTags = attrs["custom-damophus-post-tags"] || background.getAttribute("data-damophus-post-tags") || "";
    return {
      imageUrl,
      postUrl: attrs["custom-damophus-post-url"] || background.getAttribute("data-damophus-post-url") || undefined,
      site: attrs["custom-damophus-post-site"] || background.getAttribute("data-damophus-post-site") || undefined,
      postId: attrs["custom-damophus-post-id"] || background.getAttribute("data-damophus-post-id") || undefined,
      tags: rawTags.split(/\s+/).filter(Boolean),
      width,
      height,
      sourceScore: attrs["custom-damophus-post-score"] || background.getAttribute("data-damophus-post-score") || undefined,
      documentId: blockId,
      documentTitle,
      documentPath,
      cachePath: cachePath || undefined,
    };
  }

  private async refreshFavoriteButton(root: HTMLElement, background: HTMLElement, button: HTMLElement): Promise<void> {
    const input = await this.getCoverFavoriteInput(root, background);
    if (!input) return;
    const favorites = await loadCoverFavorites();
    const favorite = favorites.some((item) => coverFavoriteKey(item) === coverFavoriteKey(input));
    button.dataset.favorited = favorite ? "true" : "false";
    button.setAttribute("aria-label", favorite ? "取消收藏当前题头图" : "收藏当前题头图");
    button.title = favorite ? "已收藏当前题头图（再次点击取消收藏）" : "收藏当前题头图（再次点击取消收藏）";
    button.style.color = favorite ? "var(--b3-theme-primary)" : "";
  }

  private async ensureFavoriteCache(input: CoverFavoriteInput): Promise<CoverFavoriteInput> {
    if (input.cachePath || !isRemoteImageUrl(input.imageUrl)) return input;
    try {
      let blob = await proxyFetchImageBlob(input.imageUrl);
      if (!blob || blob.size === 0) {
        const response = await fetch(input.imageUrl, { referrerPolicy: "no-referrer" });
        if (response.ok) blob = await response.blob();
      }
      if (!blob || blob.size === 0) return input;
      const processed = await convertToWebp(blob, this.options.localCacheMaxEdge);
      const cachePath = localCachePath(this.options.localCacheRoot, this.options.localCachePathTemplate, {
        sourceUrl: input.imageUrl,
        maxEdge: this.options.localCacheMaxEdge,
        site: input.site,
        postId: input.postId,
      });
      await ensureSyncIgnore(this.options.localCacheRoot);
      if (!await this.uploadToLocalCache(processed, cachePath)) return input;
      await updateLocalCacheIndex(this.options.localCacheRoot, {
        path: cachePath,
        sourceUrl: input.imageUrl,
        createdAt: new Date().toISOString(),
        maxEdge: this.options.localCacheMaxEdge,
        quality: LOCAL_CACHE_QUALITY,
        site: input.site,
        postId: input.postId,
        width: input.width ? Number(input.width) : undefined,
        height: input.height ? Number(input.height) : undefined,
        size: processed.size,
      });
      return { ...input, cachePath };
    } catch (error) {
      log.warn("Failed to cache explicitly favorited cover:", error);
      return input;
    }
  }

  private async toggleCoverFavorite(root: HTMLElement, background: HTMLElement, button: HTMLElement): Promise<void> {
    const rawInput = await this.getCoverFavoriteInput(root, background);
    if (!rawInput) {
      showMessage("当前题头图没有可保存的图片地址");
      return;
    }
    const favorites = await loadCoverFavorites();
    const existing = favorites.find((item) => coverFavoriteKey(item) === coverFavoriteKey(rawInput));
    if (existing) {
      await removeCoverFavorite(existing.id);
      showMessage("已取消收藏题头图");
    } else {
      const input = await this.ensureFavoriteCache(rawInput);
      await upsertCoverFavorite(input);
      showMessage(input.cachePath
        ? "题头图已收藏，网址、文档和本地缓存信息已保存"
        : "题头图已收藏，网址和文档信息已保存");
    }
    await this.refreshFavoriteButton(root, background, button);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
  }

  private initVideoBackground(background: HTMLElement): () => void {
    const img = background.querySelector<HTMLImageElement>("img");
    let videoObserver: MutationObserver | null = null;

    if (img) {
      const checkAndRenderVideo = () => {
        const src = img.getAttribute("src");
        if (src && isVideoUrl(src)) {
          this.renderVideoBackground(background, src);
        } else {
          this.removeVideoBackground(background);
        }
      };

      checkAndRenderVideo();

      videoObserver = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          if (mutation.type === "attributes" && mutation.attributeName === "src") {
            checkAndRenderVideo();
          }
        }
      });

      videoObserver.observe(img, {
        attributes: true,
        attributeFilter: ["src"],
      });
    }

    return () => {
      if (videoObserver) {
        videoObserver.disconnect();
      }
      this.removeVideoBackground(background);
    };
  }

  private initCoverTagOverlay(root: HTMLElement): () => void {
    const background = root.querySelector<HTMLElement>(".protyle-background") || root;
    const topContainer = root.querySelector<HTMLElement>(".protyle-top") || root;
    const actionContainer =
      root.querySelector<HTMLElement>(".protyle-background__tags") ||
      root.querySelector<HTMLElement>(".protyle-background__action") ||
      topContainer;

    let overlayHost = actionContainer.querySelector<HTMLElement>(".damophus-cover-tag-overlay-host");
    if (!overlayHost) {
      overlayHost = document.createElement("div");
      overlayHost.className = "damophus-cover-tag-overlay-host";
      overlayHost.style.display = "inline-flex";
      overlayHost.style.alignItems = "center";
      overlayHost.style.verticalAlign = "middle";
      overlayHost.style.flexWrap = "wrap";
      overlayHost.style.gap = "6px";
      overlayHost.style.marginLeft = "4px";
      actionContainer.appendChild(overlayHost);
    }

    let unmountOverlay: (() => void) | null = null;

    const updateOverlay = () => {
      if (!root.isConnected) return;
      let rawTags =
        background.getAttribute("data-damophus-post-tags") ||
        background.querySelector("img")?.getAttribute("data-damophus-post-tags") ||
        root.getAttribute("data-damophus-post-tags") ||
        "";

      let site = background.getAttribute("data-damophus-post-site") || root.getAttribute("data-damophus-post-site") || "";
      let postId = background.getAttribute("data-damophus-post-id") || root.getAttribute("data-damophus-post-id") || "";
      let postUrl =
        background.getAttribute("data-damophus-post-url") ||
        background.querySelector("img")?.getAttribute("data-damophus-post-url") ||
        root.getAttribute("data-damophus-post-url") ||
        "";
      let score = background.getAttribute("data-damophus-post-score") || root.getAttribute("data-damophus-post-score") || "";
      let dimensions = background.getAttribute("data-damophus-post-dimensions") || root.getAttribute("data-damophus-post-dimensions") || "";

      if (!rawTags) {
        const blockId =
          background.getAttribute("data-node-id") ||
          root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
          root.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

        if (blockId && !background.hasAttribute("data-damophus-checked-attrs")) {
          background.setAttribute("data-damophus-checked-attrs", "true");
          void fetch("/api/attr/getBlockAttrs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: blockId }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (res.code === 0 && res.data && res.data["custom-damophus-post-tags"]) {
                const attrs = res.data;
                background.setAttribute("data-damophus-post-tags", attrs["custom-damophus-post-tags"]);
                if (attrs["custom-damophus-post-site"]) background.setAttribute("data-damophus-post-site", attrs["custom-damophus-post-site"]);
                if (attrs["custom-damophus-post-id"]) background.setAttribute("data-damophus-post-id", attrs["custom-damophus-post-id"]);
                if (attrs["custom-damophus-post-url"]) background.setAttribute("data-damophus-post-url", attrs["custom-damophus-post-url"]);
                if (attrs["custom-damophus-post-score"]) background.setAttribute("data-damophus-post-score", attrs["custom-damophus-post-score"]);
                if (attrs["custom-damophus-post-dimensions"]) background.setAttribute("data-damophus-post-dimensions", attrs["custom-damophus-post-dimensions"]);
                updateOverlay();
              }
            })
            .catch(() => {});
        }

        if (unmountOverlay) {
          unmountOverlay();
          unmountOverlay = null;
        }
        return;
      }

      if (unmountOverlay) {
        unmountOverlay();
        unmountOverlay = null;
      }

      unmountOverlay = mountCoverHoverOverlay(overlayHost!, {
        tags: rawTags,
        site,
        postId,
        postUrl,
        score,
        width: dimensions ? dimensions.split("×")[0]?.trim() : "",
        height: dimensions ? dimensions.split("×")[1]?.trim() : "",
      });
    };

    updateOverlay();

    const observer = new MutationObserver(() => updateOverlay());
    observer.observe(background, {
      attributes: true,
      attributeFilter: ["data-damophus-post-tags", "data-damophus-post-url", "data-damophus-post-site"],
    });

    return () => {
      observer.disconnect();
      if (unmountOverlay) {
        unmountOverlay();
        unmountOverlay = null;
      }
      overlayHost?.remove();
    };
  }

  private showBackgroundMenu(rect: DOMRect, root: HTMLElement, background: HTMLElement): void {
    const menu = new Menu("DamophusMoreBackground");
    const sources = this.options.sources?.length ? this.options.sources : DEFAULT_COVER_SOURCES;

    const currentPostTags =
      background.getAttribute("data-damophus-post-tags") ||
      background.querySelector("img")?.getAttribute("data-damophus-post-tags") ||
      "";
    const currentPostUrl =
      background.getAttribute("data-damophus-post-url") ||
      background.querySelector("img")?.getAttribute("data-damophus-post-url") ||
      "";
    const currentPostSite = background.getAttribute("data-damophus-post-site") || "";
    const currentPostId = background.getAttribute("data-damophus-post-id") || "";
    const currentDimensions = background.getAttribute("data-damophus-post-dimensions") || "";
    const currentScore = background.getAttribute("data-damophus-post-score") || "";

    if (currentPostTags || currentPostUrl) {
      menu.addItem({
        label: "🏷️ 查看当前题头图 Tag 标签 (中英对照)",
        icon: "iconTag",
        click: () => {
          openCoverTagViewer({
            site: currentPostSite,
            postId: currentPostId,
            postUrl: currentPostUrl,
            tags: currentPostTags,
            score: currentScore,
            width: currentDimensions ? currentDimensions.split("×")[0]?.trim() : "",
            height: currentDimensions ? currentDimensions.split("×")[1]?.trim() : "",
          });
        },
      });

      if (currentPostUrl) {
        menu.addItem({
          label: "🌐 打开当前题头图原帖 (Booru Post ↗)",
          icon: "iconLink",
          click: () => {
            window.open(currentPostUrl, "_blank");
          },
        });
      }
      menu.addSeparator();
    }

    sources.forEach((item) => {
      if (!item.label && !item.url) return;
      menu.addItem({
        label: item.label || item.url,
        icon: "iconImage",
        click: () => this.applyRandomSource(item, root, background),
      });
    });

    menu.addSeparator();

    const isAutoCover = this.options.autoAddCoverOnEmptyDoc === true;
    menu.addItem({
      label: `${isAutoCover ? "✓ " : ""}${this.options.t("lets-more-background.autoAddCoverOnEmptyDoc")}`,
      icon: "iconSparkles",
      click: () => {
        const nextVal = !isAutoCover;
        this.options.autoAddCoverOnEmptyDoc = nextVal;
        try {
          settings.setBySpace("moreBackground", "autoAddCoverOnEmptyDoc", nextVal);
          void settings.save();
        } catch {}
        showMessage(this.options.t(nextVal
          ? "lets-more-background.autoAddCoverOnEmptyDocEnabled"
          : "lets-more-background.autoAddCoverOnEmptyDocDisabled"));
      },
    });

    const isAutoRetry = this.options.autoRetryOnFailure !== false;
    menu.addItem({
      label: `${isAutoRetry ? "✓ " : ""}${this.options.t("lets-more-background.autoRetryOnFailure")}`,
      icon: "iconRefresh",
      click: () => {
        const nextVal = !isAutoRetry;
        this.options.autoRetryOnFailure = nextVal;
        try {
          settings.setBySpace("moreBackground", "autoRetryOnFailure", nextVal);
          void settings.save();
        } catch {}
        showMessage(this.options.t(nextVal
          ? "lets-more-background.autoRetryOnFailureEnabled"
          : "lets-more-background.autoRetryOnFailureDisabled"));
      },
    });

    const isDeduplicationEnabled = this.options.deduplicateNewCovers !== false;
    menu.addItem({
      label: `${isDeduplicationEnabled ? "✓ " : ""}${this.options.t("lets-more-background.deduplicateNewCovers")}`,
      icon: "iconFilter",
      click: () => {
        const nextVal = !isDeduplicationEnabled;
        this.options.deduplicateNewCovers = nextVal;
        try {
          settings.setBySpace("moreBackground", "deduplicateNewCovers", nextVal);
          void settings.save();
        } catch {}
        showMessage(this.options.t(nextVal
          ? "lets-more-background.deduplicateNewCoversEnabled"
          : "lets-more-background.deduplicateNewCoversDisabled"));
      },
    });

    if (this.options.localCache) {
      const isPurgeEnabled = this.options.purgeCacheOnCoverChange === true;
      menu.addItem({
        label: `${isPurgeEnabled ? "✓ " : ""}${this.options.t("lets-more-background.purgeCacheOnCoverChange")}`,
        icon: "iconTrashcan",
        click: () => {
          const nextVal = !isPurgeEnabled;
          this.options.purgeCacheOnCoverChange = nextVal;
          try {
            settings.setBySpace("moreBackground", "purgeCacheOnCoverChange", nextVal);
            void settings.save();
          } catch {}
          showMessage(this.options.t(nextVal
            ? "lets-more-background.purgeCacheOnCoverChangeEnabled"
            : "lets-more-background.purgeCacheOnCoverChangeDisabled"));
        },
      });
    }

    menu.addSeparator();

    menu.addItem({
      label: this.options.t("lets-more-background.manualCoverUrl"),
      icon: "iconLink",
      click: () => { void this.applyManualCoverUrl(background); },
    });

    menu.addItem({
      label: `${this.options.t("lets-more-background.coverHistory")}${getCoverHistory().length ? ` (${getCoverHistory().length})` : ""}`,
      icon: "iconHistory",
      click: () => this.openCoverHistory(background),
    });

    menu.addItem({
      label: this.options.t("lets-more-background.uploadFromClipboard"),
      icon: "iconCopy",
      click: () => this.applyFromClipboard(root, background),
    });

    if (this.options.readFromAssets) {
      menu.addItem({
        label: this.options.t("lets-more-background.loadFromAssets"),
        icon: "iconUpload",
        click: () => this.applyFromAssets(root, background),
      });
    }

    menu.addSeparator();

    menu.addItem({
      label: this.options.t("lets-more-background.openSetting"),
      icon: "iconSettings",
      click: () => {
        plugin.openSetting();
      },
    });

    if (isMobile) {
      menu.fullscreen();
    } else {
      menu.open({ x: rect.left, y: rect.bottom, isLeft: false });
    }
  }

  async applyRandomSource(
    item: CoverSourceItem,
    root: HTMLElement,
    background: HTMLElement,
  ): Promise<void> {
    setLastUsedSource(item);
    const url = formatCoverUrl(item.url, this.options.width, this.options.height);
    if (!url) return;

    triggerRandomIfNoImg(root);
    await this.fetchAndSetBackground(url, background);
  }

  private async applyManualCoverUrl(background: HTMLElement): Promise<void> {
    const input = typeof window !== "undefined"
      ? window.prompt(this.options.t("lets-more-background.manualCoverPrompt"), "")?.trim()
      : "";
    if (!input) return;
    if (!/^https?:\/\//i.test(input) && !input.startsWith("data:")) {
      showMessage(this.options.t("lets-more-background.manualCoverInvalid"));
      return;
    }
    background.style.cursor = "wait";
    try {
      const info = await resolveManualBooruUrl(input, this.options.siteCredentials);
      if (!info?.imageUrl) {
        showMessage(this.options.t("lets-more-background.manualCoverFailed"));
        return;
      }
      this.applyPostMetadata(background, info);
      await this.fetchAndSetBackground(info.imageUrl, background, 1, 1, undefined, info);
      showMessage(this.options.t("lets-more-background.manualCoverSuccess"));
    } catch (error) {
      log.warn("Failed to apply manually selected cover:", error);
      showMessage(this.options.t("lets-more-background.manualCoverFailed"));
    } finally {
      background.style.cursor = "";
    }
  }

  private openCoverHistory(background: HTMLElement): void {
    const dialog = new Dialog({
      title: this.options.t("lets-more-background.coverHistory"),
      content: '<div class="damophus-cover-history-host" style="height: 100%; overflow: auto;"></div>',
      width: isMobile ? "100vw" : "min(92vw, 760px)",
      height: isMobile ? "100dvh" : "min(85dvh, 680px)",
    });
    const host = dialog.element.querySelector<HTMLElement>(".damophus-cover-history-host");
    if (!host) {
      dialog.destroy();
      return;
    }

    const render = (): void => {
      host.replaceChildren();
      const history = getCoverHistory();
      const heading = document.createElement("div");
      heading.className = "fn__flex fn__flex-center";
      heading.style.cssText = "justify-content:space-between;gap:8px;padding:8px 4px 12px;";
      const count = document.createElement("span");
      count.textContent = `${this.options.t("lets-more-background.coverHistoryDescription")} (${history.length})`;
      count.style.color = "var(--b3-theme-on-surface-light)";
      heading.appendChild(count);
      if (history.length > 0) {
        const clear = document.createElement("button");
        clear.className = "b3-button b3-button--cancel";
        clear.textContent = this.options.t("lets-more-background.clearCoverHistory");
        clear.addEventListener("click", () => {
          clearCoverHistory();
          render();
        });
        heading.appendChild(clear);
      }
      host.appendChild(heading);

      if (history.length === 0) {
        const empty = document.createElement("div");
        empty.textContent = this.options.t("lets-more-background.emptyCoverHistory");
        empty.style.cssText = "padding:32px 12px;text-align:center;color:var(--b3-theme-on-surface-light);";
        host.appendChild(empty);
        return;
      }

      for (const entry of history) {
        const row = document.createElement("div");
        row.className = "b3-list-item fn__flex";
        row.style.cssText = "gap:10px;align-items:center;padding:8px 4px;border-top:1px solid var(--b3-border-color);";
        const image = document.createElement("img");
        image.src = entry.imageUrl;
        image.alt = entry.docTitle || this.options.t("lets-more-background.coverHistory");
        image.referrerPolicy = "no-referrer";
        image.style.cssText = "width:88px;height:54px;object-fit:cover;border-radius:3px;background:var(--b3-theme-surface-lighter);flex:none;";
        row.appendChild(image);

        const details = document.createElement("div");
        details.style.cssText = "min-width:0;flex:1;line-height:1.5;";
        const title = document.createElement("div");
        title.textContent = entry.docTitle || this.options.t("lets-more-background.currentDocument");
        title.style.cssText = "font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        details.appendChild(title);
        const meta = document.createElement("div");
        const tags = entry.tags?.slice(0, 5).join(" ");
        const kindLabel = entry.kind === "replaced"
          ? this.options.t("lets-more-background.coverHistoryReplacedBadge")
          : "";
        meta.textContent = [kindLabel, entry.site, entry.postId ? `#${entry.postId}` : "", tags, new Date(entry.appliedAt).toLocaleString()].filter(Boolean).join(" · ");
        meta.style.cssText = "font-size:11px;color:var(--b3-theme-on-surface-light);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
        details.appendChild(meta);
        row.appendChild(details);

        const apply = document.createElement("button");
        apply.className = "b3-button b3-button--outline";
        apply.textContent = this.options.t("lets-more-background.applyCoverHistory");
        apply.addEventListener("click", () => {
          void this.applyCoverHistoryEntry(entry, background, dialog);
        });
        row.appendChild(apply);
        const remove = document.createElement("button");
        remove.className = "b3-button b3-button--cancel";
        remove.textContent = this.options.t("lets-more-background.removeCoverHistory");
        remove.addEventListener("click", () => {
          removeCoverHistoryEntry(entry.id);
          render();
        });
        row.appendChild(remove);
        host.appendChild(row);
      }
    };

    render();
  }

  private async applyCoverHistoryEntry(
    entry: CoverHistoryEntry,
    background: HTMLElement,
    dialog: Dialog,
  ): Promise<void> {
    const postInfo: BooruResolvedInfo = {
      imageUrl: entry.imageUrl,
      postUrl: entry.postUrl,
      site: entry.site,
      postId: entry.postId,
      tags: entry.tags,
    };
    this.applyPostMetadata(background, postInfo);
    try {
      if (/^(?:https?:\/\/|data:)/i.test(entry.imageUrl)) {
        await this.fetchAndSetBackground(entry.imageUrl, background, 1, 1, undefined, postInfo);
      } else {
        await this.setBlockBackgroundImage(background, entry.imageUrl, postInfo, undefined, entry.sourceUrl);
      }
      dialog.destroy();
      showMessage(this.options.t("lets-more-background.coverHistoryApplied"));
    } catch (error) {
      log.warn("Failed to apply cover history entry:", error);
      showMessage(this.options.t("lets-more-background.manualCoverFailed"));
    }
  }

  private applyPostMetadata(background: HTMLElement, postInfo: BooruResolvedInfo): void {
    const targets = [background, background.querySelector<HTMLImageElement>(".protyle-background__img img")].filter(Boolean) as HTMLElement[];
    const metadata: Record<string, string> = {
      "data-damophus-post-url": postInfo.postUrl || "",
      "data-damophus-post-site": postInfo.site || "",
      "data-damophus-post-id": postInfo.postId === undefined ? "" : String(postInfo.postId),
      "data-damophus-post-score": postInfo.score === undefined ? "" : String(postInfo.score),
      "data-damophus-post-dimensions": postInfo.width && postInfo.height ? `${postInfo.width} × ${postInfo.height}` : "",
      "data-damophus-post-tags": postInfo.tags ? (Array.isArray(postInfo.tags) ? postInfo.tags.join(" ") : String(postInfo.tags)) : "",
    };
    for (const target of targets) {
      for (const [name, value] of Object.entries(metadata)) {
        if (value) target.setAttribute(name, value);
        else target.removeAttribute(name);
      }
    }
  }

  private async applyFromClipboard(root: HTMLElement, background: HTMLElement): Promise<void> {
    try {
      if (!navigator.clipboard?.read) {
        showMessage(this.options.t("lets-more-background.noImageInClipboard"));
        return;
      }
      const clipboardItems = await navigator.clipboard.read();
      let imageBlob: Blob | null = null;

      for (const item of clipboardItems) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          imageBlob = await item.getType(imageType);
          break;
        }
      }

      if (!imageBlob) {
        showMessage(this.options.t("lets-more-background.noImageInClipboard"));
        return;
      }

      triggerRandomIfNoImg(root);
      await this.saveBlobAndSetBackground(imageBlob, background);
    } catch (e) {
      log.error("Failed to read clipboard:", e);
      showMessage(this.options.t("lets-more-background.noImageInClipboard"));
    }
  }

  private async applyFromAssets(root: HTMLElement, background: HTMLElement): Promise<void> {
    if (!this.options.readFromAssets) return;
    const location = sanitizeAssetsPath(this.options.assetsLocation);
    const files = await this.listImageFiles(location);

    if (!files || files.length === 0) {
      showMessage(this.options.t("lets-more-background.emptyAssets"));
      return;
    }

    const randomIndex = Math.floor(Math.random() * files.length);
    const chosenFile = files[randomIndex];
    triggerRandomIfNoImg(root);
    await this.setBlockBackgroundImage(background, chosenFile);
  }

  private async fetchAndSetBackground(
    url: string,
    background: HTMLElement,
    attempt = 1,
    maxRetries = 10,
    excludedCoverUrls?: ReadonlySet<string>,
    resolvedPostInfo?: BooruResolvedInfo | null,
  ): Promise<void> {
    background.style.cursor = "wait";
    const autoRetry = this.options.autoRetryOnFailure !== false;
    const effectiveMaxRetries = autoRetry ? maxRetries : 1;
    let deduplicationUrls = excludedCoverUrls;

    try {
      let finalImageUrl = url;
      let postInfo: BooruResolvedInfo | null = resolvedPostInfo || null;

      if (isBooruSource(url) && !postInfo) {
        if (this.options.deduplicateNewCovers !== false && !deduplicationUrls) {
          dedupLog.info("Deduplication enabled, loading previously used cover URLs");
          try {
            deduplicationUrls = await loadDedupCoverUrls(background);
          } catch (error) {
            dedupLog.warn("Failed to load used cover URLs:", error);
            deduplicationUrls = new Set();
          }
        } else if (this.options.deduplicateNewCovers === false) {
          dedupLog.info("Deduplication disabled, previously used covers may be selected again");
        }
        const credentials = this.options.siteCredentials;
        const globalBlacklist = this.options.blacklistedTags || DEFAULT_BLACKLISTED_TAGS;
        postInfo = await resolveBooruImageInfo(url, credentials, globalBlacklist, deduplicationUrls);

        if (!postInfo || !postInfo.imageUrl) {
          dedupLog.info("Booru resolution returned no usable post", {
            attempt,
            maxRetries: effectiveMaxRetries,
            excludedCoverCount: deduplicationUrls?.size || 0,
          });
          if (attempt < effectiveMaxRetries) {
            log.info(`Fetch cover filtered/failed (attempt ${attempt}/${effectiveMaxRetries}), retrying...`);
            showMessage(`正在尝试重新匹配符合条件的题头图 (第 ${attempt + 1}/${effectiveMaxRetries} 次)...`);
            await new Promise((r) => setTimeout(r, 400));
            return this.fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries, deduplicationUrls);
          }
          showMessage("未找到满足条件（宽高比/评分/已排除屏蔽词）的题头图，建议放宽筛选条件");
          return;
        }

        dedupLog.debug("Selected booru post after deduplication", {
          site: postInfo.site,
          postId: postInfo.postId,
          imageUrl: postInfo.imageUrl,
          diagnostic: postInfo.diagnostic,
        });
        finalImageUrl = postInfo.imageUrl;
        if (postInfo.postUrl) background.setAttribute("data-damophus-post-url", postInfo.postUrl);
        if (postInfo.site) background.setAttribute("data-damophus-post-site", postInfo.site);
        if (postInfo.postId) background.setAttribute("data-damophus-post-id", String(postInfo.postId));
        if (postInfo.score !== undefined) background.setAttribute("data-damophus-post-score", String(postInfo.score));
        if (postInfo.width && postInfo.height) background.setAttribute("data-damophus-post-dimensions", `${postInfo.width} × ${postInfo.height}`);
        if (postInfo.tags) {
          const rawTags = Array.isArray(postInfo.tags) ? postInfo.tags.join(" ") : String(postInfo.tags);
          background.setAttribute("data-damophus-post-tags", rawTags);
        }

        const img = background.querySelector("img");
        if (img) {
          if (postInfo.postUrl) img.setAttribute("data-damophus-post-url", postInfo.postUrl);
          if (postInfo.tags) {
            const rawTags = Array.isArray(postInfo.tags) ? postInfo.tags.join(" ") : String(postInfo.tags);
            img.setAttribute("data-damophus-post-tags", rawTags);
          }
        }
      }

      if (this.options.writeToAssets || this.options.localCache) {
        let blob: Blob | null = await proxyFetchImageBlob(finalImageUrl);
        if (!blob || blob.size === 0) {
          try {
            const res = await fetch(finalImageUrl, { referrerPolicy: "no-referrer" });
            if (res.ok) blob = await res.blob();
          } catch (fetchErr) {
            log.warn("Direct fetch image failed:", fetchErr);
          }
        }

        if (blob && blob.size > 0) {
          await this.saveBlobAndSetBackground(blob, background, postInfo, finalImageUrl);
        } else {
          if (attempt < effectiveMaxRetries && isBooruSource(url)) {
            log.info(`Image blob download failed (attempt ${attempt}/${effectiveMaxRetries}), retrying another post...`);
            showMessage(`图片下载受限，正在重试其他候选图 (第 ${attempt + 1}/${effectiveMaxRetries} 次)...`);
            await new Promise((r) => setTimeout(r, 400));
            return this.fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries, deduplicationUrls);
          }
          await this.setBlockBackgroundImage(background, finalImageUrl, postInfo);
        }
      } else {
        await this.setBlockBackgroundImage(background, finalImageUrl, postInfo);
      }
    } catch (e: any) {
      log.error("Failed to fetch image from URL:", url, e);
      if (attempt < effectiveMaxRetries && isBooruSource(url)) {
        showMessage(`获取异常，正在重试 (第 ${attempt + 1}/${effectiveMaxRetries} 次)...`);
        await new Promise((r) => setTimeout(r, 500));
        return this.fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries, deduplicationUrls);
      }
      showMessage(this.options.t("lets-more-background.loadUrlFailed"));
    } finally {
      background.style.cursor = "";
    }
  }

  private async saveBlobAndSetBackground(
    blob: Blob,
    background: HTMLElement,
    postInfo?: BooruResolvedInfo | null,
    sourceUrl?: string,
  ): Promise<void> {
    if (this.options.localCache && sourceUrl) {
      try {
        const processed = await convertToWebp(blob, this.options.localCacheMaxEdge);
        const cachePath = localCachePath(this.options.localCacheRoot, this.options.localCachePathTemplate, {
          sourceUrl,
          maxEdge: this.options.localCacheMaxEdge,
          site: postInfo?.site,
          postId: postInfo?.postId,
        });
        await ensureSyncIgnore(this.options.localCacheRoot);
        if (await this.uploadToLocalCache(processed, cachePath)) {
          await updateLocalCacheIndex(this.options.localCacheRoot, {
            path: cachePath,
            sourceUrl,
            createdAt: new Date().toISOString(),
            maxEdge: this.options.localCacheMaxEdge,
            quality: LOCAL_CACHE_QUALITY,
            site: postInfo?.site,
            postId: postInfo?.postId,
            width: postInfo?.width,
            height: postInfo?.height,
            size: processed.size,
          });
          await this.setBlockBackgroundImage(background, sourceUrl, postInfo, cachePath);
          const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
          if (image) displayLocalCache(image, processed);
          return;
        }
      } catch (error) {
        log.warn("Failed to create local WebP cover cache:", error);
      }
    }
    if (!this.options.writeToAssets) {
      await this.setBlockBackgroundImage(background, sourceUrl || await this.blobToBase64(blob), postInfo, undefined, sourceUrl);
      return;
    }
    const { name } = await detectImageTypeAndName(blob);
    const location = sanitizeAssetsPath(this.options.assetsLocation);

    const assetPath = await this.uploadToAssets(blob, name, location);
    if (assetPath) {
      await this.setBlockBackgroundImage(background, assetPath, postInfo, undefined, sourceUrl);
    } else {
      const base64 = await this.blobToBase64(blob);
      await this.setBlockBackgroundImage(background, base64, postInfo, undefined, sourceUrl);
    }
  }

  private async uploadToLocalCache(blob: Blob, path: string): Promise<boolean> {
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

  private async uploadToAssets(blob: Blob, name: string, location: string): Promise<string | null> {
    try {
      const formData = new FormData();
      formData.append("path", `/data${location}/${name}`);
      formData.append("file", blob, name);
      formData.append("isDir", "false");

      const res = await fetch("/api/file/putFile", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (data.code !== 0) {
        showMessage(this.options.t("lets-more-background.writeImgToAssetsFailed"));
        return null;
      }
      return `${location}/${name}`.replace(/^\/+/, "");
    } catch (e) {
      log.error("Failed to save image to assets:", e);
      showMessage(this.options.t("lets-more-background.writeImgToAssetsFailed"));
      return null;
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.onabort = reject;
      reader.readAsDataURL(blob);
    });
  }

  private async setBlockBackgroundImage(
    background: HTMLElement,
    urlOrPath: string,
    postInfo?: BooruResolvedInfo | null,
    cachePath?: string,
    sourceUrl?: string,
  ): Promise<void> {
    const blockId =
      background.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
      background.closest(".protyle")?.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

    if (!blockId) {
      log.warn("Cannot find block data-node-id on background or protyle element");
      return;
    }

    let finalVal = urlOrPath.trim();
    if (!finalVal.startsWith("data:") && !finalVal.startsWith("http://") && !finalVal.startsWith("https://")) {
      finalVal = finalVal.replace(/^\/+/, "");
    }

    let previousTitleImg = "";
    let previousSourceUrl = "";
    let previousCachePath = "";
    let previousSite = "";
    let previousPostId = "";
    let previousPostUrl = "";
    let previousTags = "";
    try {
      const previous = await fetch("/api/attr/getBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId }),
      });
      const prevData = await previous.json();
      const prevAttrs = (prevData?.data || {}) as Record<string, string>;
      previousTitleImg = prevAttrs["title-img"] || prevAttrs["custom-title-img"] || "";
      previousSourceUrl = prevAttrs[COVER_SOURCE_ATTRIBUTE] || "";
      previousCachePath = prevAttrs[COVER_CACHE_ATTRIBUTE] || "";
      previousSite = prevAttrs["custom-damophus-post-site"] || "";
      previousPostId = prevAttrs["custom-damophus-post-id"] || "";
      previousPostUrl = prevAttrs["custom-damophus-post-url"] || "";
      previousTags = prevAttrs["custom-damophus-post-tags"] || "";
      log.debug("Read previous cover attrs before replacement", {
        blockId,
        titleImg: previousTitleImg,
        sourceUrl: previousSourceUrl,
        site: previousSite,
        postId: previousPostId,
      });
    } catch (error) {
      log.warn("Failed to read previous cover attrs before replacement:", error);
    }

    const originalSourceUrl = /^https?:\/\//i.test(sourceUrl || "")
      ? sourceUrl!.trim()
      : /^https?:\/\//i.test(urlOrPath)
      ? urlOrPath
      : "";
    const sourceChanged = normalizeCoverUrl(originalSourceUrl) !== normalizeCoverUrl(previousSourceUrl);
    const nextTitleImg = `background-image:url("${finalVal}")`;
    const previousTitleIdentity =
      normalizeCoverUrl(previousTitleImg) || normalizeCoverAssetPath(previousTitleImg) || previousTitleImg;
    const nextTitleIdentity =
      normalizeCoverUrl(nextTitleImg) || normalizeCoverAssetPath(nextTitleImg) || nextTitleImg;
    const coverReplaced = Boolean(previousTitleImg) && previousTitleIdentity !== nextTitleIdentity;

    const attrs: Record<string, string> = {
      "title-img": nextTitleImg,
    };
    if (!previousTitleImg || coverReplaced) attrs[COVER_POSITION_ATTRIBUTE] = "";
    if (originalSourceUrl) {
      attrs[COVER_SOURCE_ATTRIBUTE] = originalSourceUrl;
    } else if (previousSourceUrl) {
      attrs[COVER_SOURCE_ATTRIBUTE] = "";
    }
    if (cachePath) attrs[COVER_CACHE_ATTRIBUTE] = cachePath;
    else if (previousCachePath && sourceChanged) attrs[COVER_CACHE_ATTRIBUTE] = "";

    const tags = background.getAttribute("data-damophus-post-tags") || "";
    const site = background.getAttribute("data-damophus-post-site") || "";
    const postId = background.getAttribute("data-damophus-post-id") || "";
    const postUrl = background.getAttribute("data-damophus-post-url") || "";
    const score = background.getAttribute("data-damophus-post-score") || "";
    const dimensions = background.getAttribute("data-damophus-post-dimensions") || "";
    attrs["custom-damophus-post-tags"] = tags;
    attrs["custom-damophus-post-site"] = site;
    attrs["custom-damophus-post-id"] = postId;
    attrs["custom-damophus-post-url"] = postUrl;
    attrs["custom-damophus-post-score"] = score;
    attrs["custom-damophus-post-dimensions"] = dimensions;

    await fetch("/api/attr/setBlockAttrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: blockId,
        attrs,
      }),
    });
    // Re-apply the document's independent position after replacing the cover.
    // A same-image refresh keeps the position; a genuinely new image cleared it above.
    setTimeout(() => { void this.restoreCoverPosition(background); }, 0);

    // 更换题头图后清理旧封面在本设备的缓存文件
    if (this.options.purgeCacheOnCoverChange && sourceChanged && previousCachePath && previousCachePath !== cachePath) {
      await this.purgeCoverCacheFile(previousCachePath, blockId);
    }

    const protyle = background.closest(".protyle");
    const docTitle =
      protyle?.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim() ||
      protyle?.querySelector<HTMLElement>(".protyle-title")?.textContent?.trim() ||
      protyle?.querySelector<HTMLElement>(".protyle-breadcrumb__bar")?.textContent?.trim() ||
      "当前文档";

    // 记录被替换掉的旧题头图，确保之后随机选图时不会再次命中它。
    if (coverReplaced) {
      this.recordReplacedCover(blockId, docTitle, {
        titleImg: previousTitleImg,
        sourceUrl: previousSourceUrl,
        site: previousSite,
        postId: previousPostId,
        postUrl: previousPostUrl,
        tags: previousTags,
      });
    }

    // 记录新应用到文档的题头图
    try {
      const lastUsed = getLastUsedSource();
      recordCoverHistory({
        docId: blockId,
        docTitle,
        imageUrl: finalVal,
        sourceUrl: originalSourceUrl || undefined,
        postUrl: postUrl || postInfo?.postUrl,
        site: site || postInfo?.site,
        postId: postId || postInfo?.postId,
        tags: tags ? tags.split(/\s+/) : postInfo?.tags,
        templateName: lastUsed?.label,
        kind: "applied",
      });
    } catch (histErr) {
      historyLog.warn("Failed to record cover history:", histErr);
    }
  }

  /**
   * Persist the cover that is being replaced so future random picks can
   * exclude it. It is written to both the durable seen-cover dedup store and
   * the visible history (capped), so deduplication survives history clearing.
   */
  private recordReplacedCover(
    blockId: string,
    docTitle: string,
    previous: {
      titleImg: string;
      sourceUrl: string;
      site: string;
      postId: string;
      postUrl: string;
      tags: string;
    },
  ): void {
    const remoteFromTitle = normalizeCoverUrl(previous.titleImg);
    const remoteFromSource = normalizeCoverUrl(previous.sourceUrl);
    const imageUrl = remoteFromSource || remoteFromTitle || "";
    const hasPostIdentity = Boolean(previous.site && previous.postId);
    if (!imageUrl && !hasPostIdentity) return;

    const entry = {
      docId: blockId,
      docTitle,
      imageUrl,
      sourceUrl: remoteFromSource || undefined,
      postUrl: previous.postUrl || undefined,
      site: previous.site || undefined,
      postId: previous.postId || undefined,
      tags: previous.tags ? previous.tags.split(/\s+/) : undefined,
    };

    const seen = recordSeenCover(entry);
    if (imageUrl) {
      recordCoverHistory({ ...entry, kind: "replaced" });
    }
    if (seen) {
      historyLog.info("Recorded replaced cover for future deduplication", {
        docId: blockId,
        imageUrl: entry.imageUrl,
        site: entry.site,
        postId: entry.postId,
        seenId: seen.id,
      });
    }
  }

  private async hydrateLocalCache(root: HTMLElement): Promise<void> {
    if (!this.options.localCache) return;
    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (!background) return;
    const blockId = background.getAttribute("data-node-id") || root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id");
    if (!blockId) return;
    try {
      const response = await fetch("/api/attr/getBlockAttrs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: blockId }),
      });
      const data = await response.json();
      const attrs = data?.data as Record<string, string> | undefined;
      const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
      if (!image) return;
      const explicitSourceUrl = attrs?.[COVER_SOURCE_ATTRIBUTE];
      if (!explicitSourceUrl && !this.options.autoCacheLegacyCovers) return;
      const sourceUrl = explicitSourceUrl || inferCoverSourceFromImage(image);
      if (!sourceUrl) return;
      const current = this.options.localCacheMaxEdge;
      const expected = localCachePath(this.options.localCacheRoot, this.options.localCachePathTemplate, {
        sourceUrl,
        maxEdge: current,
        site: attrs?.["custom-damophus-post-site"],
        postId: attrs?.["custom-damophus-post-id"],
      });
      await ensureSyncIgnore(this.options.localCacheRoot);
      const cached = await readLocalCache(expected);
      if (cached) {
        displayLocalCache(image, cached);
        await fetch("/api/attr/setBlockAttrs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: blockId,
            attrs: { [COVER_SOURCE_ATTRIBUTE]: sourceUrl, [COVER_CACHE_ATTRIBUTE]: expected },
          }),
        });
        return;
      }
      let downloaded = await proxyFetchImageBlob(sourceUrl);
      if (!downloaded || downloaded.size === 0) {
        const fetched = await fetch(sourceUrl, { referrerPolicy: "no-referrer" });
        if (fetched.ok) downloaded = await fetched.blob();
      }
      if (downloaded && downloaded.size > 0) {
        const processed = await convertToWebp(downloaded, current);
        await ensureSyncIgnore(this.options.localCacheRoot);
        if (await this.uploadToLocalCache(processed, expected)) {
          await updateLocalCacheIndex(this.options.localCacheRoot, {
            path: expected,
            sourceUrl,
            createdAt: new Date().toISOString(),
            maxEdge: current,
            quality: LOCAL_CACHE_QUALITY,
            site: attrs?.["custom-damophus-post-site"],
            postId: attrs?.["custom-damophus-post-id"],
            size: processed.size,
          });
          displayLocalCache(image, processed);
          await fetch("/api/attr/setBlockAttrs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: blockId,
              attrs: { [COVER_SOURCE_ATTRIBUTE]: sourceUrl, [COVER_CACHE_ATTRIBUTE]: expected },
            }),
          });
        }
      }
    } catch (error) {
      log.debug("Failed to hydrate local cover cache:", error);
    }
  }

  private releaseLocalCache(root: HTMLElement): void {
    const image = root.querySelector<HTMLImageElement>(".protyle-background__img img");
    if (!image) return;
    const objectUrl = objectUrls.get(image);
    if (!objectUrl) return;
    URL.revokeObjectURL(objectUrl);
    objectUrls.delete(image);
  }

  private async listImageFiles(path: string): Promise<string[] | null> {
    try {
      const res = await fetch("/api/file/readDir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `/data${path}`,
        }),
      });
      const data = await res.json();
      if (data.code !== 0 || !Array.isArray(data.data)) {
        return null;
      }
      const imageFileRegex = /\.(jpe?g|png|gif|bmp|webp|svg|avif)$/i;
      const results: string[] = [];
      for (const item of data.data) {
        if (item.name && imageFileRegex.test(item.name)) {
          results.push(`${path}/${item.name}`.replace(/^\/+/, ""));
        }
      }
      return results;
    } catch (e) {
      log.error("Failed to list assets directory:", path, e);
      showMessage(`${this.options.t("lets-more-background.readAssetsError")}: ${path}`);
      return null;
    }
  }

  private renderVideoBackground(background: HTMLElement, url: string): void {
    const container = background.querySelector<HTMLElement>(".protyle-background__img");
    if (!container) return;

    this.removeVideoBackground(background);

    const img = container.querySelector<HTMLImageElement>("img");
    if (img) {
      img.classList.add("fn__none");
    }

    const video = document.createElement("video");
    video.currentTime = 0;
    video.muted = true;
    video.autoplay = true;
    video.loop = true;
    video.playsInline = true;
    video.src = url;
    video.setAttribute("data-playing", "true");
    video.className = "protyle-background__video";
    video.setAttribute(
      "style",
      "position: absolute; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; pointer-events: auto;",
    );

    if (img && img.style.objectPosition) {
      video.style.objectPosition = img.style.objectPosition;
    }

    container.appendChild(video);
  }

  private removeVideoBackground(background: HTMLElement): void {
    const video = background.querySelector(".protyle-background__video");
    if (video) {
      video.remove();
    }
  }

  /**
   * 题头图多合一位置调整控制器：
   * 1. 快捷模式：按住 Alt 键，鼠标在题头图上按下直接上下拖拽（光标自动变抓手，松手自动保存）
   * 2. 滚轮微调：鼠标悬浮在题头图上，按住 Alt + 滚轮上下滚动，以 2% 为步长平滑微调（防抖自动保存）
   * 3. 纯鼠标模式：鼠标左键在题头图上长按 300ms 触发拖拽，松手自动保存
   * 4. 全局直接拖模式：若开启 directDrag，鼠标左键一拖即走
   * 5. 交互反馈：拖拽/微调过程中居中显示轻量透明 HUD 百分比徽章 (如 45%)，松手平滑淡出
   */
  private initCoverPositionControls(background: HTMLElement): () => void {
    let isDragging = false;
    let isLongPressActive = false;
    let startY = 0;
    let startX = 0;
    let startPositionY = 50;
    let currentPositionY = 50;
    let longPressTimer: any = null;
    let wheelSaveTimer: any = null;

    const getMediaElement = (): HTMLElement | null => {
      return (
        background.querySelector<HTMLVideoElement>(".protyle-background__video") ||
        background.querySelector<HTMLImageElement>(".protyle-background__img img")
      );
    };

    const parsePositionY = (el: HTMLElement): number => {
      const percent = parseCoverPosition(el.style.objectPosition);
      if (percent !== null) return percent;
      const pixelMatch = el.style.objectPosition.match(/(?:center\s+)?(-?\d+(?:\.\d+)?)px/i);
      if (pixelMatch && el instanceof HTMLImageElement && el.naturalWidth > 0) {
        const overflow = el.naturalHeight * (el.clientWidth / el.naturalWidth) - el.clientHeight;
        if (overflow > 0) return Math.max(0, Math.min(100, -Number(pixelMatch[1]) / overflow * 100));
      }
      return 50;
    };

    const updateElementsPosition = (percent: number) => {
      const clamped = Math.max(0, Math.min(100, percent));
      currentPositionY = clamped;
      const val = `center ${clamped.toFixed(2)}%`;
      const img = background.querySelector<HTMLImageElement>(".protyle-background__img img");
      if (img) img.style.objectPosition = val;
      const video = background.querySelector<HTMLVideoElement>(".protyle-background__video");
      if (video) video.style.objectPosition = val;
    };

    const showHUD = (percent: number, label = "题头图位置") => {
      let hud = background.querySelector<HTMLElement>(".damophus-position-hud");
      if (!hud) {
        hud = document.createElement("div");
        hud.className = "damophus-position-hud";
        hud.setAttribute(
          "style",
          "position: absolute; top: 14px; left: 50%; transform: translateX(-50%) scale(0.95); " +
          "background: rgba(15, 23, 42, 0.88); backdrop-filter: blur(10px); " +
          "color: #f8fafc; font-family: ui-monospace, SFMono-Regular, monospace; " +
          "font-size: 12px; font-weight: 600; padding: 4px 14px; border-radius: 9999px; " +
          "border: 1px solid rgba(255, 255, 255, 0.18); box-shadow: 0 4px 18px rgba(0, 0, 0, 0.38); " +
          "pointer-events: none; z-index: 100; display: flex; align-items: center; gap: 6px; " +
          "opacity: 0; transition: opacity 0.18s cubic-bezier(0.16, 1, 0.3, 1), transform 0.18s cubic-bezier(0.16, 1, 0.3, 1);",
        );
        background.appendChild(hud);
      }

      hud.innerHTML = `<span>↕️ ${label}</span><span style="color: #38bdf8; font-weight: 700; font-size: 13px;">${Math.round(percent)}%</span>`;
      hud.style.opacity = "1";
      hud.style.transform = "translateX(-50%) scale(1)";

      const timerKey = "__damophus_hud_timer__";
      if ((hud as any)[timerKey]) {
        clearTimeout((hud as any)[timerKey]);
      }
    };

    const hideHUD = (delay = 750) => {
      const hud = background.querySelector<HTMLElement>(".damophus-position-hud");
      if (!hud) return;
      const timerKey = "__damophus_hud_timer__";
      if ((hud as any)[timerKey]) {
        clearTimeout((hud as any)[timerKey]);
      }
      (hud as any)[timerKey] = setTimeout(() => {
        hud.style.opacity = "0";
        hud.style.transform = "translateX(-50%) scale(0.95)";
      }, delay);
    };

    let positionObserverTimer: ReturnType<typeof setTimeout> | null = null;
    let saveQueue: Promise<void> = Promise.resolve();

    const savePositionToBlock = (positionPercent: number): void => {
      const blockId =
        background.getAttribute("data-node-id") ||
        background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
        background.closest(".protyle")?.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

      if (!blockId) {
        log.warn("save position skipped: block id missing");
        return;
      }

      const serialized = serializeCoverPosition(positionPercent);
      if (serialized === null) {
        log.warn("save position skipped: invalid position", { blockId, positionPercent });
        return;
      }
      log.debug("save position queued", { blockId, positionPercent, serialized });
      saveQueue = saveQueue.then(async () => {
        const attrs: Record<string, string> = { [COVER_POSITION_ATTRIBUTE]: serialized };
        // Native SiYuan confirmation can persist the currently rendered blob URL.
        // Repair that address while saving the position so the next device can load it.
        try {
          const response = await fetch("/api/attr/getBlockAttrs", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: blockId }),
          });
          const data = await response.json();
          const current = (data?.data || {}) as Record<string, string>;
          log.debug("save position: current attrs read", {
            blockId,
            titleImg: current["title-img"] ?? null,
            sourceUrl: current[COVER_SOURCE_ATTRIBUTE] ?? null,
            cachePath: current[COVER_CACHE_ATTRIBUTE] ?? null,
          });
          if (/url\(\s*[\"']?blob:/i.test(current["title-img"] || "")) {
            const stable = (current[COVER_SOURCE_ATTRIBUTE] || current[COVER_CACHE_ATTRIBUTE] || "").trim();
            if (stable) attrs["title-img"] = `background-image:url("${stable.replace(/\"/g, "%22")}")`;
          }
        } catch (error) {
          log.warn("save position: current attr read failed", { blockId, error });
        }
        log.info("save position: writing attrs", { blockId, attrs });
        const response = await fetch("/api/attr/setBlockAttrs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: blockId, attrs }),
        });
        await assertAttrWriteSucceeded(response);
        log.info("save position: write succeeded", { blockId, position: serialized, status: response.status });
      }).catch((error) => {
        log.error("save position failed", { blockId, position: serialized, error });
      });
    };

    const scheduleNativePositionSave = () => {
      if (positionObserverTimer) clearTimeout(positionObserverTimer);
      log.debug("native position observer scheduled");
      positionObserverTimer = setTimeout(() => {
        positionObserverTimer = null;
        const media = getMediaElement();
        const position = media ? parsePositionY(media) : null;
        log.debug("native position observer fired", { position });
        if (position !== null) savePositionToBlock(position);
      }, 450);
    };

    const positionObserver = new MutationObserver((records) => {
      if (records.some((record) => record.attributeName === "style")) scheduleNativePositionSave();
    });
    const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
    const video = background.querySelector<HTMLVideoElement>(".protyle-background__video");
    image && positionObserver.observe(image, { attributes: true, attributeFilter: ["style"] });
    video && positionObserver.observe(video, { attributes: true, attributeFilter: ["style"] });

    // SiYuan's native cover drag owns document.onmouseup and may bypass the
    // attribute observer. Capture the release before the native handler clears
    // its cursor and persist the final rendered position explicitly.
    const handleNativePositionMouseUp = () => {
      const media = getMediaElement();
      log.debug("native mouseup captured", {
        hasMedia: Boolean(media),
        cursor: media?.style.cursor || null,
        style: media?.getAttribute("style") || null,
      });
      if (!media || media.style.cursor !== "move") return;
      const position = parsePositionY(media);
      log.info("native mouseup position parsed", { position });
      setTimeout(() => savePositionToBlock(position), 0);
    };
    document.addEventListener("mouseup", handleNativePositionMouseUp, true);

    // SiYuan's native handler indexes three toolbar groups inside the image container.
    // Cover layout may move the first group below the icon, so put it back for the
    // native position gesture and restore the configured layout after confirmation.
    const restoreNativeToolbar = () => {
      const imageContainer = background.querySelector<HTMLElement>(".protyle-background__img");
      const positionButton = background.querySelector<HTMLElement>('[data-type="position"]');
      const nativeToolbar = positionButton?.closest<HTMLElement>(".protyle-icons");
      if (imageContainer && nativeToolbar && nativeToolbar.parentElement !== imageContainer) {
        imageContainer.appendChild(nativeToolbar);
      }
    };
    const restoreConfiguredToolbar = () => {
      const nativeToolbar = background.querySelector<HTMLElement>('[data-type="position"]')?.closest<HTMLElement>(".protyle-icons");
      const infoArea = background.querySelector<HTMLElement>(".protyle-background__ia");
      const tags = infoArea?.querySelector<HTMLElement>(".b3-chips__doctag");
      if (infoArea && nativeToolbar && nativeToolbar.parentElement !== infoArea) {
        infoArea.insertBefore(nativeToolbar, tags ?? infoArea.querySelector(".protyle-background__action"));
      }
    };
    const handleNativeToolbarClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-type="position"]')) {
        log.debug("native position button clicked");
        restoreNativeToolbar();
      } else if (target?.closest('[data-type="cancel"], [data-type="confirm"]')) {
        log.debug("native position action clicked", { type: target.closest<HTMLElement>("[data-type]")?.getAttribute("data-type") });
        setTimeout(restoreConfiguredToolbar, 0);
      }
    };
    background.addEventListener("click", handleNativeToolbarClick, true);

    // 鼠标悬停及按键响应
    const handleMouseMoveOrKey = (e: MouseEvent | KeyboardEvent) => {
      if (isDragging) return;
      const media = getMediaElement();
      if (!media) return;
      // Let SiYuan's native confirm/cancel position mode own the gesture.
      if (media.style.cursor === "move") return;
      if (e.altKey || this.options.directDrag) {
        background.style.cursor = "grab";
      } else {
        background.style.cursor = "";
      }
    };

    const handleMouseLeave = () => {
      if (!isDragging) {
        background.style.cursor = "";
      }
      if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    // 滚轮微调 (Alt + Wheel)
    const handleWheel = (e: WheelEvent) => {
      if (!e.altKey) return;
      const media = getMediaElement();
      if (!media) return;

      e.preventDefault();
      e.stopPropagation();

      currentPositionY = parsePositionY(media);
      const step = e.deltaY > 0 ? 2.5 : -2.5;
      updateElementsPosition(currentPositionY + step);

      showHUD(currentPositionY, "滚轮微调");

      if (wheelSaveTimer) clearTimeout(wheelSaveTimer);
      wheelSaveTimer = setTimeout(() => {
        savePositionToBlock(currentPositionY);
        hideHUD(800);
      }, 400);
    };

    // 鼠标按下：统一处理 Alt 拖拽、长按 300ms 激活、直接拖拽
    const handleMouseDown = (e: MouseEvent) => {
      if (e.button !== 0) return;

      const target = e.target as HTMLElement | null;
      if (target?.closest(".protyle-icons, .protyle-background__action, .protyle-background__tags, button, [data-type], .damophus-position-hud")) {
        return;
      }

      const media = getMediaElement();
      if (!media) return;
      if (media.style.cursor === "move") return;

      startX = e.clientX;
      startY = e.clientY;
      startPositionY = parsePositionY(media);
      currentPositionY = startPositionY;

      const isAlt = e.altKey;
      const isDirect = this.options.directDrag === true;

      if (isAlt || isDirect) {
        e.preventDefault();
        isDragging = true;
        background.style.cursor = "grabbing";
        document.body.style.cursor = "grabbing";
        showHUD(currentPositionY, isAlt ? "Alt 快捷拖拽" : "题头图拖拽");
      } else {
        if (longPressTimer) clearTimeout(longPressTimer);
        longPressTimer = setTimeout(() => {
          isLongPressActive = true;
          isDragging = true;
          background.style.cursor = "grabbing";
          document.body.style.cursor = "grabbing";
          showHUD(currentPositionY, "长按已激活");
        }, 300);
      }

      const onWindowMouseMove = (moveEvent: MouseEvent) => {
        const moveDist = Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY);

        if (!isDragging && longPressTimer && moveDist > 6) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
          return;
        }

        if (!isDragging) return;

        moveEvent.preventDefault();

        const containerHeight = background.clientHeight || 200;
        const deltaPercent = ((startY - moveEvent.clientY) / containerHeight) * 100 + startPositionY;
        updateElementsPosition(deltaPercent);

        const label = isAlt ? "Alt 快捷拖拽" : isLongPressActive ? "长按拖拽" : "题头图拖拽";
        showHUD(currentPositionY, label);
      };

      const onWindowMouseUp = (upEvent: MouseEvent) => {
        if (longPressTimer) {
          clearTimeout(longPressTimer);
          longPressTimer = null;
        }

        window.removeEventListener("mousemove", onWindowMouseMove);
        window.removeEventListener("mouseup", onWindowMouseUp);

        background.style.cursor = "";
        document.body.style.cursor = "";

      if (isDragging) {
          isDragging = false;
          isLongPressActive = false;
          upEvent.preventDefault();
          upEvent.stopPropagation();

          log.info("custom drag finished", { position: currentPositionY });
          savePositionToBlock(currentPositionY);
          hideHUD(800);
        }
      };

      window.addEventListener("mousemove", onWindowMouseMove);
      window.addEventListener("mouseup", onWindowMouseUp);
    };

    background.addEventListener("mousedown", handleMouseDown);
    background.addEventListener("wheel", handleWheel, { passive: false });
    background.addEventListener("mousemove", handleMouseMoveOrKey, { passive: true });
    background.addEventListener("mouseleave", handleMouseLeave, { passive: true });

    return () => {
      if (longPressTimer) clearTimeout(longPressTimer);
      if (wheelSaveTimer) clearTimeout(wheelSaveTimer);
      if (positionObserverTimer) clearTimeout(positionObserverTimer);
      positionObserver.disconnect();
      document.removeEventListener("mouseup", handleNativePositionMouseUp, true);
      background.removeEventListener("click", handleNativeToolbarClick, true);
      background.removeEventListener("mousedown", handleMouseDown);
      background.removeEventListener("wheel", handleWheel);
      background.removeEventListener("mousemove", handleMouseMoveOrKey);
      background.removeEventListener("mouseleave", handleMouseLeave);
      background.style.cursor = "";
      const hud = background.querySelector(".damophus-position-hud");
      hud?.remove();
    };
  }

  private observeGalleryVideos(wysiwyg: HTMLElement): () => void {
    const replaceImgWithVideo = (img: HTMLImageElement) => {
      const src = img.src || img.getAttribute("src") || "";
      if (!isVideoUrl(src)) return;
      if (img.parentElement?.querySelector("video.damophus-gallery-video")) return;

      const video = document.createElement("video");
      video.src = src;
      video.muted = true;
      video.loop = true;
      video.playsInline = true;
      video.className = "damophus-gallery-video";
      video.setAttribute(
        "style",
        img.getAttribute("style") || "width: 100%; height: 100%; object-fit: cover;",
      );

      video.addEventListener("click", (e) => {
        e.stopPropagation();
        if (video.paused) {
          void video.play();
        } else {
          video.pause();
        }
      });

      img.before(video);
      img.classList.add("fn__none");
    };

    // 初始扫描仅执行一次
    const images = wysiwyg.querySelectorAll<HTMLImageElement>("img");
    images.forEach(replaceImgWithVideo);

    // 仅监听新增节点，避免每次 DOM 变化进行全量 querySelectorAll
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList") {
          mutation.addedNodes.forEach((node) => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (el.tagName === "IMG") {
                replaceImgWithVideo(el as HTMLImageElement);
              } else if (el.querySelectorAll) {
                const imgs = el.querySelectorAll<HTMLImageElement>("img");
                imgs.forEach(replaceImgWithVideo);
              }
            }
          });
        }
      }
    });

    observer.observe(wysiwyg, {
      childList: true,
      subtree: true,
    });

    return () => {
      observer.disconnect();
      const videos = wysiwyg.querySelectorAll("video.damophus-gallery-video");
      videos.forEach((v) => v.remove());
      const hiddenImages = wysiwyg.querySelectorAll("img.fn__none");
      hiddenImages.forEach((img) => img.classList.remove("fn__none"));
    };
  }
}

export function startMoreBackground(options: MoreBackgroundOptions): MoreBackgroundHandle {
  return new MoreBackgroundController(options);
}

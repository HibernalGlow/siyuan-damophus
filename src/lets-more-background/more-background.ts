import { Menu, showMessage } from "siyuan";
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
import { isBooruSource, proxyFetchImageBlob, resolveBooruImageInfo, type BooruResolvedInfo } from "./booru";
import { settings } from "@/settings";

const log = getLogger("lets-more-background");
const BUTTON_ATTR = "data-damophus-more-background";
const COVER_LAYOUT_STYLE_ID = "damophus-more-background-layout-style";
const LOCAL_CACHE_QUALITY = 75;
const DEFAULT_LOCAL_CACHE_ROOT = "/storage/petal/siyuan-damophus/more-background/covers";
const DEFAULT_LOCAL_CACHE_PATH_TEMPLATE = "{year}/{month}/{hash}.webp";
const SYNCIGNORE_PATH = "/data/.siyuan/syncignore";
const LOCAL_CACHE_INDEX_NAME = "index.json";
const COVER_SOURCE_ATTRIBUTE = "custom-damophus-cover-source-url";
const COVER_CACHE_ATTRIBUTE = "custom-damophus-cover-cache-path";
const objectUrls = new WeakMap<HTMLImageElement, string>();

export type CoverToolbarPosition = "adaptive" | "belowTags" | "belowIcon" | "native" | "custom";

export interface MoreBackgroundOptions {
  width: number;
  height: number;
  assetsLocation: string;
  readFromAssets: boolean;
  writeToAssets: boolean;
  localCache: boolean;
  localCacheRoot: string;
  localCachePathTemplate: string;
  localCacheMaxEdge: "none" | "1280" | "1920" | "2560";
  directDrag?: boolean;
  toolbarPosition?: CoverToolbarPosition;
  toolbarCustomX?: number;
  toolbarCustomY?: number;
  coverBreadcrumb?: boolean;
  coverDocumentMenu?: boolean;
  autoAddCoverOnEmptyDoc?: boolean;
  autoRetryOnFailure?: boolean;
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
}

const coverLayoutCss = `
.protyle[data-damophus-cover-layer="raised"] > .protyle-breadcrumb { position: relative; z-index: auto; }
.protyle[data-damophus-cover-layer="raised"] .protyle-background { z-index: 2; }
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
export const MAX_COVER_HISTORY_COUNT = 150;

export function getCoverHistory(): CoverHistoryEntry[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const raw = localStorage.getItem(COVER_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    log.warn("Failed to load cover history from localStorage:", e);
    return [];
  }
}

export function saveCoverHistory(list: CoverHistoryEntry[]): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(COVER_HISTORY_KEY, JSON.stringify(list.slice(0, MAX_COVER_HISTORY_COUNT)));
  } catch (e) {
    log.warn("Failed to save cover history to localStorage:", e);
  }
}

export function recordCoverHistory(entry: Omit<CoverHistoryEntry, "id" | "appliedAt">): void {
  const fullEntry: CoverHistoryEntry = {
    ...entry,
    id: `cov-hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    appliedAt: Date.now(),
  };

  const list = getCoverHistory();
  const nextList = [fullEntry, ...list.filter((it) => it.imageUrl !== fullEntry.imageUrl || it.docId !== fullEntry.docId)].slice(0, MAX_COVER_HISTORY_COUNT);
  saveCoverHistory(nextList);
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
    for (const root of [...this.rootCleanups.keys()]) this.scanRoot(root);
  }

  scanRoot(root: HTMLElement): void {
    if (!root || !root.isConnected) return;
    this.disposeRoot(root);

    const cleanups: Array<() => void> = [];

    cleanups.push(applyCoverLayout(root, this.options));

    // 1. 初始化标题栏与题头图控制按钮
    const coverControlsCleanup = this.initTitleCoverControls(root);
    cleanups.push(coverControlsCleanup);
    void this.hydrateLocalCache(root);
    cleanups.push(() => this.releaseLocalCache(root));

    // 2. 初始化视频背景与题头图多合一位置调整 (Alt拖拽/长按/滚轮/直接拖)
    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (background) {
      const bgCleanup = this.initVideoBackground(background);
      cleanups.push(bgCleanup);
      const posCleanup = this.initCoverPositionControls(background);
      cleanups.push(posCleanup);
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
        if (iconsContainer.querySelector(`[${BUTTON_ATTR}]`)) return;
        const firstIcon =
          iconsContainer.querySelector(".protyle-icon.ariaLabel") || iconsContainer.firstElementChild;
        if (!firstIcon) return;

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
          const currentPostTags =
            bg.getAttribute("data-damophus-post-tags") ||
            bg.querySelector("img")?.getAttribute("data-damophus-post-tags") ||
            "";
          const currentPostUrl =
            bg.getAttribute("data-damophus-post-url") ||
            bg.querySelector("img")?.getAttribute("data-damophus-post-url") ||
            "";
          const currentPostSite = bg.getAttribute("data-damophus-post-site") || "";
          const currentPostId = bg.getAttribute("data-damophus-post-id") || "";
          const currentDimensions = bg.getAttribute("data-damophus-post-dimensions") || "";
          const currentScore = bg.getAttribute("data-damophus-post-score") || "";

          openCoverTagViewer({
            site: currentPostSite,
            postId: currentPostId,
            postUrl: currentPostUrl,
            tags: currentPostTags,
            score: currentScore,
            width: currentDimensions ? currentDimensions.split("×")[0]?.trim() : "",
            height: currentDimensions ? currentDimensions.split("×")[1]?.trim() : "",
          });
        });

        firstIcon.before(button);
        firstIcon.before(tagButton);
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
      const injected = root.querySelectorAll(
        `[${BUTTON_ATTR}], [data-damophus-more-background-title-btn]`,
      );
      injected.forEach((el) => el.remove());
    };
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
      label: `${isAutoCover ? "✓ " : ""}${this.options.t("lets-more-background.autoAddCoverOnEmptyDoc") || "自动为无题头图文档添加 (使用上次模板)"}`,
      icon: "iconSparkles",
      click: () => {
        const nextVal = !isAutoCover;
        this.options.autoAddCoverOnEmptyDoc = nextVal;
        try {
          settings.setBySpace("moreBackground", "autoAddCoverOnEmptyDoc", nextVal);
          void settings.save();
        } catch {}
        showMessage(nextVal ? "已开启：打开无题头图文档时自动补图" : "已关闭：无题头图文档自动补图");
      },
    });

    const isAutoRetry = this.options.autoRetryOnFailure !== false;
    menu.addItem({
      label: `${isAutoRetry ? "✓ " : ""}${this.options.t("lets-more-background.autoRetryOnFailure") || "加载失败自动重试"}`,
      icon: "iconRefresh",
      click: () => {
        const nextVal = !isAutoRetry;
        this.options.autoRetryOnFailure = nextVal;
        try {
          settings.setBySpace("moreBackground", "autoRetryOnFailure", nextVal);
          void settings.save();
        } catch {}
        showMessage(nextVal ? "已开启：加载失败自动多轮重试" : "已关闭：加载失败自动重试");
      },
    });

    menu.addSeparator();

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
  ): Promise<void> {
    background.style.cursor = "wait";
    const autoRetry = this.options.autoRetryOnFailure !== false;
    const effectiveMaxRetries = autoRetry ? maxRetries : 1;

    try {
      let finalImageUrl = url;
      let postInfo: BooruResolvedInfo | null = null;

      if (isBooruSource(url)) {
        const credentials = this.options.siteCredentials;
        const globalBlacklist = this.options.blacklistedTags || DEFAULT_BLACKLISTED_TAGS;
        postInfo = await resolveBooruImageInfo(url, credentials, globalBlacklist);

        if (!postInfo || !postInfo.imageUrl) {
          if (attempt < effectiveMaxRetries) {
            log.info(`Fetch cover filtered/failed (attempt ${attempt}/${effectiveMaxRetries}), retrying...`);
            showMessage(`正在尝试重新匹配符合条件的题头图 (第 ${attempt + 1}/${effectiveMaxRetries} 次)...`);
            await new Promise((r) => setTimeout(r, 400));
            return this.fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries);
          }
          showMessage("未找到满足条件（宽高比/评分/已排除屏蔽词）的题头图，建议放宽筛选条件");
          return;
        }

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
            return this.fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries);
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
        return this.fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries);
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
      await this.setBlockBackgroundImage(background, sourceUrl || await this.blobToBase64(blob), postInfo);
      return;
    }
    const { name } = await detectImageTypeAndName(blob);
    const location = sanitizeAssetsPath(this.options.assetsLocation);

    const assetPath = await this.uploadToAssets(blob, name, location);
    if (assetPath) {
      await this.setBlockBackgroundImage(background, assetPath, postInfo);
    } else {
      const base64 = await this.blobToBase64(blob);
      await this.setBlockBackgroundImage(background, base64, postInfo);
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

    const attrs: Record<string, string> = {
      "title-img": `background-image:url("${finalVal}")`,
    };
    if (urlOrPath.startsWith("http://") || urlOrPath.startsWith("https://")) {
      attrs[COVER_SOURCE_ATTRIBUTE] = urlOrPath;
    }
    if (cachePath) attrs[COVER_CACHE_ATTRIBUTE] = cachePath;

    const tags = background.getAttribute("data-damophus-post-tags");
    if (tags) attrs["custom-damophus-post-tags"] = tags;
    const site = background.getAttribute("data-damophus-post-site");
    if (site) attrs["custom-damophus-post-site"] = site;
    const postId = background.getAttribute("data-damophus-post-id");
    if (postId) attrs["custom-damophus-post-id"] = postId;
    const postUrl = background.getAttribute("data-damophus-post-url");
    if (postUrl) attrs["custom-damophus-post-url"] = postUrl;
    const score = background.getAttribute("data-damophus-post-score");
    if (score) attrs["custom-damophus-post-score"] = score;
    const dimensions = background.getAttribute("data-damophus-post-dimensions");
    if (dimensions) attrs["custom-damophus-post-dimensions"] = dimensions;

    await fetch("/api/attr/setBlockAttrs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: blockId,
        attrs,
      }),
    });

    // 记录到历史记录
    try {
      const protyle = background.closest(".protyle");
      const docTitle =
        protyle?.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim() ||
        protyle?.querySelector<HTMLElement>(".protyle-title")?.textContent?.trim() ||
        protyle?.querySelector<HTMLElement>(".protyle-breadcrumb__bar")?.textContent?.trim() ||
        "当前文档";

      const lastUsed = getLastUsedSource();
      recordCoverHistory({
        docId: blockId,
        docTitle,
        imageUrl: finalVal,
        postUrl: postUrl || postInfo?.postUrl,
        site: site || postInfo?.site,
        postId: postId || postInfo?.postId,
        tags: tags ? tags.split(/\s+/) : postInfo?.tags,
        templateName: lastUsed?.label,
      });
    } catch (histErr) {
      log.debug("Failed to record cover history:", histErr);
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
      const sourceUrl = attrs?.[COVER_SOURCE_ATTRIBUTE];
      if (!sourceUrl) return;
      const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
      if (!image) return;
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
            body: JSON.stringify({ id: blockId, attrs: { [COVER_CACHE_ATTRIBUTE]: expected } }),
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
      const pos = el.style.objectPosition || "";
      if (!pos) return 50;
      const match = pos.match(/(\d+(?:\.\d+)?)%/);
      if (match) return parseFloat(match[1]);
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

    const savePositionToBlock = async (positionPercent: number) => {
      const blockId =
        background.getAttribute("data-node-id") ||
        background.closest(".protyle")?.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
        background.closest(".protyle")?.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id");

      if (!blockId) return;

      const img = background.querySelector<HTMLImageElement>(".protyle-background__img img");
      const video = background.querySelector<HTMLVideoElement>(".protyle-background__video");
      const src = img?.dataset.damophusOriginalUrl
        || img?.getAttribute("src")
        || img?.src
        || video?.getAttribute("src")
        || video?.src
        || "";
      if (!src) return;

      let cleanSrc = src.trim();
      if (!cleanSrc.startsWith("data:") && !cleanSrc.startsWith("http://") && !cleanSrc.startsWith("https://")) {
        cleanSrc = cleanSrc.replace(/^\/+/, "");
      }

      const clampedVal = Math.max(0, Math.min(100, positionPercent)).toFixed(2);
      const titleImgAttr = `background-image:url("${cleanSrc}");object-position:center ${clampedVal}%;`;

      const attrs: Record<string, string> = {
        "title-img": titleImgAttr,
      };

      const tags = background.getAttribute("data-damophus-post-tags");
      if (tags) attrs["custom-damophus-post-tags"] = tags;
      const site = background.getAttribute("data-damophus-post-site");
      if (site) attrs["custom-damophus-post-site"] = site;
      const postId = background.getAttribute("data-damophus-post-id");
      if (postId) attrs["custom-damophus-post-id"] = postId;
      const postUrl = background.getAttribute("data-damophus-post-url");
      if (postUrl) attrs["custom-damophus-post-url"] = postUrl;
      const score = background.getAttribute("data-damophus-post-score");
      if (score) attrs["custom-damophus-post-score"] = score;
      const dimensions = background.getAttribute("data-damophus-post-dimensions");
      if (dimensions) attrs["custom-damophus-post-dimensions"] = dimensions;

      try {
        await fetch("/api/attr/setBlockAttrs", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: blockId,
            attrs,
          }),
        });
      } catch (e) {
        log.error("Failed to save cover position:", e);
      }
    };

    // 鼠标悬停及按键响应
    const handleMouseMoveOrKey = (e: MouseEvent | KeyboardEvent) => {
      if (isDragging) return;
      const media = getMediaElement();
      if (!media) return;
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
        void savePositionToBlock(currentPositionY);
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

          void savePositionToBlock(currentPositionY);
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

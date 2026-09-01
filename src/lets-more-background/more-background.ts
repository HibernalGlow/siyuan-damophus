import { showMessage } from "siyuan";
import { getLogger } from "@/libs/logger";
import { getHPathByID } from "@/api";
import {
  formatCoverUrl,
  sanitizeAssetsPath,
  DEFAULT_COVER_SOURCES,
  type CoverSourceItem,
  type SiteCredential,
} from "./sources";
import { resolveManualBooruUrl } from "./booru";
import {
  createGachaFlow,
  type CoverGachaFlow,
} from "./cover-gacha";
import { applyCoverLimits } from "./cover-history";
import {
  applyCoverLayout,
  ensureCoverLayoutStyle,
  removeCoverLayoutStyle,
  type CoverToolbarPosition,
} from "./cover-layout";
import {
  triggerRandomIfNoImg,
  type CoverCacheMaxEdge,
  COVER_CACHE_ATTRIBUTE,
  COVER_SOURCE_ATTRIBUTE,
} from "./cover-local-cache";
import { loadDedupCoverUrls, filterUnusedCoverAssets } from "./cover-dedup-set";
import { normalizeCoverUrl } from "./cover-dedup";
import { readBlockAttrs } from "./cover-attrs";
import { getLastUsedSource, setLastUsedSource } from "./cover-last-used";
import {
  coverFavoriteKey,
  loadCoverFavorites,
  removeCoverFavorite,
  upsertCoverFavorite,
  FAVORITES_CHANGED_EVENT,
  type CoverFavoriteInput,
} from "./cover-favorites";
import { createCoverService, type CoverApplyService } from "./cover-service";
import {
  initCoverPositionControls,
  restoreCoverPosition,
  resetMobileCoverPositions,
} from "./cover-position-controls";
import { initVideoBackground, observeGalleryVideos } from "./video-background";
import { initCoverTagOverlay, openTagViewerForBackground } from "./tag-viewer";
import { initTitleCoverControls } from "./cover-title-controls";
import { showBackgroundMenu as showCoverBackgroundMenu } from "./cover-background-menu";
import { openCoverHistoryDialog } from "./cover-history-dialog";
import { maintainDocumentCoverCache } from "./cover-local-cache";
import { cleanupLocalCoverCache, type LegacyCoverMaintenanceResult } from "./local-cover-cache-maintenance";
import type { CoverSurfaceActions } from "./cover-actions";

const log = getLogger("lets-more-background");
const dedupLog = getLogger("lets-more-background:dedup");

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
  localCacheMaxEdge: CoverCacheMaxEdge;
  directDrag?: boolean;
  debugLogging?: boolean;
  toolbarPosition?: CoverToolbarPosition;
  toolbarCustomX?: number;
  toolbarCustomY?: number;
  coverBreadcrumb?: boolean;
  coverDocumentMenu?: boolean;
  confirmRemoveCover?: boolean;
  autoAddCoverOnEmptyDoc?: boolean;
  autoRetryOnFailure?: boolean;
  deduplicateNewCovers?: boolean;
  /** 抽卡模式：使用模板先抽出多张候选卡，弹窗选题头图；其余可收藏进暂存区。 */
  gachaMode?: boolean;
  /** 抽卡模式一次抽出的候选卡数量（2–12，默认 6）。 */
  gachaDrawCount?: number;
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
  resetMobileCoverPositions(): Promise<{ cleared: number }>;
}

export class MoreBackgroundController implements MoreBackgroundHandle, CoverSurfaceActions {
  private options: MoreBackgroundOptions;
  private readonly rootCleanups = new Map<HTMLElement, () => void>();
  private service!: CoverApplyService;
  private gacha!: CoverGachaFlow;

  constructor(options: MoreBackgroundOptions) {
    this.options = options;
    applyCoverLimits(options.coverHistoryLimit, options.coverSeenLimit);
    ensureNoReferrerMeta();
    ensureCoverLayoutStyle();
    this.rebuildFeatures();
  }

  /** Feature objects capture the options object, so rebuild them on replacement. */
  private rebuildFeatures(): void {
    this.service = createCoverService(this.options, {
      restoreCoverPosition: (background) => restoreCoverPosition(background),
    });
    this.gacha = createGachaFlow({
      options: this.options,
      service: this.service,
      findCoverBlockId: (root, background) => this.findCoverBlockId(root, background),
      resolveDocTitle: (root, background) => this.resolveDocTitle(root, background),
    });
  }

  getOptions(): MoreBackgroundOptions {
    return this.options;
  }

  updateOptions(options: MoreBackgroundOptions): void {
    this.options = options;
    applyCoverLimits(options.coverHistoryLimit, options.coverSeenLimit);
    this.rebuildFeatures();
    for (const root of [...this.rootCleanups.keys()]) this.scanRoot(root);
  }

  async maintainLocalCache(documentLink: string): Promise<LegacyCoverMaintenanceResult> {
    return maintainDocumentCoverCache(this.options, documentLink);
  }

  async cleanupLocalCache(): Promise<{ removed: number; kept: number }> {
    if (!this.options.localCache) throw new Error("Local cover cache is disabled");
    return cleanupLocalCoverCache(this.options.localCacheRoot);
  }

  async resetMobileCoverPositions(): Promise<{ cleared: number }> {
    return resetMobileCoverPositions(() => this.rootCleanups.keys());
  }

  scanRoot(root: HTMLElement): void {
    if (!root || !root.isConnected) return;
    this.disposeRoot(root);

    const cleanups: Array<() => void> = [];

    cleanups.push(applyCoverLayout(root, this.options));

    // 1. 初始化标题栏与题头图控制按钮
    cleanups.push(initTitleCoverControls(root, this));
    void this.service.hydrateLocalCache(root).finally(() => {
      const background = root.querySelector<HTMLElement>(".protyle-background");
      if (background) void restoreCoverPosition(background);
    });
    cleanups.push(() => this.service.releaseLocalCache(root));

    // 2. 初始化视频背景与题头图多合一位置调整 (Alt拖拽/长按/滚轮/直接拖)
    const background = root.querySelector<HTMLElement>(".protyle-background");
    if (background) {
      cleanups.push(initVideoBackground(background));
      cleanups.push(this.service.initCoverCacheReconciler(background));
      cleanups.push(initCoverPositionControls(background, this.options));
      void restoreCoverPosition(background);
      cleanups.push(initCoverTagOverlay(root));
    }

    // 3. 画廊视频观察器
    const wysiwyg = root.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (wysiwyg) {
      cleanups.push(observeGalleryVideos(wysiwyg));
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
    removeCoverLayoutStyle();
  }

  private findCoverBlockId(root: HTMLElement, background: HTMLElement): string {
    return background.getAttribute("data-node-id") ||
      root.querySelector<HTMLElement>(".protyle-title")?.getAttribute("data-node-id") ||
      root.querySelector<HTMLElement>("[data-node-id]")?.getAttribute("data-node-id") ||
      "";
  }

  /** 浮窗标题用：标明这张抽卡面板作用于哪个文档，多窗并开时不会认错。 */
  private resolveDocTitle(root: HTMLElement, background: HTMLElement): string {
    const protyle = background.closest(".protyle");
    return (
      protyle?.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim() ||
      protyle?.querySelector<HTMLElement>(".protyle-title")?.textContent?.trim() ||
      root.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim() ||
      this.options.t("lets-more-background.currentDocument")
    );
  }

  private async getCoverFavoriteInput(root: HTMLElement, background: HTMLElement): Promise<CoverFavoriteInput | null> {
    const blockId = this.findCoverBlockId(root, background);
    if (!blockId) return null;
    const attrs = await readBlockAttrs(blockId);

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

  async refreshFavoriteButton(root: HTMLElement, background: HTMLElement, button: HTMLElement): Promise<void> {
    const input = await this.getCoverFavoriteInput(root, background);
    if (!input) return;
    const favorites = await loadCoverFavorites();
    const favorite = favorites.some((item) => coverFavoriteKey(item) === coverFavoriteKey(input));
    button.dataset.favorited = favorite ? "true" : "false";
    button.setAttribute("aria-label", favorite ? "取消收藏当前题头图" : "收藏当前题头图");
    button.title = favorite ? "已收藏当前题头图（再次点击取消收藏）" : "收藏当前题头图（再次点击取消收藏）";
    button.style.color = favorite ? "var(--b3-theme-primary)" : "";
  }

  async toggleCoverFavorite(root: HTMLElement, background: HTMLElement, button: HTMLElement): Promise<void> {
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
      const input = await this.service.ensureFavoriteCache(rawInput);
      await upsertCoverFavorite(input);
      showMessage(input.cachePath
        ? "题头图已收藏，网址、文档和本地缓存信息已保存"
        : "题头图已收藏，网址和文档信息已保存");
    }
    await this.refreshFavoriteButton(root, background, button);
    if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FAVORITES_CHANGED_EVENT));
  }

  async showBackgroundMenu(rect: DOMRect, root: HTMLElement, background: HTMLElement): Promise<void> {
    await showCoverBackgroundMenu(rect, root, background, this);
  }

  openTagViewerForBackground(background: HTMLElement): void {
    openTagViewerForBackground(background);
  }

  async applyRandomSource(
    item: CoverSourceItem,
    root: HTMLElement,
    background: HTMLElement,
  ): Promise<void> {
    setLastUsedSource(item);
    const url = formatCoverUrl(item.url, this.options.width, this.options.height);
    if (!url) return;

    if (this.options.gachaMode === true) {
      await this.gacha.openGachaDraw(item, url, root, background);
      return;
    }
    await this.applyRandomSourceImmediate(item, root, background);
  }

  /** 直接随机应用一张（不抽卡弹窗）；自动补图与抽卡关闭时走这里。 */
  async applyRandomSourceImmediate(
    item: CoverSourceItem,
    root: HTMLElement,
    background: HTMLElement,
  ): Promise<void> {
    setLastUsedSource(item);
    const url = formatCoverUrl(item.url, this.options.width, this.options.height);
    if (!url) return;

    triggerRandomIfNoImg(root);
    await this.service.fetchAndSetBackground(url, background);
  }

  applyFromStash(root: HTMLElement, background: HTMLElement): Promise<void> {
    return this.gacha.applyFromStash(root, background);
  }

  async applyManualCoverUrl(background: HTMLElement): Promise<void> {
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
      this.service.applyPostMetadata(background, info);
      await this.service.fetchAndSetBackground(info.imageUrl, background, 1, 1, undefined, info);
      showMessage(this.options.t("lets-more-background.manualCoverSuccess"));
    } catch (error) {
      log.warn("Failed to apply manually selected cover:", error);
      showMessage(this.options.t("lets-more-background.manualCoverFailed"));
    } finally {
      background.style.cursor = "";
    }
  }

  openCoverHistory(background: HTMLElement): void {
    openCoverHistoryDialog(background, { t: this.options.t, service: this.service });
  }

  async applyFromClipboard(root: HTMLElement, background: HTMLElement): Promise<void> {
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
      await this.service.saveBlobAndSetBackground(imageBlob, background);
    } catch (e) {
      log.error("Failed to read clipboard:", e);
      showMessage(this.options.t("lets-more-background.noImageInClipboard"));
    }
  }

  async applyFromAssets(root: HTMLElement, background: HTMLElement): Promise<void> {
    if (!this.options.readFromAssets) return;
    const location = sanitizeAssetsPath(this.options.assetsLocation);
    const files = await this.service.listImageFiles(location);

    if (!files || files.length === 0) {
      showMessage(this.options.t("lets-more-background.emptyAssets"));
      return;
    }

    let candidates = files;
    if (this.options.deduplicateNewCovers !== false) {
      try {
        const excluded = await loadDedupCoverUrls(background, this.options.localCacheRoot);
        candidates = filterUnusedCoverAssets(files, excluded);
        dedupLog.info("Filtered local asset covers", {
          total: files.length,
          excluded: files.length - candidates.length,
          available: candidates.length,
        });
      } catch (error) {
        dedupLog.warn("Failed to load used covers before local asset selection:", error);
      }
    }

    if (candidates.length === 0) {
      showMessage(this.options.t("lets-more-background.noUnusedAssets"));
      return;
    }

    const randomIndex = Math.floor(Math.random() * candidates.length);
    const chosenFile = candidates[randomIndex];
    triggerRandomIfNoImg(root);
    await this.service.setBlockBackgroundImage(background, chosenFile);
  }
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
      // 自动补图保持静默：即使抽卡模式开启也不弹选择窗口。
      void controller.applyRandomSourceImmediate(lastUsed, root, currentBg);
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

export function startMoreBackground(options: MoreBackgroundOptions): MoreBackgroundHandle {
  return new MoreBackgroundController(options);
}

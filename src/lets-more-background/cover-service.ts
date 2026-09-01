import { showMessage } from "siyuan";
import { getLogger } from "@/libs/logger";
import { sql } from "@/api";
import type { BooruResolvedInfo } from "./booru";
import { isBooruSource, proxyFetchImageBlob, resolveBooruImageInfo } from "./booru";
import {
  detectImageTypeAndName,
  displayLocalCache,
  ensureSyncIgnore,
  convertToWebp,
  inferCoverSourceFromImage,
  isRemoteImageUrl,
  localCachePath,
  readLocalCache,
  releaseLocalCacheObjectUrl,
  updateLocalCacheIndex,
  uploadLocalCacheBlob,
  removeLocalCacheIndexEntry,
  COVER_CACHE_ATTRIBUTE,
  COVER_SOURCE_ATTRIBUTE,
  LOCAL_CACHE_QUALITY,
} from "./cover-local-cache";
import { recordCoverHistory, recordSeenCover } from "./cover-history";
import { getLastUsedSource } from "./cover-last-used";
import { loadDedupCoverUrls } from "./cover-dedup-set";
import { normalizeCoverAssetPath, normalizeCoverUrl } from "./cover-dedup";
import { COVER_POSITION_ATTRIBUTE, COVER_POSITION_MOBILE_ATTRIBUTE } from "./cover-position";
import { DEFAULT_BLACKLISTED_TAGS, sanitizeAssetsPath } from "./sources";
import type { MoreBackgroundOptions } from "./more-background";
import type { CoverFavoriteInput } from "./cover-favorites";

const log = getLogger("lets-more-background");
const dedupLog = getLogger("lets-more-background:dedup");
const historyLog = getLogger("lets-more-background:history");

export interface CoverServiceHooks {
  /** Re-applies the stored position after the cover image is replaced. */
  restoreCoverPosition(background: HTMLElement): Promise<void> | void;
}

export interface CoverApplyService {
  applyPostMetadata(background: HTMLElement, postInfo: BooruResolvedInfo): void;
  fetchAndSetBackground(
    url: string,
    background: HTMLElement,
    attempt?: number,
    maxRetries?: number,
    excludedCoverUrls?: ReadonlySet<string>,
    resolvedPostInfo?: BooruResolvedInfo | null,
  ): Promise<void>;
  saveBlobAndSetBackground(
    blob: Blob,
    background: HTMLElement,
    postInfo?: BooruResolvedInfo | null,
    sourceUrl?: string,
  ): Promise<void>;
  setBlockBackgroundImage(
    background: HTMLElement,
    urlOrPath: string,
    postInfo?: BooruResolvedInfo | null,
    cachePath?: string,
    sourceUrl?: string,
  ): Promise<void>;
  uploadToAssets(blob: Blob, name: string, location: string): Promise<string | null>;
  blobToBase64(blob: Blob): Promise<string>;
  recordReplacedCover(
    blockId: string,
    docTitle: string,
    previous: { titleImg: string; sourceUrl: string; site: string; postId: string; postUrl: string; tags: string },
  ): void;
  purgeCoverCacheFile(cachePath: string, exceptBlockId?: string): Promise<void>;
  initCoverCacheReconciler(background: HTMLElement): () => void;
  hydrateLocalCache(root: HTMLElement): Promise<void>;
  releaseLocalCache(root: HTMLElement): void;
  listImageFiles(path: string): Promise<string[] | null>;
  ensureFavoriteCache(input: CoverFavoriteInput): Promise<CoverFavoriteInput>;
}

/**
 * Owns everything required to turn a chosen cover (remote URL, blob, asset
 * path or clipboard image) into the document's title cover: dedup-aware
 * fetching, WebP local caching, asset upload, block-attr writing, replaced-
 * cover recording and stale-metadata reconciliation after native edits.
 */
export function createCoverService(
  options: MoreBackgroundOptions,
  hooks: CoverServiceHooks,
): CoverApplyService {
  async function purgeCoverCacheFile(cachePath: string, exceptBlockId?: string): Promise<void> {
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
        await removeLocalCacheIndexEntry(options.localCacheRoot, cachePath);
        log.info("Purged local cover cache file:", cachePath);
      }
    } catch (error) {
      log.warn("Failed to purge local cover cache file:", error);
    }
  }

  async function reconcileCoverCache(background: HTMLElement): Promise<void> {
    if (!options.localCache) return;
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
      const protyle = background.closest(".protyle");
      const docTitle =
        protyle?.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim() ||
        protyle?.querySelector<HTMLElement>(".protyle-title")?.textContent?.trim() ||
        protyle?.querySelector<HTMLElement>(".protyle-breadcrumb__bar")?.textContent?.trim() ||
        "Current document";
      recordReplacedCover(blockId, docTitle, {
        titleImg: cachePath,
        sourceUrl,
        site: attrs["custom-damophus-post-site"] || "",
        postId: attrs["custom-damophus-post-id"] || "",
        postUrl: attrs["custom-damophus-post-url"] || "",
        tags: attrs["custom-damophus-post-tags"] || "",
      });
      // The native control changed the title cover, so its custom metadata is stale.
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
      if (cachePath && options.purgeCacheOnCoverChange) {
        await purgeCoverCacheFile(cachePath, blockId);
      }
    } catch (error) {
      log.debug("Failed to reconcile cover cache:", error);
    }
  }

  function initCoverCacheReconciler(background: HTMLElement): () => void {
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
        void reconcileCoverCache(background);
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

  function applyPostMetadata(background: HTMLElement, postInfo: BooruResolvedInfo): void {
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

  async function fetchAndSetBackground(
    url: string,
    background: HTMLElement,
    attempt = 1,
    maxRetries = 10,
    excludedCoverUrls?: ReadonlySet<string>,
    resolvedPostInfo?: BooruResolvedInfo | null,
  ): Promise<void> {
    background.style.cursor = "wait";
    const autoRetry = options.autoRetryOnFailure !== false;
    const effectiveMaxRetries = autoRetry ? maxRetries : 1;
    let deduplicationUrls = excludedCoverUrls;

    try {
      let finalImageUrl = url;
      let postInfo: BooruResolvedInfo | null = resolvedPostInfo || null;

      if (isBooruSource(url) && !postInfo) {
        if (options.deduplicateNewCovers !== false && !deduplicationUrls) {
          dedupLog.info("Deduplication enabled, loading previously used cover URLs");
          try {
            deduplicationUrls = await loadDedupCoverUrls(background, options.localCacheRoot);
          } catch (error) {
            dedupLog.warn("Failed to load used cover URLs:", error);
            deduplicationUrls = new Set();
          }
        } else if (options.deduplicateNewCovers === false) {
          dedupLog.info("Deduplication disabled, previously used covers may be selected again");
        }
        const credentials = options.siteCredentials;
        const globalBlacklist = options.blacklistedTags || DEFAULT_BLACKLISTED_TAGS;
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
            return fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries, deduplicationUrls);
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

      if (options.writeToAssets || options.localCache) {
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
          await saveBlobAndSetBackground(blob, background, postInfo, finalImageUrl);
        } else {
          if (attempt < effectiveMaxRetries && isBooruSource(url)) {
            log.info(`Image blob download failed (attempt ${attempt}/${effectiveMaxRetries}), retrying another post...`);
            showMessage(`图片下载受限，正在重试其他候选图 (第 ${attempt + 1}/${effectiveMaxRetries} 次)...`);
            await new Promise((r) => setTimeout(r, 400));
            return fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries, deduplicationUrls);
          }
          await setBlockBackgroundImage(background, finalImageUrl, postInfo);
        }
      } else {
        await setBlockBackgroundImage(background, finalImageUrl, postInfo);
      }
    } catch (e: any) {
      log.error("Failed to fetch image from URL:", url, e);
      if (attempt < effectiveMaxRetries && isBooruSource(url)) {
        showMessage(`获取异常，正在重试 (第 ${attempt + 1}/${effectiveMaxRetries} 次)...`);
        await new Promise((r) => setTimeout(r, 500));
        return fetchAndSetBackground(url, background, attempt + 1, effectiveMaxRetries, deduplicationUrls);
      }
      showMessage(options.t("lets-more-background.loadUrlFailed"));
    } finally {
      background.style.cursor = "";
    }
  }

  async function saveBlobAndSetBackground(
    blob: Blob,
    background: HTMLElement,
    postInfo?: BooruResolvedInfo | null,
    sourceUrl?: string,
  ): Promise<void> {
    if (options.localCache && sourceUrl) {
      try {
        const processed = await convertToWebp(blob, options.localCacheMaxEdge);
        const cachePath = localCachePath(options.localCacheRoot, options.localCachePathTemplate, {
          sourceUrl,
          maxEdge: options.localCacheMaxEdge,
          site: postInfo?.site,
          postId: postInfo?.postId,
        });
        await ensureSyncIgnore(options.localCacheRoot);
        if (await uploadLocalCacheBlob(processed, cachePath)) {
          await updateLocalCacheIndex(options.localCacheRoot, {
            path: cachePath,
            sourceUrl,
            createdAt: new Date().toISOString(),
            maxEdge: options.localCacheMaxEdge,
            quality: LOCAL_CACHE_QUALITY,
            site: postInfo?.site,
            postId: postInfo?.postId,
            width: postInfo?.width,
            height: postInfo?.height,
            size: processed.size,
          });
          await setBlockBackgroundImage(background, sourceUrl, postInfo, cachePath);
          const image = background.querySelector<HTMLImageElement>(".protyle-background__img img");
          if (image) displayLocalCache(image, processed);
          return;
        }
      } catch (error) {
        log.warn("Failed to create local WebP cover cache:", error);
      }
    }
    if (!options.writeToAssets) {
      await setBlockBackgroundImage(background, sourceUrl || await blobToBase64(blob), postInfo, undefined, sourceUrl);
      return;
    }
    const { name } = await detectImageTypeAndName(blob);
    const location = sanitizeAssetsPath(options.assetsLocation);

    const assetPath = await uploadToAssets(blob, name, location);
    if (assetPath) {
      await setBlockBackgroundImage(background, assetPath, postInfo, undefined, sourceUrl);
    } else {
      const base64 = await blobToBase64(blob);
      await setBlockBackgroundImage(background, base64, postInfo, undefined, sourceUrl);
    }
  }

  async function uploadToAssets(blob: Blob, name: string, location: string): Promise<string | null> {
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
        showMessage(options.t("lets-more-background.writeImgToAssetsFailed"));
        return null;
      }
      return `${location}/${name}`.replace(/^\/+/, "");
    } catch (e) {
      log.error("Failed to save image to assets:", e);
      showMessage(options.t("lets-more-background.writeImgToAssetsFailed"));
      return null;
    }
  }

  function blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.onabort = reject;
      reader.readAsDataURL(blob);
    });
  }

  async function setBlockBackgroundImage(
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
    if (!previousTitleImg || coverReplaced) {
      attrs[COVER_POSITION_ATTRIBUTE] = "";
      attrs[COVER_POSITION_MOBILE_ATTRIBUTE] = "";
    }
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
    setTimeout(() => { void hooks.restoreCoverPosition(background); }, 0);

    // 更换题头图后清理旧封面在本设备的缓存文件
    if (options.purgeCacheOnCoverChange && sourceChanged && previousCachePath && previousCachePath !== cachePath) {
      await purgeCoverCacheFile(previousCachePath, blockId);
    }

    const protyle = background.closest(".protyle");
    const docTitle =
      protyle?.querySelector<HTMLElement>(".protyle-title__input")?.textContent?.trim() ||
      protyle?.querySelector<HTMLElement>(".protyle-title")?.textContent?.trim() ||
      protyle?.querySelector<HTMLElement>(".protyle-breadcrumb__bar")?.textContent?.trim() ||
      "当前文档";

    // 记录被替换掉的旧题头图，确保之后随机选图时不会再次命中它。
    if (coverReplaced) {
      recordReplacedCover(blockId, docTitle, {
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
  function recordReplacedCover(
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
    const localFromTitle = normalizeCoverAssetPath(previous.titleImg);
    const imageUrl = remoteFromSource || remoteFromTitle || localFromTitle || "";
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

  async function hydrateLocalCache(root: HTMLElement): Promise<void> {
    if (!options.localCache) return;
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
      if (!explicitSourceUrl && !options.autoCacheLegacyCovers) return;
      const sourceUrl = explicitSourceUrl || inferCoverSourceFromImage(image);
      if (!sourceUrl) return;
      const current = options.localCacheMaxEdge;
      const expected = localCachePath(options.localCacheRoot, options.localCachePathTemplate, {
        sourceUrl,
        maxEdge: current,
        site: attrs?.["custom-damophus-post-site"],
        postId: attrs?.["custom-damophus-post-id"],
      });
      await ensureSyncIgnore(options.localCacheRoot);
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
        await ensureSyncIgnore(options.localCacheRoot);
        if (await uploadLocalCacheBlob(processed, expected)) {
          await updateLocalCacheIndex(options.localCacheRoot, {
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

  function releaseLocalCache(root: HTMLElement): void {
    const image = root.querySelector<HTMLImageElement>(".protyle-background__img img");
    if (!image) return;
    releaseLocalCacheObjectUrl(image);
  }

  async function listImageFiles(path: string): Promise<string[] | null> {
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
      showMessage(`${options.t("lets-more-background.readAssetsError")}: ${path}`);
      return null;
    }
  }

  async function ensureFavoriteCache(input: CoverFavoriteInput): Promise<CoverFavoriteInput> {
    if (input.cachePath || !isRemoteImageUrl(input.imageUrl)) return input;
    try {
      let blob = await proxyFetchImageBlob(input.imageUrl);
      if (!blob || blob.size === 0) {
        const response = await fetch(input.imageUrl, { referrerPolicy: "no-referrer" });
        if (response.ok) blob = await response.blob();
      }
      if (!blob || blob.size === 0) return input;
      const processed = await convertToWebp(blob, options.localCacheMaxEdge);
      const cachePath = localCachePath(options.localCacheRoot, options.localCachePathTemplate, {
        sourceUrl: input.imageUrl,
        maxEdge: options.localCacheMaxEdge,
        site: input.site,
        postId: input.postId,
      });
      await ensureSyncIgnore(options.localCacheRoot);
      if (!await uploadLocalCacheBlob(processed, cachePath)) return input;
      await updateLocalCacheIndex(options.localCacheRoot, {
        path: cachePath,
        sourceUrl: input.imageUrl,
        createdAt: new Date().toISOString(),
        maxEdge: options.localCacheMaxEdge,
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

  return {
    applyPostMetadata,
    fetchAndSetBackground,
    saveBlobAndSetBackground,
    setBlockBackgroundImage,
    uploadToAssets,
    blobToBase64,
    recordReplacedCover,
    purgeCoverCacheFile,
    initCoverCacheReconciler,
    hydrateLocalCache,
    releaseLocalCache,
    listImageFiles,
    ensureFavoriteCache,
  };
}

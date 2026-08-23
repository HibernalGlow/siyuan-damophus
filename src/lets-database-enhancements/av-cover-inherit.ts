import { sql } from "@/api";
import { getLogger } from "@/libs/logger";

const log = getLogger("lets-database-enhancements:av-cover-inherit");

const TRANSPARENT_IMAGE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export const INHERITED_COVER_CLASS = "damophus-av-inherited-cover";
export const INHERITED_IMG_CLASS = "damophus-av-inherited-img";

export function parseDocTitleImg(ial: string | undefined | null): string | null {
  if (!ial || typeof ial !== "string") return null;
  const match = ial.match(/\b(?:custom-)?title-img="([^"]+)"/);
  if (!match || !match[1]) return null;
  const val = match[1]
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
  return val || null;
}

export function extractTitleImgSource(titleImg: string | undefined | null): string | null {
  const value = String(titleImg || "").trim();
  if (!value) return null;
  const match = value.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i);
  const source = (match?.[1] || match?.[2] || match?.[3] || (match ? "" : value)).trim();
  return /^https?:\/\//i.test(source) ? source : null;
}

export function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function buildCardCoverHTML(titleImg: string): string {
  const safeImg = titleImg.trim();
  if (
    safeImg.startsWith("background") ||
    safeImg.includes("background-image") ||
    safeImg.includes("url(")
  ) {
    let styleStr = safeImg;
    if (!styleStr.endsWith(";")) styleStr += ";";
    styleStr += " width: 100%; height: 100%; object-fit: cover; background-size: cover; background-position: center; background-repeat: no-repeat; display: block;";
    return `<img class="av__gallery-img ${INHERITED_IMG_CLASS}" src="${TRANSPARENT_IMAGE}" style="${escapeAttr(
      styleStr,
    )}">`;
  }
  return `<img loading="lazy" class="av__gallery-img ${INHERITED_IMG_CLASS}" src="${escapeAttr(
    safeImg,
  )}" style="width: 100%; height: 100%; object-fit: cover; display: block;">`;
}

async function readCachedObjectUrl(cachePath: string | null): Promise<string | null> {
  if (!cachePath) return null;
  try {
    const response = await fetch("/api/file/getFile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: cachePath }),
    });
    if (!response.ok || response.status === 202) return null;
    const blob = await response.blob();
    if (!blob.size) return null;
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

async function loadCachedCover(source: string, cachePath: string | null): Promise<string> {
  const objectUrl = await readCachedObjectUrl(cachePath);
  if (!objectUrl) return source;
  try {
    if (source.includes("url(")) {
      return source.replace(/url\((?:"[^"]*"|'[^']*'|[^)]*)\)/, `url("${objectUrl}")`);
    }
    return objectUrl;
  } catch {
    return source;
  }
}

export function extractCardBlockId(card: HTMLElement): string | null {
  const blockCellRef = card.querySelector<HTMLElement>(
    ".av__cell[data-dtype='block'] span[data-type='block-ref'][data-id], .av__cell[data-dtype='block'] [data-id]",
  );
  if (blockCellRef) {
    const id = blockCellRef.getAttribute("data-id");
    if (id) return id;
  }
  const contentNode = card.querySelector<HTMLElement>(".av__gallery-content [data-node-id]");
  if (contentNode) {
    const id = contentNode.getAttribute("data-node-id");
    if (id) return id;
  }
  return card.getAttribute("data-id");
}

export class AvCoverInheritManager {
  private blockToRootCache = new Map<string, string>();
  private rootToTitleImgCache = new Map<string, { titleImg: string; cachePath: string | null } | null>();
  private pendingBlockIds = new Set<string>();
  private fetchTimer: ReturnType<typeof setTimeout> | null = null;
  private watchedRoots = new Set<HTMLElement>();
  private cachedObjectUrls = new Map<HTMLImageElement, string>();
  private documentObserver: MutationObserver | null = null;

  clearCache(): void {
    this.blockToRootCache.clear();
    this.rootToTitleImgCache.clear();
    this.pendingBlockIds.clear();
    for (const url of this.cachedObjectUrls.values()) URL.revokeObjectURL(url);
    this.cachedObjectUrls.clear();
  }

  observeDocument(): () => void {
    if (typeof document === "undefined") return () => undefined;
    this.documentObserver?.disconnect();
    this.scanWysiwyg(document);
    this.documentObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          this.scanWysiwyg(document);
          break;
        }
      }
    });
    this.documentObserver.observe(document.body || document.documentElement, { childList: true, subtree: true });
    return () => {
      this.documentObserver?.disconnect();
      this.documentObserver = null;
    };
  }

  observe(wysiwyg: HTMLElement): () => void {
    this.watchedRoots.add(wysiwyg);
    this.scanWysiwyg(wysiwyg);

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const m of mutations) {
        if (m.type === "childList" && m.addedNodes.length > 0) {
          for (const node of m.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const el = node as HTMLElement;
              if (
                el.classList.contains("av__gallery-item") ||
                el.classList.contains("av__card") ||
                el.classList.contains("av") ||
                el.classList.contains("av__body") ||
                el.querySelector?.(".av__gallery-item, .av__card, .av__body")
              ) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }
      if (shouldScan) {
        this.scanWysiwyg(wysiwyg);
      }
    });

    observer.observe(wysiwyg, {
      childList: true,
      subtree: true,
    });

    const handleScroll = () => {
      this.scanWysiwyg(wysiwyg);
    };
    wysiwyg.addEventListener("scroll", handleScroll, { passive: true, capture: true });

    return () => {
      observer.disconnect();
      wysiwyg.removeEventListener("scroll", handleScroll, true);
      this.watchedRoots.delete(wysiwyg);
      this.restoreWysiwyg(wysiwyg);
    };
  }

  scanWysiwyg(wysiwyg: ParentNode): void {
    const cards = wysiwyg.querySelectorAll<HTMLElement>(
      ".av__gallery-item, .av__card",
    );
    if (cards.length === 0) return;

    const neededBlockIds: string[] = [];

    cards.forEach((card) => {
      // 只有当卡片本身具有封面槽位（未被用户设置为“卡片封面：无”）时才处理
      const coverContainer = card.querySelector<HTMLElement>(".av__gallery-cover");
      if (!coverContainer) return;

      const blockId = extractCardBlockId(card);
      if (!blockId) return;

      // 已有本地/数据 URL 的原生封面不需要继承；远程题头图仍需查询缓存属性。
      const nativeGalleryImg = coverContainer.querySelector<HTMLImageElement>(
        `img.av__gallery-img:not(.${INHERITED_IMG_CLASS})`,
      );
      if (nativeGalleryImg) {
        const src = nativeGalleryImg.getAttribute("src") || "";
        if (src && !/^https?:\/\//i.test(src)) {
          return;
        }
      }

      // 检查缓存
      if (this.blockToRootCache.has(blockId)) {
        const rootId = this.blockToRootCache.get(blockId)!;
        const cover = this.rootToTitleImgCache.get(rootId);
        if (cover) {
          void this.applyResolvedCover(card, cover);
        }
      } else {
        neededBlockIds.push(blockId);
      }
    });

    if (neededBlockIds.length > 0) {
      for (const id of neededBlockIds) {
        this.pendingBlockIds.add(id);
      }
      this.scheduleFetch();
    }
  }

  private scheduleFetch(): void {
    if (this.fetchTimer) return;
    this.fetchTimer = setTimeout(() => {
      this.fetchTimer = null;
      void this.executeFetch();
    }, 20);
  }

  private async executeFetch(): Promise<void> {
    const ids = Array.from(this.pendingBlockIds);
    this.pendingBlockIds.clear();
    if (ids.length === 0) return;

    try {
      const chunkSize = 100;
      for (let i = 0; i < ids.length; i += chunkSize) {
        const chunk = ids.slice(i, i + chunkSize);
        const quotedIds = chunk.map((id) => `'${id.replace(/'/g, "")}'`).join(",");
        const querySql = `
          SELECT b.id as id, b.root_id as root_id, b.ial as block_ial, r.ial as root_ial
          FROM blocks b
          JOIN blocks r ON b.root_id = r.id
          WHERE b.id IN (${quotedIds})
        `;
        const rows = (await sql(querySql)) as Array<{
          id: string;
          root_id: string;
          block_ial: string;
          root_ial: string;
        }>;

        if (Array.isArray(rows)) {
          for (const row of rows) {
            this.blockToRootCache.set(row.id, row.root_id);
            if (!this.rootToTitleImgCache.has(row.root_id)) {
              const parsed = parseDocTitleImg(row.root_ial);
              const cachePath = row.root_ial?.match(/\bcustom-damophus-cover-cache-path="([^"]+)"/)?.[1] || null;
              const blockParsed = parseDocTitleImg(row.block_ial);
              const blockCachePath = row.block_ial?.match(/\bcustom-damophus-cover-cache-path="([^"]+)"/)?.[1] || null;
              this.rootToTitleImgCache.set(row.root_id, parsed ? { titleImg: parsed, cachePath } : blockParsed ? { titleImg: blockParsed, cachePath: blockCachePath } : null);
            }
          }
        }
      }

      for (const wysiwyg of this.watchedRoots) {
        const cards = wysiwyg.querySelectorAll<HTMLElement>(
          ".av__gallery-item, .av__card",
        );
        cards.forEach((card) => {
          const blockId = extractCardBlockId(card);
          if (!blockId) return;
          const rootId = this.blockToRootCache.get(blockId);
          if (rootId) {
            const cover = this.rootToTitleImgCache.get(rootId);
            if (cover) {
              void this.applyResolvedCover(card, cover);
            }
          }
        });
      }
      if (this.documentObserver) {
        this.scanWysiwyg(document);
      }
    } catch (e) {
      log.warn("Failed to fetch database inherited covers:", e);
    }
  }

  applyCoverToCard(card: HTMLElement, titleImg: string): void {
    // 只有当卡片本身拥有封面容器（即用户未在思源视图中设置“卡片封面：无”）时才处理，绝不强行新建封面
    const coverContainer = card.querySelector<HTMLElement>(".av__gallery-cover");
    if (!coverContainer) return;

    // 只有当卡片已有原生真正的封面图片时才跳过
    const nativeGalleryImg = coverContainer.querySelector<HTMLImageElement>(
      `img.av__gallery-img:not(.${INHERITED_IMG_CLASS})`,
    );
    if (nativeGalleryImg) {
      const src = nativeGalleryImg.getAttribute("src") || "";
      if (src && !src.startsWith("data:image/png;base64") && src.length > 20) {
        return;
      }
    }

    coverContainer.classList.remove("fn__none");
    coverContainer.classList.add(INHERITED_COVER_CLASS);
    coverContainer.innerHTML = buildCardCoverHTML(titleImg);
  }

  private async applyResolvedCover(card: HTMLElement, cover: { titleImg: string; cachePath: string | null }): Promise<void> {
    const coverContainer = card.querySelector<HTMLElement>(".av__gallery-cover");
    if (!coverContainer) return;
    const nativeGalleryImg = coverContainer.querySelector<HTMLImageElement>(
      `img.av__gallery-img:not(.${INHERITED_IMG_CLASS})`,
    );
    const source = extractTitleImgSource(cover.titleImg);
    const nativeSource = nativeGalleryImg?.getAttribute("src") || coverContainer.getAttribute("data-cover-url") || "";
    const normalizeSource = (value: string) => value.replace(/&amp;/g, "&").trim();
    if (nativeGalleryImg && source && /^https?:\/\//i.test(nativeSource) && normalizeSource(nativeSource) === normalizeSource(source) && cover.cachePath) {
      const objectUrl = await readCachedObjectUrl(cover.cachePath);
      if (!objectUrl) return;
      const original = nativeGalleryImg.getAttribute("data-damophus-original-cover-src");
      if (!original) nativeGalleryImg.setAttribute("data-damophus-original-cover-src", nativeSource);
      const previous = this.cachedObjectUrls.get(nativeGalleryImg);
      if (previous) URL.revokeObjectURL(previous);
      this.cachedObjectUrls.set(nativeGalleryImg, objectUrl);
      nativeGalleryImg.src = objectUrl;
      return;
    }
    const value = await loadCachedCover(cover.titleImg, cover.cachePath);
    this.applyCoverToCard(card, value);
  }

  restoreWysiwyg(wysiwyg: HTMLElement): void {
    wysiwyg.querySelectorAll<HTMLImageElement>("img[data-damophus-original-cover-src]").forEach((img) => {
      const objectUrl = this.cachedObjectUrls.get(img);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
      this.cachedObjectUrls.delete(img);
      const original = img.getAttribute("data-damophus-original-cover-src");
      if (original) img.src = original;
      img.removeAttribute("data-damophus-original-cover-src");
    });
    const inheritedCovers = wysiwyg.querySelectorAll<HTMLElement>(`.${INHERITED_COVER_CLASS}`);
    inheritedCovers.forEach((el) => {
      el.remove();
      el.classList.remove(INHERITED_COVER_CLASS);
      el.classList.add("fn__none");
      el.innerHTML = "";
    });
  }
}

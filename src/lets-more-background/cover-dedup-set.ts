import { getLogger } from "@/libs/logger";
import {
  collectHistoryCoverUrls,
  collectUsedCoverUrls,
  coverDedupIdentity,
  loadUsedCoverUrls,
} from "./cover-dedup";
import { getCoverHistory, getSeenCovers } from "./cover-history";
import {
  COVER_SOURCE_ATTRIBUTE,
  loadLocalCacheDedupUrls,
} from "./cover-local-cache";

const dedupLog = getLogger("lets-more-background:dedup");

/**
 * Assembles the full "already used" exclusion set for random cover picks:
 * SQL-known URLs, visible history, durable seen-cover memory, the local cache
 * index, plus the live attributes of the current document (it may have changed
 * before history was introduced or before a history write completed).
 */
export async function loadDedupCoverUrls(background?: HTMLElement, localCacheRoot = "/storage/petal/siyuan-damophus/more-background/covers"): Promise<Set<string>> {
  const databaseUrls = await loadUsedCoverUrls();
  const historyUrls = collectHistoryCoverUrls(getCoverHistory());
  const seenUrls = collectHistoryCoverUrls(getSeenCovers());
  const cacheIndexUrls = await loadLocalCacheDedupUrls(localCacheRoot);
  const urls = new Set<string>([...databaseUrls, ...historyUrls, ...seenUrls, ...cacheIndexUrls]);
  dedupLog.info("Loaded cover deduplication set", {
    database: databaseUrls.size,
    history: historyUrls.size,
    seen: seenUrls.size,
    cacheIndex: cacheIndexUrls.size,
    total: urls.size,
  });
  dedupLog.debug("Deduplication set entries", [...urls].slice(0, 80));

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

export function filterUnusedCoverAssets(
  files: readonly string[],
  excludedCoverIdentities: ReadonlySet<string>,
): string[] {
  return files.filter((file) => {
    const identity = coverDedupIdentity(file);
    return !identity || !excludedCoverIdentities.has(identity);
  });
}

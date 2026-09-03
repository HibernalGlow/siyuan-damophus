import { resolveSite, sites } from "@himeka/booru";
import { getLogger } from "@/libs/logger";
import { booruPostDedupKey, normalizeCoverUrl } from "../cover-dedup";
import type { SiteCredential } from "../sources";
import type { AspectRatioFilter, TimeRangeFilter } from "./uri";
import { extractImageUrlFromPost, extractPostDetailUrl, parseBooruUri } from "./uri";
import type { BooruResolveDiagnostic, BooruResolvedInfo } from "./image-fetch";
import { extractPostTimestamp, findSiteCredential, isPostBlacklisted, matchesCondition, matchesNegations, parseTimeFilter, type BooruNegations } from "./post-filter";
import { fetchDanbooruPosts, fetchGenericBooruPosts } from "./site-clients";

const log = getLogger("lets-more-background:booru");

/**
 * Resolve every candidate post that passes the template conditions and map it
 * to a ready-to-use info object. Single picks (resolveBooruImageInfo) and
 * multi-draw gacha (resolveBooruImageCandidates) both consume this list, so
 * dedup exclusions and condition filtering stay in one place.
 */
export async function collectBooruResolvedInfos(
  urlOrUri: string,
  siteCredentials?: SiteCredential[],
  globalBlacklist?: string[] | string,
  excludedImageUrls?: Iterable<string>,
): Promise<BooruResolvedInfo[]> {
  try {
    const excludedUrls = new Set(
      [...(excludedImageUrls || [])]
        .map((url) => normalizeCoverUrl(url) || (url.startsWith("booru-post:") ? url : null))
        .filter((url): url is string => Boolean(url)),
    );
    log.debug("Resolving booru image with deduplication", {
      source: urlOrUri,
      excludedUrlCount: excludedUrls.size,
    });
    const isExcluded = (...urls: Array<string | null | undefined>) =>
      urls.some((url) => {
        const normalized = normalizeCoverUrl(url || "");
        return normalized ? excludedUrls.has(normalized) : false;
      });
    const isExcludedPost = (site: string, postId: unknown) => {
      const canonicalSite = resolveSite(site) || site;
      const key = booruPostDedupKey(canonicalSite, postId);
      return key ? excludedUrls.has(key) : false;
    };
    const infos: BooruResolvedInfo[] = [];
    const diagnostic: BooruResolveDiagnostic = {
      totalFetched: 0,
      filteredCount: 0,
      rejectedByBlacklist: 0,
      rejectedByRatio: 0,
      rejectedByScore: 0,
      rejectedByTime: 0,
      rejectedByDuplicate: 0,
    };

    if (urlOrUri.startsWith("booru:")) {
      const { site, tags, rating, random, login, apiKey, aspectRatio, minScore, timeRange, maxScore, notTimeRange, notRatio, notRating, pool, quality, blacklist } =
        parseBooruUri(urlOrUri);
      const negations: BooruNegations = { maxScore, notTimeRange, notRatio, notRating };

      const matchedCred = findSiteCredential(site, siteCredentials);
      const effectiveLogin = login || matchedCred?.login;
      const effectiveApiKey = apiKey || matchedCred?.apiKey;

      const isDanbooruFamily = site.includes("donmai.us") || site === "danbooru" || site === "db";

      const tagList: string[] = [];
      if (tags) {
        tagList.push(...tags.split(/\s+/).filter(Boolean));
      }

      // Random pick 1 tag/artist from candidate pool if present
      if (pool && pool.length > 0) {
        const pickedCandidate = pool[Math.floor(Math.random() * pool.length)];
        tagList.push(pickedCandidate);
      }

      const combinedBlacklist = [
        ...(Array.isArray(globalBlacklist) ? globalBlacklist : (globalBlacklist || "").split(/[,|\s\n]+/)),
        ...(Array.isArray(blacklist) ? blacklist : (blacklist || "").split(/[,|\s\n]+/)),
      ].map((t) => t.trim().toLowerCase().replace(/^[-+]/, "").replace(/\s+/g, "_")).filter(Boolean);

      if (isDanbooruFamily) {
        if (site.toLowerCase().includes("safebooru.donmai.us") || rating === "safe") {
          tagList.push("rating:general");
        } else if (rating && rating !== "all") {
          tagList.push(`rating:${rating}`);
        }

        const res = await fetchDanbooruPosts(
          site,
          tagList,
          effectiveLogin,
          effectiveApiKey,
          50, // 抓取 50 条增加找到目标宽高比/评分的命中率
        );

        if (res.success && res.posts && res.posts.length > 0) {
          const totalFetched = res.posts.length;
          let rejectedByBlacklist = 0;
          let rejectedByRatio = 0;
          let rejectedByScore = 0;
          let rejectedByTime = 0;
          let rejectedByDuplicate = 0;
          let rejectedByNegation = 0;

          const candidates = res.posts.filter((p) => {
            if (isExcluded(p.file_url, p.large_file_url, p.preview_file_url) || isExcludedPost(site, p.id)) {
              rejectedByDuplicate++;
              return false;
            }
            if (combinedBlacklist.length > 0 && isPostBlacklisted(p, combinedBlacklist)) {
              rejectedByBlacklist++;
              return false;
            }
            if (aspectRatio && aspectRatio !== "any") {
              const width = p.image_width || p.width || 0;
              const height = p.image_height || p.height || 0;
              const ratio = width > 0 && height > 0 ? width / height : p.aspectRatio || 0;
              if (aspectRatio === "landscape" && (ratio < 1.0 || ratio === 0)) {
                rejectedByRatio++;
                return false;
              }
              if (aspectRatio === "wide" && (ratio < 1.33 || ratio === 0)) {
                rejectedByRatio++;
                return false;
              }
              if (aspectRatio === "portrait" && (ratio >= 1.0 || ratio === 0)) {
                rejectedByRatio++;
                return false;
              }
            }
            const rawScore = typeof p.score === "number" ? p.score : parseInt(p.score, 10);
            if (minScore !== undefined && !isNaN(rawScore) && rawScore < minScore) {
              rejectedByScore++;
              return false;
            }
            if (timeRange && timeRange !== "any" && timeRange !== "all") {
              const { minTimestamp, maxTimestamp } = parseTimeFilter(timeRange);
              const postTime = extractPostTimestamp(p);
              if (postTime) {
                if (minTimestamp !== undefined && postTime < minTimestamp) {
                  rejectedByTime++;
                  return false;
                }
                if (maxTimestamp !== undefined && postTime > maxTimestamp) {
                  rejectedByTime++;
                  return false;
                }
              }
            }
            if (!matchesNegations(p, negations)) {
              rejectedByNegation++;
              return false;
            }
            return true;
          });

          if (candidates.length === 0) {
            log.info("All Danbooru posts filtered out by conditions:", {
              totalFetched,
              rejectedByBlacklist,
              rejectedByRatio,
              rejectedByScore,
              rejectedByTime,
              rejectedByDuplicate,
              rejectedByNegation,
              excludedUrlCount: excludedUrls.size,
            });
            diagnostic.totalFetched = totalFetched;
            return [];
          }

          for (const picked of candidates) {
            let imgUrl: string | undefined;
            if (quality === "preview") {
              imgUrl = picked?.preview_file_url || picked?.large_file_url || picked?.file_url;
            } else if (quality === "sample") {
              imgUrl = picked?.large_file_url || picked?.file_url || picked?.preview_file_url;
            } else {
              imgUrl = picked?.file_url || picked?.large_file_url || picked?.preview_file_url;
            }
            if (!imgUrl) continue;
            infos.push({
              imageUrl: imgUrl,
              previewUrl: picked?.preview_file_url || picked?.large_file_url || undefined,
              postUrl: picked.id ? extractPostDetailUrl(site, picked.id) : undefined,
              postId: picked.id,
              site,
              tags: typeof picked.tag_string === "string" ? picked.tag_string.split(" ") : undefined,
              width: picked.image_width || picked.width,
              height: picked.image_height || picked.height,
              score: picked.score,
              diagnostic,
            });
          }
          diagnostic.totalFetched = totalFetched;
          diagnostic.filteredCount = candidates.length;
          diagnostic.rejectedByBlacklist = rejectedByBlacklist;
          diagnostic.rejectedByRatio = rejectedByRatio;
          diagnostic.rejectedByScore = rejectedByScore;
          diagnostic.rejectedByTime = rejectedByTime;
          diagnostic.rejectedByDuplicate = rejectedByDuplicate;
          diagnostic.rejectedByNegation = rejectedByNegation;
          // Danbooru produced usable posts; skip the generic-site fallback.
          if (infos.length > 0) return infos;
        }
      }

      // 非 Danbooru 站点走 @himeka/booru
      let resolvedDomain = resolveSite(site) || site;
      if (resolvedDomain) {
        if (rating && rating !== "all") {
          const siteInfo = sites[resolvedDomain];
          if (siteInfo && !siteInfo.nsfw) {
            // Safe by default
          } else {
            tagList.push(`rating:${rating === "safe" ? "general" : rating}`);
          }
        }

        let credentialsQuery: string | undefined;
        if (effectiveLogin && effectiveApiKey) {
          if (resolvedDomain.includes("gelbooru")) {
            credentialsQuery = `user_id=${encodeURIComponent(effectiveLogin)}&api_key=${encodeURIComponent(effectiveApiKey)}`;
          } else {
            credentialsQuery = `login=${encodeURIComponent(effectiveLogin)}&api_key=${encodeURIComponent(effectiveApiKey)}`;
          }
        } else if (effectiveApiKey) {
          credentialsQuery = `api_key=${encodeURIComponent(effectiveApiKey)}`;
        }

        log.info(`Searching booru ${resolvedDomain} with tags:`, tagList, { aspectRatio, minScore, timeRange, combinedBlacklist });
        const results = await fetchGenericBooruPosts(
          resolvedDomain,
          tagList,
          50,
          random ?? true,
          credentialsQuery,
        );

        if (results && results.length > 0) {
          const totalFetched = results.length;
          let rejectedByBlacklist = 0;
          let rejectedByRatio = 0;
          let rejectedByScore = 0;
          let rejectedByTime = 0;
          let rejectedByDuplicate = 0;
          let rejectedByNegation = 0;

          const candidates = results.filter((p) => {
            if (isExcluded(
              p.fileUrl,
              (p as any).file_url,
              p.sampleUrl,
              (p as any).sample_url,
              p.jpegUrl,
              (p as any).jpeg_url,
              p.previewUrl,
              (p as any).preview_url,
            ) || isExcludedPost(resolvedDomain, p.id)) {
              rejectedByDuplicate++;
              return false;
            }
            if (combinedBlacklist.length > 0 && isPostBlacklisted(p, combinedBlacklist)) {
              rejectedByBlacklist++;
              return false;
            }
            if (aspectRatio && aspectRatio !== "any") {
              const width = p.width || p.image_width || (p as any).preview_width || 0;
              const height = p.height || p.image_height || (p as any).preview_height || 0;
              const ratio = width > 0 && height > 0 ? width / height : (p as any).aspectRatio || 0;
              if (aspectRatio === "landscape" && (ratio < 1.0 || ratio === 0)) {
                rejectedByRatio++;
                return false;
              }
              if (aspectRatio === "wide" && (ratio < 1.33 || ratio === 0)) {
                rejectedByRatio++;
                return false;
              }
              if (aspectRatio === "portrait" && (ratio >= 1.0 || ratio === 0)) {
                rejectedByRatio++;
                return false;
              }
            }
            const rawScore = typeof p.score === "number" ? p.score : parseInt(p.score, 10);
            if (minScore !== undefined && !isNaN(rawScore) && rawScore < minScore) {
              rejectedByScore++;
              return false;
            }
            if (timeRange && timeRange !== "any" && timeRange !== "all") {
              const { minTimestamp, maxTimestamp } = parseTimeFilter(timeRange);
              const postTime = extractPostTimestamp(p);
              if (postTime) {
                if (minTimestamp !== undefined && postTime < minTimestamp) {
                  rejectedByTime++;
                  return false;
                }
                if (maxTimestamp !== undefined && postTime > maxTimestamp) {
                  rejectedByTime++;
                  return false;
                }
              }
            }
            if (!matchesNegations(p, negations)) {
              rejectedByNegation++;
              return false;
            }
            return true;
          });

          if (candidates.length === 0) {
            log.info("All Booru posts filtered out by conditions:", {
              totalFetched,
              rejectedByBlacklist,
              rejectedByRatio,
              rejectedByScore,
              rejectedByTime,
              rejectedByDuplicate,
              rejectedByNegation,
              excludedUrlCount: excludedUrls.size,
            });
            diagnostic.totalFetched = totalFetched;
            return [];
          }

          for (const picked of candidates) {
            let imgUrl: string | null = null;
            if (quality === "preview") {
              imgUrl = picked.previewUrl || (picked as any).preview_url || picked.sampleUrl || picked.fileUrl || null;
            } else if (quality === "sample") {
              imgUrl = picked.sampleUrl || (picked as any).sample_url || picked.fileUrl || picked.previewUrl || null;
            } else {
              imgUrl = extractImageUrlFromPost(picked);
            }
            if (!imgUrl) continue;
            infos.push({
              imageUrl: imgUrl,
              previewUrl: picked.previewUrl || (picked as any).preview_url || picked.sampleUrl || undefined,
              postUrl: picked.id ? extractPostDetailUrl(resolvedDomain, picked.id) : undefined,
              postId: picked.id,
              site: resolvedDomain,
              tags: picked.tags,
              width: picked.width,
              height: picked.height,
              score: picked.score,
              diagnostic,
            });
          }
          diagnostic.totalFetched = totalFetched;
          diagnostic.filteredCount = candidates.length;
          diagnostic.rejectedByBlacklist = rejectedByBlacklist;
          diagnostic.rejectedByRatio = rejectedByRatio;
          diagnostic.rejectedByScore = rejectedByScore;
          diagnostic.rejectedByTime = rejectedByTime;
          diagnostic.rejectedByDuplicate = rejectedByDuplicate;
          diagnostic.rejectedByNegation = rejectedByNegation;
          if (infos.length > 0) return infos;
        }
      }
    }

    // Direct image URL fallback
    if (urlOrUri && (urlOrUri.startsWith("http://") || urlOrUri.startsWith("https://") || urlOrUri.startsWith("data:"))) {
      return [{ imageUrl: urlOrUri }];
    }
    return infos;
  } catch (e: any) {
    log.error("Failed to resolve booru image info:", e);
    return [];
  }
}

/** Partial Fisher-Yates: `count` distinct random picks without reordering the source. */
function pickRandomDistinct<T>(items: T[], count: number): T[] {
  const pool = [...items];
  if (pool.length === 0) return [];
  const picks: T[] = [];
  const wanted = Math.max(1, Math.min(count, pool.length));
  for (let i = 0; i < wanted; i += 1) {
    const index = Math.floor(Math.random() * pool.length);
    picks.push(pool[index]);
    pool.splice(index, 1);
  }
  return picks;
}

export async function resolveBooruImageInfo(
  urlOrUri: string,
  siteCredentials?: SiteCredential[],
  globalBlacklist?: string[] | string,
  excludedImageUrls?: Iterable<string>,
): Promise<BooruResolvedInfo | null> {
  const infos = await collectBooruResolvedInfos(urlOrUri, siteCredentials, globalBlacklist, excludedImageUrls);
  if (infos.length === 0) return null;
  return infos[Math.floor(Math.random() * infos.length)];
}

/**
 * Gacha draw: resolve up to `count` distinct candidate covers for one template.
 * Fewer entries are returned when the filtered pool is smaller than the request.
 */
export async function resolveBooruImageCandidates(
  urlOrUri: string,
  siteCredentials?: SiteCredential[],
  globalBlacklist?: string[] | string,
  excludedImageUrls?: Iterable<string>,
  count = 1,
): Promise<BooruResolvedInfo[]> {
  const infos = await collectBooruResolvedInfos(urlOrUri, siteCredentials, globalBlacklist, excludedImageUrls);
  return pickRandomDistinct(infos, count);
}

export async function resolveBooruImageUrl(
  urlOrUri: string,
  siteCredentials?: SiteCredential[],
  globalBlacklist?: string[] | string,
): Promise<string | null> {
  const info = await resolveBooruImageInfo(urlOrUri, siteCredentials, globalBlacklist);
  return info?.imageUrl || null;
}

export function extractBooruImageUrl(
  data: any,
  baseUrl: string,
  aspectRatio: AspectRatioFilter = "any",
  minScore?: number,
  timeRange: TimeRangeFilter = "any",
  blacklist?: string[] | string,
  negations?: BooruNegations,
): string | null {
  if (!data) return null;

  let posts: any[] = [];
  if (Array.isArray(data)) {
    posts = data;
  } else if (Array.isArray(data.posts)) {
    posts = data.posts;
  } else if (Array.isArray(data.post)) {
    posts = data.post;
  } else if (typeof data === "object") {
    posts = [data];
  }

  if (posts.length === 0) return null;

  let validPosts = posts.filter(
    (p) =>
      p &&
      (p.file_url ||
        p.fileUrl ||
        p.large_file_url ||
        p.sample_url ||
        p.jpeg_url ||
        p.image_url ||
        (p.directory !== undefined && p.image !== undefined)),
  );

  if (aspectRatio !== "any" || minScore !== undefined || (timeRange && timeRange !== "any") || blacklist || negations) {
    validPosts = validPosts.filter((p) => matchesCondition(p, aspectRatio, minScore, timeRange, blacklist, negations));
  }

  if (validPosts.length === 0) return null;

  const chosen = validPosts[Math.floor(Math.random() * validPosts.length)];

  let rawUrl =
    chosen.file_url ||
    chosen.fileUrl ||
    chosen.large_file_url ||
    chosen.sample_url ||
    chosen.jpeg_url ||
    chosen.image_url;

  if (!rawUrl && chosen.directory !== undefined && chosen.image) {
    const base = baseUrl.replace(/\/+$/, "");
    rawUrl = `${base}/images/${chosen.directory}/${chosen.image}`;
  }

  if (!rawUrl || typeof rawUrl !== "string") return null;

  let finalUrl = rawUrl.trim();
  if (finalUrl.startsWith("//")) {
    finalUrl = `https:${finalUrl}`;
  } else if (finalUrl.startsWith("/")) {
    finalUrl = `${baseUrl.replace(/\/+$/, "")}${finalUrl}`;
  }

  return finalUrl;
}

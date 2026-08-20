import { getLogger } from "@/libs/logger";
import { search, resolveSite, sites, type Post } from "@himeka/booru";
import type { SiteCredential } from "./sources";

const log = getLogger("lets-more-background:booru");

export type AspectRatioFilter = "landscape" | "wide" | "portrait" | "any";

export interface BooruQueryOptions {
  site: string;
  tags?: string;
  rating?: "safe" | "general" | "questionable" | "explicit" | "all";
  limit?: number;
  random?: boolean;
  login?: string;
  apiKey?: string;
  aspectRatio?: AspectRatioFilter;
  minScore?: number;
  pool?: string[];
}

export function isBooruSource(urlOrUri: string): boolean {
  if (!urlOrUri) return false;
  const trimmed = urlOrUri.trim();
  if (trimmed.startsWith("booru:")) return true;
  return (
    trimmed.includes("page=dapi") ||
    trimmed.includes("/posts.json") ||
    trimmed.includes("/post.json")
  );
}

export function cleanArtistTag(raw: string): string {
  let tag = raw.trim();
  if (tag.startsWith("@")) {
    tag = tag.slice(1).trim();
  }
  return tag.replace(/\s+/g, "_");
}

export function parseBooruUri(uri: string): BooruQueryOptions {
  const trimmed = uri.trim();
  if (!trimmed.startsWith("booru:")) {
    return { site: trimmed, random: true };
  }

  const withoutScheme = trimmed.slice("booru:".length);
  const [siteOrAlias, queryString] = withoutScheme.split("?", 2);

  const params = new URLSearchParams(queryString || "");
  const site = params.get("site") || siteOrAlias || "safebooru.org";
  const tags = params.get("tags") || "";
  const rating = (params.get("rating") || "safe") as BooruQueryOptions["rating"];
  const limit = params.has("limit") ? parseInt(params.get("limit")!, 10) : 25;
  const random = params.get("random") !== "false";
  const login = params.get("login") || params.get("user") || params.get("user_id") || undefined;
  const apiKey = params.get("api_key") || params.get("apiKey") || params.get("token") || undefined;

  let aspectRatio: AspectRatioFilter = "any";
  const rawRatio = params.get("ratio") || params.get("aspectRatio");
  if (rawRatio) {
    const lower = rawRatio.toLowerCase();
    if (lower === "landscape" || lower === "horizontal" || lower === "h" || lower === ">=1") {
      aspectRatio = "landscape";
    } else if (lower === "wide" || lower === "16:9" || lower === "banner") {
      aspectRatio = "wide";
    } else if (lower === "portrait" || lower === "vertical" || lower === "v") {
      aspectRatio = "portrait";
    }
  }

  const minScore = params.has("min_score")
    ? parseInt(params.get("min_score")!, 10)
    : params.has("minScore")
    ? parseInt(params.get("minScore")!, 10)
    : undefined;

  const rawPool = params.get("pool") || params.get("artists") || params.get("tags_pool");
  let pool: string[] | undefined;
  if (rawPool) {
    pool = rawPool
      .split(/[,|;\n]/)
      .map((item) => cleanArtistTag(item))
      .filter(Boolean);
  }

  return {
    site,
    tags,
    rating,
    limit: Number.isFinite(limit) ? limit : 25,
    random,
    login,
    apiKey,
    aspectRatio,
    minScore,
    pool,
  };
}

export function extractImageUrlFromPost(post: Post): string | null {
  if (!post) return null;
  const url = post.fileUrl || post.sampleUrl || post.jpegUrl || post.previewUrl;
  return url ? url.trim() : null;
}

export function matchesCondition(
  post: Post | any,
  aspectRatio: AspectRatioFilter = "any",
  minScore?: number,
): boolean {
  if (!post) return false;

  const width = post.width || 0;
  const height = post.height || 0;
  const ratio = width > 0 && height > 0 ? width / height : post.aspectRatio || 1;

  if (aspectRatio === "landscape" && ratio < 1.0) {
    return false;
  }
  if (aspectRatio === "wide" && ratio < 1.33) {
    return false;
  }
  if (aspectRatio === "portrait" && ratio >= 1.0) {
    return false;
  }

  if (minScore !== undefined && typeof post.score === "number" && post.score < minScore) {
    return false;
  }

  return true;
}

export function findSiteCredential(siteDomain: string, credentials?: SiteCredential[]): SiteCredential | undefined {
  if (!credentials || credentials.length === 0) return undefined;
  const rawTarget = siteDomain.toLowerCase().trim();
  const resolvedTarget = resolveSite(rawTarget) || rawTarget;

  // 1. 精确匹配（包含 alias）
  const exact = credentials.find((c) => {
    if (c.enabled === false) return false;
    const credSite = c.site.toLowerCase().trim();
    const credResolved = resolveSite(credSite) || credSite;
    return (
      credSite === rawTarget ||
      credResolved === resolvedTarget ||
      credSite === resolvedTarget ||
      credResolved === rawTarget
    );
  });
  if (exact) return exact;

  // 2. 如果是 safebooru.donmai.us，可共用 danbooru.donmai.us 凭据
  if (rawTarget.includes("safebooru.donmai.us")) {
    const danbooruCred = credentials.find(
      (c) => c.enabled !== false && c.site.toLowerCase().includes("danbooru.donmai.us"),
    );
    if (danbooruCred) return danbooruCred;
  }

  // 3. 域名包含匹配
  return credentials.find((c) => {
    if (c.enabled === false) return false;
    const credDomain = c.site.toLowerCase().trim();
    return (
      credDomain === rawTarget ||
      rawTarget.includes(credDomain) ||
      credDomain.includes(rawTarget) ||
      credDomain.includes(resolvedTarget) ||
      resolvedTarget.includes(credDomain)
    );
  });
}

export async function testBooruSiteCredential(
  site: string,
  login?: string,
  apiKey?: string,
): Promise<{ success: boolean; message: string; sampleUrl?: string }> {
  try {
    let resolvedDomain = resolveSite(site) || site;
    if (site.includes("safebooru.donmai.us")) {
      resolvedDomain = "danbooru.donmai.us";
    }

    let credentialsQuery: string | undefined;
    if (login && apiKey) {
      if (resolvedDomain.includes("gelbooru")) {
        credentialsQuery = `user_id=${encodeURIComponent(login)}&api_key=${encodeURIComponent(apiKey)}`;
      } else {
        credentialsQuery = `login=${encodeURIComponent(login)}&api_key=${encodeURIComponent(apiKey)}`;
      }
    } else if (apiKey) {
      credentialsQuery = `api_key=${encodeURIComponent(apiKey)}`;
    }

    const results = await search(resolvedDomain, ["wallpaper"], {
      limit: 3,
      random: true,
      credentials: credentialsQuery ? { query: credentialsQuery } : undefined,
    });

    if (results && results.length > 0) {
      const sample = extractImageUrlFromPost(results[0]);
      return {
        success: true,
        message: `成功连接至 ${site} (${resolvedDomain})！`,
        sampleUrl: sample || undefined,
      };
    }
    return {
      success: true,
      message: `成功连接至 ${site}，但当前标签未返回结果。`,
    };
  } catch (e: any) {
    return {
      success: false,
      message: `连接失败: ${e?.message || String(e)}`,
    };
  }
}

export async function resolveBooruImageUrl(
  urlOrUri: string,
  siteCredentials?: SiteCredential[],
): Promise<string | null> {
  try {
    if (urlOrUri.startsWith("booru:")) {
      const { site, tags, rating, random, login, apiKey, aspectRatio, minScore, pool } =
        parseBooruUri(urlOrUri);

      const matchedCred = findSiteCredential(site, siteCredentials);
      const effectiveLogin = login || matchedCred?.login;
      const effectiveApiKey = apiKey || matchedCred?.apiKey;

      // 区分 safebooru.org 与 safebooru.donmai.us
      let resolvedDomain = resolveSite(site) || site;
      let isDanbooruSafeMirror = false;
      if (site.toLowerCase().includes("safebooru.donmai.us")) {
        resolvedDomain = "danbooru.donmai.us";
        isDanbooruSafeMirror = true;
      }

      if (resolvedDomain) {
        const tagList: string[] = [];
        if (tags) {
          tagList.push(...tags.split(/\s+/).filter(Boolean));
        }

        // Random pick 1 tag/artist from candidate pool if present
        if (pool && pool.length > 0) {
          const pickedCandidate = pool[Math.floor(Math.random() * pool.length)];
          tagList.push(pickedCandidate);
        }

        if (isDanbooruSafeMirror) {
          tagList.push("rating:general");
        } else if (rating && rating !== "all") {
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

        log.info(`Searching booru ${resolvedDomain} with tags:`, tagList, { aspectRatio, minScore });
        const results = await search(resolvedDomain, tagList, {
          limit: 25,
          random: random ?? true,
          credentials: credentialsQuery ? { query: credentialsQuery } : undefined,
        });

        if (results && results.length > 0) {
          let candidates = results.slice();
          if (aspectRatio && aspectRatio !== "any") {
            const filtered = candidates.filter((p) => matchesCondition(p, aspectRatio, minScore));
            if (filtered.length > 0) {
              candidates = filtered;
            }
          }

          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          const imgUrl = extractImageUrlFromPost(picked);
          if (imgUrl) return imgUrl;
        }
      }
    }

    // Fallback for raw API URLs
    const targetUrl = urlOrUri.startsWith("booru:")
      ? `https://safebooru.org/index.php?page=dapi&s=post&q=index&json=1&limit=25`
      : urlOrUri;

    const parsedUrl = new URL(targetUrl);
    const baseSiteUrl = `${parsedUrl.protocol}//${parsedUrl.host}`;

    const res = await fetch(targetUrl);
    if (!res.ok) {
      log.warn(`Booru API responded with status ${res.status}`);
      return null;
    }

    const data = await res.json();
    return extractBooruImageUrl(data, baseSiteUrl);
  } catch (e) {
    log.error("Failed to resolve Booru image URL:", e);
    return null;
  }
}

export function extractBooruImageUrl(
  data: any,
  baseUrl: string,
  aspectRatio: AspectRatioFilter = "any",
  minScore?: number,
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

  if (aspectRatio !== "any" || minScore !== undefined) {
    const conditioned = validPosts.filter((p) => matchesCondition(p, aspectRatio, minScore));
    if (conditioned.length > 0) {
      validPosts = conditioned;
    }
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

import { resolveSite, sites, type Post } from "@himeka/booru";

export type AspectRatioFilter = "landscape" | "wide" | "portrait" | "any";

export type TimeRangeFilter = string;

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
  timeRange?: TimeRangeFilter;
  /** Inverse (NOT) constraints compiled from the condition tree; see post-filter. */
  maxScore?: number;
  notTimeRange?: string;
  notRatio?: AspectRatioFilter;
  notRating?: string;
  pool?: string[];
  quality?: "original" | "sample" | "preview";
  blacklist?: string[] | string;
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
    : params.has("score")
    ? parseInt(params.get("score")!, 10)
    : undefined;

  const timeRange = params.get("time_range") || params.get("timeRange") || params.get("time") || "any";

  const maxScore = params.has("max_score") ? parseInt(params.get("max_score")!, 10) : undefined;
  const notTimeRange = params.get("not_time_range") || undefined;
  const rawNotRatio = (params.get("not_ratio") || "").toLowerCase();
  const notRatio: AspectRatioFilter | undefined =
    rawNotRatio === "landscape" || rawNotRatio === "wide" || rawNotRatio === "portrait"
      ? (rawNotRatio as AspectRatioFilter)
      : undefined;
  const notRating = params.get("not_rating") || undefined;

  const rawQuality = params.get("quality") || params.get("imageQuality");
  let quality: "original" | "sample" | "preview" = "original";
  if (rawQuality === "preview" || params.get("preview") === "true" || params.get("thumb") === "true") {
    quality = "preview";
  } else if (rawQuality === "sample" || rawQuality === "large") {
    quality = "sample";
  }

  const rawPool = params.get("pool") || params.get("artists") || params.get("tags_pool");
  let pool: string[] | undefined;
  if (rawPool) {
    pool = rawPool
      .split(/[,|;\n]/)
      .map((item) => cleanArtistTag(item))
      .filter(Boolean);
  }

  const rawBlacklist = params.get("blacklist") || params.get("blocked");
  let blacklist: string[] | undefined;
  if (rawBlacklist) {
    blacklist = rawBlacklist
      .split(/[,|;\s\n]/)
      .map((item) => item.trim().toLowerCase().replace(/^[-+]/, "").replace(/\s+/g, "_"))
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
    timeRange,
    maxScore,
    notTimeRange,
    notRatio,
    notRating,
    pool,
    quality,
    blacklist,
  };
}

export function extractImageUrlFromPost(post: Post): string | null {
  if (!post) return null;
  const url = post.fileUrl || post.sampleUrl || post.jpegUrl || post.previewUrl;
  return url ? url.trim() : null;
}

export function extractPostDetailUrl(siteDomain: string, postId: string | number): string {
  const domain = (resolveSite(siteDomain) || siteDomain).toLowerCase();
  const idStr = String(postId);

  if (domain.includes("danbooru.donmai.us")) {
    return `https://danbooru.donmai.us/posts/${idStr}`;
  }
  if (domain.includes("safebooru.donmai.us")) {
    return `https://safebooru.donmai.us/posts/${idStr}`;
  }
  if (domain.includes("safebooru.org")) {
    return `https://safebooru.org/index.php?page=post&s=view&id=${idStr}`;
  }
  if (domain.includes("yande.re")) {
    return `https://yande.re/post/show/${idStr}`;
  }
  if (domain.includes("konachan")) {
    return `https://konachan.com/post/show/${idStr}`;
  }
  if (domain.includes("gelbooru")) {
    return `https://gelbooru.com/index.php?page=post&s=view&id=${idStr}`;
  }
  if (domain.includes("e621")) {
    return `https://e621.net/posts/${idStr}`;
  }
  if (domain.includes("tbib")) {
    return `https://tbib.org/index.php?page=post&s=view&id=${idStr}`;
  }
  return `https://${domain}/posts/${idStr}`;
}

export interface BooruPostReference {
  site: string;
  postId: string;
  postUrl: string;
}

/** Parse a compatible Booru post page URL (for manual cover selection). */
export function parseBooruPostUrl(value: string): BooruPostReference | null {
  const raw = String(value || "").trim();
  if (!/^https?:\/\//i.test(raw)) return null;
  try {
    const parsed = new URL(raw);
    const host = parsed.hostname.toLowerCase();
    const site = resolveSite(host) || host;
    const knownSite = Boolean(sites[site]);
    const queryId = parsed.searchParams.get("id") || parsed.searchParams.get("post_id");
    const pathId = parsed.pathname.match(/\/(?:posts?|post\/(?:show|view))\/(\d+)(?:\D|$)/i)?.[1];
    const postId = (queryId || pathId || "").trim();
    if (!postId || (!knownSite && !/(booru|e621|yande\.re|konachan|tbib)/i.test(host))) return null;
    return { site, postId, postUrl: raw };
  } catch {
    return null;
  }
}

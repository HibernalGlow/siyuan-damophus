import { getLogger } from "@/libs/logger";
import { search, resolveSite, sites, type Post } from "@himeka/booru";
import type { SiteCredential } from "./sources";

const log = getLogger("lets-more-background:booru");

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

export interface BooruResolveDiagnostic {
  totalFetched: number;
  filteredCount: number;
  rejectedByRatio?: number;
  rejectedByScore?: number;
  rejectedByBlacklist?: number;
  rejectedByTime?: number;
  errorMessage?: string;
}

export interface BooruResolvedInfo {
  imageUrl: string;
  previewBlobUrl?: string;
  postUrl?: string;
  postId?: string | number;
  site?: string;
  tags?: string[];
  width?: number;
  height?: number;
  score?: number;
  diagnostic?: BooruResolveDiagnostic;
}

/** 根据图片 URL 自动推断需要伪装的 Referer（参考 PixLuna 防盗链绕过方案） */
function getImageReferer(imageUrl: string): string {
  if (imageUrl.includes("donmai.us") || imageUrl.includes("danbooru")) {
    return "https://danbooru.donmai.us/";
  }
  if (imageUrl.includes("pixiv") || imageUrl.includes("pximg")) {
    return "https://www.pixiv.net/";
  }
  if (imageUrl.includes("yande.re")) {
    return "https://yande.re/";
  }
  if (imageUrl.includes("konachan")) {
    return "https://konachan.com/";
  }
  if (imageUrl.includes("gelbooru")) {
    return "https://gelbooru.com/";
  }
  if (imageUrl.includes("safebooru.org")) {
    return "https://safebooru.org/";
  }
  return "";
}

/**
 * 通过思源内核 forwardProxy 下载图片（走系统代理 + Referer 欺骗）
 * 返回 base64 解码后的 Blob，失败返回 null
 */
export async function proxyFetchImageBlob(imageUrl: string): Promise<Blob | null> {
  const referer = getImageReferer(imageUrl);
  const headers = [
    "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    "Accept: image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
  ];
  if (referer) headers.push(`Referer: ${referer}`);

  try {
    const proxyRes = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: imageUrl,
        method: "GET",
        timeout: 30000,
        responseEncoding: "base64",
        headers,
      }),
    });
    const proxyData = await proxyRes.json();
    if (proxyData.code === 0 && proxyData.data?.status === 200 && proxyData.data?.body) {
      const b64Body: string = proxyData.data.body;
      const contentType: string = proxyData.data.contentType || "image/jpeg";
      const binaryStr = atob(b64Body);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
      const blob = new Blob([bytes], { type: contentType });
      if (blob.size > 0) return blob;
    }
  } catch (err) {
    log.debug("proxyFetchImageBlob failed:", err);
  }
  return null;
}

export async function fetchImageForPreview(imageUrl: string): Promise<string> {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return imageUrl;

  // 1. 优先使用思源内核 forwardProxy（走系统代理 + Referer 欺骗，参考 PixLuna 防盗链方案）
  const blob = await proxyFetchImageBlob(imageUrl);
  if (blob) return URL.createObjectURL(blob);

  // 2. 回退：直接 fetch 转 Blob URL（无代理环境）
  try {
    const res = await fetch(imageUrl, {
      referrerPolicy: "no-referrer",
      headers: { Accept: "image/*,*/*" },
    });
    if (res.ok) {
      const b = await res.blob();
      return URL.createObjectURL(b);
    }
  } catch (directErr) {
    log.debug("Direct fetch image for preview failed:", directErr);
  }

  return imageUrl;
}

export function extractPostTimestamp(post: any): number | null {
  if (!post) return null;
  if (post.createdAt instanceof Date) {
    return post.createdAt.getTime();
  }
  if (typeof post.createdAt === "string" || typeof post.createdAt === "number") {
    const ts = new Date(post.createdAt).getTime();
    if (!isNaN(ts)) return ts;
  }
  if (typeof post.created_at === "string" || typeof post.created_at === "number") {
    const ts = new Date(post.created_at).getTime();
    if (!isNaN(ts)) return ts;
  }
  if (typeof post.change === "number") {
    return post.change > 1e11 ? post.change : post.change * 1000;
  }
  if (typeof post.uploadDate === "number") {
    return post.uploadDate > 1e11 ? post.uploadDate : post.uploadDate * 1000;
  }
  return null;
}

export interface ParsedTimeFilter {
  minTimestamp?: number;
  maxTimestamp?: number;
}

export function parseTimeFilter(raw?: string, now = Date.now()): ParsedTimeFilter {
  if (!raw) return {};
  const str = String(raw).trim();
  if (!str || str.toLowerCase() === "any" || str.toLowerCase() === "all" || str.toLowerCase() === "none") return {};

  const lower = str.toLowerCase();

  // 1. 相对过去时长: '7d', '30d', '6m', '1y', '100d', '最近30天', '30天', '6个月', '1年'
  const relMatch = lower.match(/^(?:最近|past\s*)?(\d+)\s*(d|day|days|天|m|month|months|月|个月|y|year|years|年)$/);
  if (relMatch) {
    const num = parseInt(relMatch[1], 10);
    const unit = relMatch[2];
    let ms = 0;
    if (unit.startsWith("d") || unit === "天") ms = num * 24 * 3600 * 1000;
    else if (unit.startsWith("m") || unit.includes("月")) ms = num * 30 * 24 * 3600 * 1000;
    else if (unit.startsWith("y") || unit === "年") ms = num * 365 * 24 * 3600 * 1000;
    return { minTimestamp: now - ms };
  }

  // 2. 年份/日期之后: '2023+' or '2024-05+'
  const plusMatch = str.match(/^(\d{4}(?:-\d{1,2}(?:-\d{1,2})?)?)\+$/);
  if (plusMatch) {
    const dateStr = plusMatch[1];
    const parsedDate = /^\d{4}$/.test(dateStr) ? new Date(`${dateStr}-01-01T00:00:00Z`) : new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return { minTimestamp: parsedDate.getTime() };
    }
  }

  // 3. 区间: '2020..2024' or '2022-01-01..2023-12-31' or '2022-01-01 - 2023-12-31'
  const rangeMatch = str.match(/^(.+?)(?:\.\.|\s+-\s+|\s*至\s*|\s*到\s*)(.+)$/);
  if (rangeMatch) {
    const startPart = rangeMatch[1].trim();
    const endPart = rangeMatch[2].trim();
    let minTimestamp: number | undefined;
    let maxTimestamp: number | undefined;

    // start
    if (/^\d{4}$/.test(startPart)) {
      minTimestamp = new Date(`${startPart}-01-01T00:00:00Z`).getTime();
    } else {
      const d = new Date(startPart);
      if (!isNaN(d.getTime())) minTimestamp = d.getTime();
    }

    // end
    if (/^\d{4}$/.test(endPart)) {
      maxTimestamp = new Date(`${endPart}-12-31T23:59:59.999Z`).getTime();
    } else {
      const d = new Date(endPart);
      if (!isNaN(d.getTime())) maxTimestamp = d.getTime();
    }
    return { minTimestamp, maxTimestamp };
  }

  // 4. '>=2023', '>2022-06-01', 'after:2023-01-01'
  const gteMatch = str.match(/^(?:>=?|after:|从|大于等于?)\s*(.+)$/i);
  if (gteMatch) {
    const dateStr = gteMatch[1].trim();
    const parsedDate = /^\d{4}$/.test(dateStr) ? new Date(`${dateStr}-01-01T00:00:00Z`) : new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return { minTimestamp: parsedDate.getTime() };
    }
  }

  // 5. '<=2023', '<2024-01-01', 'before:2024-01-01'
  const lteMatch = str.match(/^(?:<=?|before:|至|小于等于?)\s*(.+)$/i);
  if (lteMatch) {
    const dateStr = lteMatch[1].trim();
    const parsedDate = /^\d{4}$/.test(dateStr) ? new Date(`${dateStr}-12-31T23:59:59.999Z`) : new Date(dateStr);
    if (!isNaN(parsedDate.getTime())) {
      return { maxTimestamp: parsedDate.getTime() };
    }
  }

  // 6. 单独指定某一年: '2024'
  if (/^\d{4}$/.test(str)) {
    return {
      minTimestamp: new Date(`${str}-01-01T00:00:00Z`).getTime(),
      maxTimestamp: new Date(`${str}-12-31T23:59:59.999Z`).getTime(),
    };
  }

  // 7. 单独日期（默认 >= 该日期）: '2023-05-12'
  const singleDate = new Date(str);
  if (!isNaN(singleDate.getTime())) {
    return { minTimestamp: singleDate.getTime() };
  }

  return {};
}

export function extractPostTags(post: any): string[] {
  if (!post) return [];
  if (Array.isArray(post.tags)) return post.tags.map((t: string) => String(t).toLowerCase().trim());
  if (typeof post.tag_string === "string") return post.tag_string.toLowerCase().split(/\s+/).filter(Boolean);
  if (typeof post.tags === "string") return post.tags.toLowerCase().split(/\s+/).filter(Boolean);
  return [];
}

export function isPostBlacklisted(post: any, blacklistedTags?: string[] | string): boolean {
  if (!blacklistedTags) return false;
  const blacklistList = (Array.isArray(blacklistedTags) ? blacklistedTags : blacklistedTags.split(/[,|\s\n]+/))
    .map((t) => t.trim().toLowerCase().replace(/^[-+]/, "").replace(/\s+/g, "_"))
    .filter(Boolean);
  if (blacklistList.length === 0) return false;

  const postTags = extractPostTags(post);
  if (postTags.length === 0) return false;

  for (const bTag of blacklistList) {
    if (postTags.includes(bTag)) return true;
    if (bTag.includes("*")) {
      const reg = new RegExp(`^${bTag.replace(/\*/g, ".*")}$`);
      if (postTags.some((t) => reg.test(t))) return true;
    }
  }
  return false;
}

export function matchesCondition(
  post: Post | any,
  aspectRatio: AspectRatioFilter = "any",
  minScore?: number,
  timeRange: TimeRangeFilter = "any",
  blacklist?: string[] | string,
): boolean {
  if (!post) return false;

  if (blacklist && isPostBlacklisted(post, blacklist)) {
    return false;
  }

  const width =
    post.image_width ||
    post.width ||
    post.imageWidth ||
    post.preview_width ||
    post.previewWidth ||
    post.sample_width ||
    post.sampleWidth ||
    0;
  const height =
    post.image_height ||
    post.height ||
    post.imageHeight ||
    post.preview_height ||
    post.previewHeight ||
    post.sample_height ||
    post.sampleHeight ||
    0;
  const ratio = width > 0 && height > 0 ? width / height : post.aspectRatio || 0;

  if (aspectRatio === "landscape" && (ratio < 1.0 || ratio === 0)) {
    return false;
  }
  if (aspectRatio === "wide" && (ratio < 1.33 || ratio === 0)) {
    return false;
  }
  if (aspectRatio === "portrait" && (ratio >= 1.0 || ratio === 0)) {
    return false;
  }

  // 最低评分限制
  const rawScore = typeof post.score === "number" ? post.score : parseInt(post.score, 10);
  if (minScore !== undefined && !isNaN(rawScore) && rawScore < minScore) {
    return false;
  }

  // 自定义发布时间限制 (支持相对时间、年份区间、指定日期等)
  if (timeRange && timeRange !== "any" && timeRange !== "all") {
    const { minTimestamp, maxTimestamp } = parseTimeFilter(timeRange);
    if (minTimestamp !== undefined || maxTimestamp !== undefined) {
      const postTime = extractPostTimestamp(post);
      if (postTime) {
        if (minTimestamp !== undefined && postTime < minTimestamp) {
          return false;
        }
        if (maxTimestamp !== undefined && postTime > maxTimestamp) {
          return false;
        }
      }
    }
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

interface DanbooruFetchResult {
  success: boolean;
  posts: any[];
  error?: string;
}

async function fetchDanbooruPosts(
  domain: string,
  tags: string[],
  login?: string,
  apiKey?: string,
  limit = 25,
): Promise<DanbooruFetchResult> {
  const host = domain.includes("safebooru.donmai.us") ? "safebooru.donmai.us" : "danbooru.donmai.us";
  const params = new URLSearchParams();
  params.set("tags", tags.join(" "));
  params.set("limit", String(limit));
  if (login) params.set("login", login.trim());
  if (apiKey) params.set("api_key", apiKey.trim());

  const url = `https://${host}/posts.json?${params.toString()}`;
  const userAgent = `DamophusMoreBackground/1.0 (by ${login?.trim() || "siyuan-user"})`;
  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": userAgent,
  };

  if (login && apiKey) {
    try {
      const cleanLogin = login.trim();
      const cleanKey = apiKey.trim();
      const basic = typeof btoa !== "undefined"
        ? btoa(`${cleanLogin}:${cleanKey}`)
        : Buffer.from(`${cleanLogin}:${cleanKey}`).toString("base64");
      headers.Authorization = `Basic ${basic}`;
    } catch {}
  }

  let lastError = "";

  // 1. 优先使用思源内核 forwardProxy（走系统代理，绕过 Electron 无代理 / CORS / Cloudflare 限制）
  try {
    const headerList = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
    const proxyRes = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method: "GET",
        timeout: 15000,
        contentType: "application/json",
        headers: headerList,
      }),
    });
    const proxyData = await proxyRes.json();
    if (proxyData.code === 0 && proxyData.data?.body) {
      const rawBody = proxyData.data.body;
      if (proxyData.data.status === 401 || rawBody.includes("Invalid API key") || rawBody.includes("AuthenticationFailure")) {
        return {
          success: false,
          posts: [],
          error: "认证失败 (401)：Danbooru 提示 API Key 无效。请注意登录名必须是 Danbooru 用户名 (Username)，不要填纯数字 ID！",
        };
      }
      if (proxyData.data.status === 200) {
        const parsed = JSON.parse(rawBody);
        if (Array.isArray(parsed)) return { success: true, posts: parsed };
      }
      lastError = `forwardProxy HTTP ${proxyData.data.status}`;
    }
  } catch (proxyErr: any) {
    lastError = proxyErr?.message || String(proxyErr);
    log.debug("forwardProxy fetch failed, falling back to direct fetch:", lastError);
  }

  // 2. 回退：直接 fetch（部分环境可直接访问）
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    if (res.ok) {
      try {
        const data = JSON.parse(text);
        if (Array.isArray(data)) return { success: true, posts: data };
      } catch {}
    } else {
      if (res.status === 401) {
        return {
          success: false,
          posts: [],
          error: "认证失败 (401 Unauthorized)：用户名与 API Key 不匹配。请注意填写的是您的 Danbooru 用户名 (Username) 而不是纯数字 User ID！",
        };
      }
      lastError = `HTTP ${res.status}: ${res.statusText}`;
    }
  } catch (directErr: any) {
    lastError = directErr?.message || String(directErr);
  }

  return { success: false, posts: [], error: lastError || "未能获取到图片数据" };
}

export async function testBooruSiteCredential(
  site: string,
  login?: string,
  apiKey?: string,
): Promise<{ success: boolean; message: string; sampleUrl?: string; samplePostUrl?: string }> {
  try {
    let resolvedDomain = resolveSite(site) || site;
    const isDanbooruFamily = site.includes("donmai.us") || resolvedDomain === "danbooru.donmai.us";

    if (isDanbooruFamily) {
      const res = await fetchDanbooruPosts(site, ["rating:g", "scenery"], login, apiKey, 3);
      if (res.success && res.posts.length > 0) {
        const first = res.posts[0];
        const sample = first.file_url || first.large_file_url || first.preview_file_url;
        const postUrl = first.id ? extractPostDetailUrl(site, first.id) : undefined;
        return {
          success: true,
          message: `成功连接至 ${site}！已成功鉴权并获取图片`,
          sampleUrl: sample || undefined,
          samplePostUrl: postUrl,
        };
      }
      if (res.error) {
        return {
          success: false,
          message: res.error,
        };
      }
      return {
        success: true,
        message: `成功连接至 ${site}，但当前标签未返回结果。`,
      };
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
      const first = results[0];
      const sample = extractImageUrlFromPost(first);
      const postUrl = first.id ? extractPostDetailUrl(resolvedDomain, first.id) : undefined;
      return {
        success: true,
        message: `成功连接至 ${site} (${resolvedDomain})！`,
        sampleUrl: sample || undefined,
        samplePostUrl: postUrl,
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

export async function resolveBooruImageInfo(
  urlOrUri: string,
  siteCredentials?: SiteCredential[],
  globalBlacklist?: string[] | string,
): Promise<BooruResolvedInfo | null> {
  try {
    if (urlOrUri.startsWith("booru:")) {
      const { site, tags, rating, random, login, apiKey, aspectRatio, minScore, timeRange, pool, quality, blacklist } =
        parseBooruUri(urlOrUri);

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

          const candidates = res.posts.filter((p) => {
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
            return true;
          });

          if (candidates.length === 0) {
            log.info("All Danbooru posts filtered out by conditions:", {
              totalFetched,
              rejectedByBlacklist,
              rejectedByRatio,
              rejectedByScore,
              rejectedByTime,
            });
            return null;
          }

          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          let imgUrl: string | undefined;
          if (quality === "preview") {
            imgUrl = picked?.preview_file_url || picked?.large_file_url || picked?.file_url;
          } else if (quality === "sample") {
            imgUrl = picked?.large_file_url || picked?.file_url || picked?.preview_file_url;
          } else {
            imgUrl = picked?.file_url || picked?.large_file_url || picked?.preview_file_url;
          }

          if (imgUrl) {
            const postUrl = picked.id ? extractPostDetailUrl(site, picked.id) : undefined;
            return {
              imageUrl: imgUrl,
              postUrl,
              postId: picked.id,
              site,
              tags: typeof picked.tag_string === "string" ? picked.tag_string.split(" ") : undefined,
              width: picked.image_width || picked.width,
              height: picked.image_height || picked.height,
              score: picked.score,
              diagnostic: {
                totalFetched,
                filteredCount: candidates.length,
                rejectedByBlacklist,
                rejectedByRatio,
                rejectedByScore,
                rejectedByTime,
              },
            };
          }
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
        const results = await search(resolvedDomain, tagList, {
          limit: 50,
          random: random ?? true,
          credentials: credentialsQuery ? { query: credentialsQuery } : undefined,
        });

        if (results && results.length > 0) {
          const totalFetched = results.length;
          let rejectedByBlacklist = 0;
          let rejectedByRatio = 0;
          let rejectedByScore = 0;
          let rejectedByTime = 0;

          const candidates = results.filter((p) => {
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
            return true;
          });

          if (candidates.length === 0) {
            log.info("All Booru posts filtered out by conditions:", {
              totalFetched,
              rejectedByBlacklist,
              rejectedByRatio,
              rejectedByScore,
              rejectedByTime,
            });
            return null;
          }

          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          let imgUrl: string | null = null;
          if (quality === "preview") {
            imgUrl = picked.previewUrl || (picked as any).preview_url || picked.sampleUrl || picked.fileUrl || null;
          } else if (quality === "sample") {
            imgUrl = picked.sampleUrl || (picked as any).sample_url || picked.fileUrl || picked.previewUrl || null;
          } else {
            imgUrl = extractImageUrlFromPost(picked);
          }

          if (imgUrl) {
            const postUrl = picked.id ? extractPostDetailUrl(resolvedDomain, picked.id) : undefined;
            return {
              imageUrl: imgUrl,
              postUrl,
              postId: picked.id,
              site: resolvedDomain,
              tags: picked.tags,
              width: picked.width,
              height: picked.height,
              score: picked.score,
              diagnostic: {
                totalFetched,
                filteredCount: candidates.length,
                rejectedByBlacklist,
                rejectedByRatio,
                rejectedByScore,
                rejectedByTime,
              },
            };
          }
        }
      }
    }

    // Direct image URL fallback
    if (urlOrUri && (urlOrUri.startsWith("http://") || urlOrUri.startsWith("https://") || urlOrUri.startsWith("data:"))) {
      return { imageUrl: urlOrUri };
    }
    return null;
  } catch (e: any) {
    log.error("Failed to resolve booru image info:", e);
    return null;
  }
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

  if (aspectRatio !== "any" || minScore !== undefined || (timeRange && timeRange !== "any") || blacklist) {
    validPosts = validPosts.filter((p) => matchesCondition(p, aspectRatio, minScore, timeRange, blacklist));
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

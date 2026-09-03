import { resolveSite, type Post } from "@himeka/booru";
import type { SiteCredential } from "../sources";
import type { AspectRatioFilter, TimeRangeFilter } from "./uri";

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

/**
 * Inverse (NOT) constraints compiled from the condition tree. All checks are
 * fail-open: a post is only rejected when it provably violates the negated
 * condition (unknown score/ratio/time/rating keeps the post).
 */
export interface BooruNegations {
  maxScore?: number;
  notTimeRange?: string;
  notRatio?: AspectRatioFilter;
  notRating?: string;
}

// Booru rating letters/words differ per site; the query layer treats safe and
// general as one bucket (danbooru pushes rating:general for safe), so both
// normalize to "safe" here.
const RATING_ALIASES: Record<string, string> = {
  s: "safe", safe: "safe", general: "safe", g: "safe",
  q: "questionable", questionable: "questionable",
  e: "explicit", explicit: "explicit",
};

export function matchesNegations(post: Post | any, negations?: BooruNegations): boolean {
  if (!post || !negations) return true;

  if (negations.maxScore !== undefined) {
    const rawScore = typeof post.score === "number" ? post.score : parseInt(post.score, 10);
    if (!isNaN(rawScore) && rawScore > negations.maxScore) return false;
  }

  if (negations.notRatio && negations.notRatio !== "any") {
    const width = post.image_width || post.width || post.imageWidth || post.preview_width || post.previewWidth || 0;
    const height = post.image_height || post.height || post.imageHeight || post.preview_height || post.previewHeight || 0;
    const ratio = width > 0 && height > 0 ? width / height : post.aspectRatio || 0;
    if (ratio > 0) {
      if (negations.notRatio === "landscape" && ratio >= 1.0) return false;
      if (negations.notRatio === "wide" && ratio >= 1.33) return false;
      if (negations.notRatio === "portrait" && ratio < 1.0) return false;
    }
  }

  if (negations.notRating) {
    const postRating = String(post.rating ?? "").toLowerCase();
    if (postRating) {
      const normalized = RATING_ALIASES[postRating] ?? postRating;
      const negated = RATING_ALIASES[negations.notRating.toLowerCase()] ?? negations.notRating.toLowerCase();
      if (normalized === negated) return false;
    }
  }

  if (negations.notTimeRange && negations.notTimeRange !== "any" && negations.notTimeRange !== "all") {
    const { minTimestamp, maxTimestamp } = parseTimeFilter(negations.notTimeRange);
    if (minTimestamp !== undefined || maxTimestamp !== undefined) {
      const postTime = extractPostTimestamp(post);
      if (postTime) {
        const beforeMin = minTimestamp !== undefined && postTime < minTimestamp;
        const afterMax = maxTimestamp !== undefined && postTime > maxTimestamp;
        // Inside the negated window → reject; outside → keep.
        if (!beforeMin && !afterMax) return false;
      }
    }
  }

  return true;
}

export function matchesCondition(
  post: Post | any,
  aspectRatio: AspectRatioFilter = "any",
  minScore?: number,
  timeRange: TimeRangeFilter = "any",
  blacklist?: string[] | string,
  negations?: BooruNegations,
): boolean {
  if (!post) return false;

  if (blacklist && isPostBlacklisted(post, blacklist)) {
    return false;
  }

  if (negations && !matchesNegations(post, negations)) {
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

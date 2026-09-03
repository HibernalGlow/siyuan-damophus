export type AspectRatioType = "landscape" | "wide" | "portrait" | "any";

export type ImageQualityType = "original" | "sample" | "preview";

export type TimeRangeType = string;

export type SourceType = "booru" | "preset_api" | "custom_url";

export interface CoverSourceItem {
  label: string;
  url: string;
  /** OR-branch variants of `url` (OR-capable condition trees compile to several fetch queries). */
  urls?: string[];
}

export interface TagEntry {
  tag: string;
  zh?: string;
}

export interface TagPool {
  id: string;
  name: string;
  description?: string;
  items: Array<string | TagEntry>;
}

export interface SiteCredential {
  id: string;
  site: string; // e.g. "danbooru.donmai.us", "gelbooru.com", "e621.net"
  login: string;
  apiKey: string;
  enabled?: boolean;
}

export interface FilterRule {
  id: string;
  field: "aspectRatio" | "site" | "rating" | "tags" | "minScore" | "timeRange" | "tagPool" | "imageQuality" | "excludeTagPool" | "blacklist";
  operator: "equals" | "contains" | "gte" | "randomIn" | "excludeAllIn" | "containsNone";
  value: any;
}

/**
 * v2 condition model (schema 2): the rule tree is stored exactly in the shape the
 * shared query builder edits, so the condition editor needs no conversion adapter.
 * `combinator: "or"` splits fetch variants and `not` negates a subtree — both are
 * compiled by cover-condition-compile; legacy trees without them stay AND-only.
 */
export interface CoverConditionRule {
  id?: string;
  field: FilterRule["field"];
  operator: FilterRule["operator"];
  value: any;
  disabled?: boolean;
}

export interface CoverConditionGroup {
  combinator: "and" | "or";
  rules: (CoverConditionRule | CoverConditionGroup)[];
  /** Query-builder Not toggle: negates this subtree (De Morgan on compile). */
  not?: boolean;
  /** Optional group label from the editor's named groups; informational only. */
  name?: string;
  disabled?: boolean;
}

export const COVER_CONDITION_SCHEMA_VERSION = 2;

/** Legacy flat rules (schema 1) migrate to a single AND root group, preserving order. */
export function migrateLegacyCoverRules(rules: FilterRule[] = []): CoverConditionGroup {
  return {
    combinator: "and",
    rules: rules.map((rule) => ({ id: rule.id, field: rule.field, operator: rule.operator, value: rule.value })),
  };
}

export function needsConditionMigration(template: CoverTemplateItem): boolean {
  return !template.condition && (template.rules?.length ?? 0) > 0;
}

export interface CoverTemplateItem {
  id: string;
  name: string;
  type: SourceType;
  // For booru type
  site?: string;
  aspectRatio?: AspectRatioType;
  rating?: "safe" | "general" | "questionable" | "all";
  tags?: string;
  minScore?: number;
  timeRange?: TimeRangeType;
  imageQuality?: ImageQualityType;
  poolId?: string; // Reference to an independent TagPool
  pool?: string[]; // Or inline pool items
  blacklist?: string;
  /** v2 condition tree; authoritative when `conditionSchema` is 2. */
  condition?: CoverConditionGroup;
  conditionSchema?: number;
  /** @deprecated legacy v1 flat condition, superseded by `condition`; auto-migrated on read. */
  rules?: FilterRule[];
  // For preset_api or custom_url
  url?: string;
}

export interface CoverHistoryEntry {
  id: string;
  docId: string;
  docTitle?: string;
  imageUrl: string;
  /** Original remote image URL when the displayed title image is stored locally. */
  sourceUrl?: string;
  postUrl?: string;
  site?: string;
  postId?: string | number;
  tags?: string[];
  templateName?: string;
  /** applied = actively set by the user/plugin; replaced = the cover this entry replaced. */
  kind?: "applied" | "replaced";
  appliedAt: number;
}

export const DEFAULT_BLACKLISTED_TAGS = "grayscale, gay, two_males, bara, yaoi, guro, gore";

import allArtistsData from "./all_artists.json";
import { templateToUrlVariants } from "./cover-condition-compile";

export const DEFAULT_TAG_POOLS: TagPool[] = [
  {
    id: "pool-blacklist-default",
    name: "🚫 默认排除 / 屏蔽词库 (Blacklist)",
    description: "过滤灰阶黑白图、男男耽美同人及重口味题材",
    items: [
      { tag: "grayscale", zh: "灰阶 / 黑白图" },
      { tag: "monochrome", zh: "单色 / 黑白" },
      { tag: "gay", zh: "男同 / 耽美" },
      { tag: "two_males", zh: "双男 / 男同" },
      { tag: "bara", zh: "健美男同" },
      { tag: "yaoi", zh: "耽美" },
      { tag: "guro", zh: "猎奇" },
      { tag: "gore", zh: "血腥暴力" },
    ],
  },
  {
    id: "pool-top-artists",
    name: "🎨 顶级核心画师池 (Top 11)",
    description: "残夜、影法师、菲奇、毛玉牛乳等顶级核心画师",
    items: allArtistsData.top,
  },
  {
    id: "pool-best-artists",
    name: "⭐ 极品精选画师池 (Best 25)",
    description: "Ask、Blade、Gsusart、Mignon、Parsley 等",
    items: allArtistsData.best,
  },
  {
    id: "pool-nice-artists",
    name: "✨ 优质推荐画师池 (Nice 34)",
    description: "Rella、Kanzarin、Natsuhiko 等",
    items: allArtistsData.nice,
  },
  {
    id: "pool-all-artists",
    name: "📚 完整画师词库 (362 位)",
    description: "ComfyUI 搜集的全部高质量画师",
    items: allArtistsData.all,
  },
  {
    id: "pool-scenery-styles",
    name: "🌄 治愈场景与题材",
    description: "自然风景、夜空与光影题材",
    items: [
      { tag: "scenery", zh: "唯美风景 / 背景" },
      { tag: "night_sky", zh: "璀璨夜空" },
      { tag: "cloudy_sky", zh: "云海天空" },
      { tag: "sunset", zh: "落日晚霞" },
      { tag: "cityscape", zh: "城市街景" },
      { tag: "cyberpunk", zh: "赛博朋克" },
      { tag: "cherry_blossoms", zh: "浪漫樱花" },
    ],
  },
];

export const DEFAULT_SITE_CREDENTIALS: SiteCredential[] = [
  {
    id: "cred-danbooru",
    site: "danbooru.donmai.us",
    login: "",
    apiKey: "",
    enabled: true,
  },
  {
    id: "cred-gelbooru",
    site: "gelbooru.com",
    login: "",
    apiKey: "",
    enabled: true,
  },
];

export const DEFAULT_TEMPLATES: CoverTemplateItem[] = [
  {
    id: "tpl-top-artists",
    name: "🎨 喜欢画师 · 横屏精选 (Safebooru)",
    type: "booru",
    site: "safebooru.org",
    aspectRatio: "landscape",
    rating: "safe",
    imageQuality: "sample",
    tags: "wallpaper",
    poolId: "pool-top-artists",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "imageQuality", operator: "equals", value: "sample" },
      { id: "r3", field: "tagPool", operator: "randomIn", value: "pool-top-artists" },
      { id: "r4", field: "site", operator: "equals", value: "safebooru.org" },
      { id: "r5", field: "rating", operator: "equals", value: "safe" },
      { id: "r6", field: "tags", operator: "contains", value: "wallpaper" },
    ],
  },
  {
    id: "tpl-safebooru-wallpaper",
    name: "✨ Safebooru · 唯美壁纸 (横屏/免防盗链)",
    type: "booru",
    site: "safebooru.org",
    aspectRatio: "landscape",
    rating: "safe",
    imageQuality: "sample",
    tags: "wallpaper scenery",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "imageQuality", operator: "equals", value: "sample" },
      { id: "r3", field: "site", operator: "equals", value: "safebooru.org" },
      { id: "r4", field: "rating", operator: "equals", value: "safe" },
      { id: "r5", field: "tags", operator: "contains", value: "wallpaper scenery" },
    ],
  },
  {
    id: "tpl-yande-safe",
    name: "🌸 Yande.re · 精选插画 (横屏/免防盗链)",
    type: "booru",
    site: "yande.re",
    aspectRatio: "landscape",
    rating: "safe",
    imageQuality: "sample",
    tags: "scenery",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "imageQuality", operator: "equals", value: "sample" },
      { id: "r3", field: "site", operator: "equals", value: "yande.re" },
      { id: "r4", field: "rating", operator: "equals", value: "safe" },
      { id: "r5", field: "tags", operator: "contains", value: "scenery" },
    ],
  },
  {
    id: "tpl-konachan-wallpaper",
    name: "🌌 Konachan · 宽屏高清壁纸 (宽屏/免防盗链)",
    type: "booru",
    site: "konachan.com",
    aspectRatio: "wide",
    rating: "safe",
    imageQuality: "sample",
    tags: "scenery landscape",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "wide" },
      { id: "r2", field: "imageQuality", operator: "equals", value: "sample" },
      { id: "r3", field: "site", operator: "equals", value: "konachan.com" },
      { id: "r4", field: "rating", operator: "equals", value: "safe" },
      { id: "r5", field: "tags", operator: "contains", value: "scenery landscape" },
    ],
  },
  {
    id: "tpl-konachan-landscape",
    name: "🏯 Konachan · 唯美风景插画 (横屏/免防盗链)",
    type: "booru",
    site: "konachan.com",
    aspectRatio: "landscape",
    rating: "safe",
    imageQuality: "sample",
    tags: "scenery",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "imageQuality", operator: "equals", value: "sample" },
      { id: "r3", field: "site", operator: "equals", value: "konachan.com" },
      { id: "r4", field: "rating", operator: "equals", value: "safe" },
      { id: "r5", field: "tags", operator: "contains", value: "scenery" },
    ],
  },
  {
    id: "tpl-konachan-best",
    name: "⭐ Konachan · 高分壁纸精选 (评分>=10/宽屏)",
    type: "booru",
    site: "konachan.com",
    aspectRatio: "wide",
    rating: "safe",
    minScore: 10,
    imageQuality: "sample",
    tags: "wallpaper",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "wide" },
      { id: "r2", field: "imageQuality", operator: "equals", value: "sample" },
      { id: "r3", field: "minScore", operator: "gte", value: 10 },
      { id: "r4", field: "site", operator: "equals", value: "konachan.com" },
      { id: "r5", field: "rating", operator: "equals", value: "safe" },
      { id: "r6", field: "tags", operator: "contains", value: "wallpaper" },
    ],
  },
  {
    id: "tpl-bing-daily",
    name: "🌍 必应每日壁纸",
    type: "preset_api",
    url: "https://bing.biturl.top/?format=image&index=random&mkt=zh-CN",
  },
  {
    id: "tpl-acg-anime",
    name: "🍱 ACG 随机动漫",
    type: "preset_api",
    url: "https://img.xjh.me/random_img.php?return=302",
  },
  {
    id: "tpl-unsplash",
    name: "📷 Unsplash 高清摄影",
    type: "preset_api",
    url: "https://unsplash.it/{width}/{height}?random",
  },
  {
    id: "tpl-picsum",
    name: "🎲 Picsum 随机图片",
    type: "preset_api",
    url: "https://picsum.photos/{width}/{height}",
  },
];

// Single-URL view of the condition tree: first fetch variant (AND-only trees
// have exactly one). OR-capable trees use templateToUrlVariants instead.
export function templateToUrl(template: CoverTemplateItem, tagPools: TagPool[] = DEFAULT_TAG_POOLS): string {
  return templateToUrlVariants(template, tagPools)[0] ?? "";
}

export const DEFAULT_COVER_SOURCES: CoverSourceItem[] = DEFAULT_TEMPLATES.map((tpl) => {
  const urls = templateToUrlVariants(tpl, DEFAULT_TAG_POOLS);
  return { label: tpl.name, url: urls[0] ?? "", urls: urls.length > 1 ? urls : undefined };
});

/**
 * One fetch query for this source: a random OR variant when the condition tree
 * has any, otherwise the single URL. Picking per fetch (not per template) is
 * what makes an OR tree sample the union of its branches.
 */
export function pickCoverSourceUrl(item: CoverSourceItem): string {
  if (item.urls && item.urls.length > 0) {
    return item.urls[Math.floor(Math.random() * item.urls.length)];
  }
  return item.url;
}

export function urlToTemplate(label: string, url: string, id?: string): CoverTemplateItem {
  const generatedId = id || `tpl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  if (!url.startsWith("booru:")) {
    return {
      id: generatedId,
      name: label,
      type: url.includes("biturl") || url.includes("unsplash") || url.includes("picsum") || url.includes("xjh.me")
        ? "preset_api"
        : "custom_url",
      url,
    };
  }

  const withoutScheme = url.slice("booru:".length);
  const [siteOrAlias, queryString] = withoutScheme.split("?", 2);
  const params = new URLSearchParams(queryString || "");

  const site = params.get("site") || siteOrAlias || "safebooru.org";
  const ratio = (params.get("ratio") || params.get("aspectRatio") || "any") as AspectRatioType;
  const rating = (params.get("rating") || "safe") as CoverTemplateItem["rating"];
  const tags = params.get("tags") || "";
  const minScore = params.has("min_score")
    ? parseInt(params.get("min_score")!, 10)
    : params.has("score")
    ? parseInt(params.get("score")!, 10)
    : undefined;
  const timeRange = (params.get("time_range") || params.get("timeRange") || params.get("time") || "any") as TimeRangeType;
  const rawQuality = params.get("quality") || params.get("imageQuality");
  let imageQuality: ImageQualityType = "original";
  if (rawQuality === "preview" || params.get("preview") === "true" || params.get("thumb") === "true") {
    imageQuality = "preview";
  } else if (rawQuality === "sample" || rawQuality === "large") {
    imageQuality = "sample";
  }
  const rawPool = params.get("pool");
  const pool = rawPool ? rawPool.split(/[,|\n]/).map((s) => s.trim()).filter(Boolean) : undefined;
  const blacklist = params.get("blacklist") || params.get("blocked") || undefined;

  return {
    id: generatedId,
    name: label,
    type: "booru",
    site,
    aspectRatio: ratio,
    rating,
    tags,
    minScore,
    timeRange,
    imageQuality,
    pool,
    blacklist,
  };
}

const VIDEO_EXTENSION_REGEX = /\.(mp4|webm|ogg|ogv|mov|avi|wmv|flv|mkv|rm|rmvb|3gp|mpg|mpeg|mp4v|mpg4|mpeg4|vob|qt|divx|xvid|f4v|f4p|f4a|f4b)(\?.*)?$/i;

export function isVideoUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  return VIDEO_EXTENSION_REGEX.test(url.trim());
}

export function formatCoverUrl(urlTemplate: string, width: number | string = 1920, height: number | string = 1080): string {
  if (!urlTemplate) return "";
  return urlTemplate
    .replace(/\{width\}/g, String(width || 1920))
    .replace(/\{height\}/g, String(height || 1080));
}

export function sanitizeAssetsPath(path: string): string {
  let p = (path || "").trim().replace(/\\/g, "/");
  if (!p.startsWith("/")) {
    p = `/${p}`;
  }
  return p.replace(/\/+$/, "");
}

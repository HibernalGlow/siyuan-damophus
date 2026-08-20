export type AspectRatioType = "landscape" | "wide" | "portrait" | "any";

export type SourceType = "booru" | "preset_api" | "custom_url";

export interface CoverSourceItem {
  label: string;
  url: string;
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
  field: "aspectRatio" | "site" | "rating" | "tags" | "minScore" | "tagPool";
  operator: "equals" | "contains" | "gte" | "randomIn";
  value: any;
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
  poolId?: string; // Reference to an independent TagPool
  pool?: string[]; // Or inline pool items
  rules?: FilterRule[];
  // For preset_api or custom_url
  url?: string;
}

import allArtistsData from "./all_artists.json";

export const DEFAULT_TAG_POOLS: TagPool[] = [
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
    name: "🎨 喜欢画师 · 横屏精选",
    type: "booru",
    site: "safebooru.org",
    aspectRatio: "landscape",
    rating: "safe",
    tags: "wallpaper",
    poolId: "pool-top-artists",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "tagPool", operator: "randomIn", value: "pool-top-artists" },
      { id: "r3", field: "site", operator: "equals", value: "safebooru.org" },
      { id: "r4", field: "rating", operator: "equals", value: "safe" },
      { id: "r5", field: "tags", operator: "contains", value: "wallpaper" },
    ],
  },
  {
    id: "tpl-safebooru-wallpaper",
    name: "✨ Safebooru · 唯美壁纸 (横屏)",
    type: "booru",
    site: "safebooru.org",
    aspectRatio: "landscape",
    rating: "safe",
    tags: "wallpaper scenery",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "site", operator: "equals", value: "safebooru.org" },
      { id: "r3", field: "rating", operator: "equals", value: "safe" },
      { id: "r4", field: "tags", operator: "contains", value: "wallpaper scenery" },
    ],
  },
  {
    id: "tpl-danbooru-scenery",
    name: "🌄 Danbooru · 高分风景 (宽屏)",
    type: "booru",
    site: "danbooru.donmai.us",
    aspectRatio: "wide",
    rating: "general",
    tags: "landscape scenery",
    minScore: 5,
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "wide" },
      { id: "r2", field: "site", operator: "equals", value: "danbooru.donmai.us" },
      { id: "r3", field: "rating", operator: "equals", value: "general" },
      { id: "r4", field: "minScore", operator: "gte", value: 5 },
      { id: "r5", field: "tags", operator: "contains", value: "landscape scenery" },
    ],
  },
  {
    id: "tpl-yande-safe",
    name: "🌸 Yande.re · 精选插画 (横屏)",
    type: "booru",
    site: "yande.re",
    aspectRatio: "landscape",
    rating: "safe",
    tags: "scenery",
    rules: [
      { id: "r1", field: "aspectRatio", operator: "equals", value: "landscape" },
      { id: "r2", field: "site", operator: "equals", value: "yande.re" },
      { id: "r3", field: "rating", operator: "equals", value: "safe" },
      { id: "r4", field: "tags", operator: "contains", value: "scenery" },
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

export function templateToUrl(template: CoverTemplateItem, tagPools: TagPool[] = DEFAULT_TAG_POOLS): string {
  if (template.type === "preset_api" || template.type === "custom_url") {
    return template.url || "";
  }

  const params = new URLSearchParams();

  // 如果模板有显式 rules 列表，以 rules 为绝对基准
  if (template.rules && template.rules.length > 0) {
    let site = template.site || "safebooru.org";
    let poolId: string | undefined;
    let explicitTags = "";

    for (const r of template.rules) {
      if (r.field === "site" && r.value) {
        site = r.value;
      } else if (r.field === "aspectRatio" && r.value && r.value !== "any") {
        params.set("ratio", r.value);
      } else if (r.field === "rating" && r.value && r.value !== "all") {
        params.set("rating", r.value);
      } else if (r.field === "tags" && r.value) {
        explicitTags = r.value;
      } else if (r.field === "minScore" && Number(r.value) > 0) {
        params.set("min_score", String(r.value));
      } else if (r.field === "tagPool" && r.value) {
        poolId = r.value;
      }
    }

    params.set("site", site);
    if (explicitTags) {
      params.set("tags", explicitTags);
    }

    let candidateItems: string[] = [];
    if (poolId) {
      const matchedPool = tagPools.find((p) => p.id === poolId);
      if (matchedPool && matchedPool.items?.length > 0) {
        candidateItems = matchedPool.items
          .map((it) => (typeof it === "string" ? it.split(/[#,:]/)[0].trim().replace(/\s+/g, "_") : it.tag || ""))
          .filter(Boolean);
      }
    }
    if (candidateItems.length === 0 && template.pool && template.pool.length > 0) {
      candidateItems = template.pool.map((it) => (typeof it === "string" ? it.split(/[#,:]/)[0].trim().replace(/\s+/g, "_") : (it as any).tag || "")).filter(Boolean);
    }
    if (candidateItems.length > 0) {
      params.set("pool", candidateItems.join(","));
    }

    return `booru:${site}?${params.toString()}`;
  }

  const site = template.site || "safebooru.org";
  params.set("site", site);

  if (template.aspectRatio && template.aspectRatio !== "any") {
    params.set("ratio", template.aspectRatio);
  }
  if (template.rating && template.rating !== "all") {
    params.set("rating", template.rating);
  }
  if (template.tags) {
    params.set("tags", template.tags);
  }
  if (template.minScore !== undefined && template.minScore > 0) {
    params.set("min_score", String(template.minScore));
  }

  // Resolve pool: prefer poolId from tagPools, fallback to inline pool
  let candidateItems: string[] = [];
  if (template.poolId) {
    const matchedPool = tagPools.find((p) => p.id === template.poolId);
    if (matchedPool && matchedPool.items?.length > 0) {
      candidateItems = matchedPool.items.map((it) => {
        if (typeof it === "string") {
          return it.split(/[#,:]/)[0].trim().replace(/\s+/g, "_");
        }
        return it.tag || "";
      }).filter(Boolean);
    }
  }
  if (candidateItems.length === 0 && template.pool && template.pool.length > 0) {
    candidateItems = template.pool.map((it) => {
      if (typeof it === "string") {
        return it.split(/[#,:]/)[0].trim().replace(/\s+/g, "_");
      }
      return (it as any).tag || "";
    }).filter(Boolean);
  }

  if (candidateItems.length > 0) {
    params.set("pool", candidateItems.join(","));
  }

  return `booru:${site}?${params.toString()}`;
}

export const DEFAULT_COVER_SOURCES: CoverSourceItem[] = DEFAULT_TEMPLATES.map((tpl) => ({
  label: tpl.name,
  url: templateToUrl(tpl, DEFAULT_TAG_POOLS),
}));

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
  const minScore = params.has("min_score") ? parseInt(params.get("min_score")!, 10) : undefined;
  const rawPool = params.get("pool");
  const pool = rawPool ? rawPool.split(/[,|\n]/).map((s) => s.trim()).filter(Boolean) : undefined;

  return {
    id: generatedId,
    name: label,
    type: "booru",
    site,
    aspectRatio: ratio,
    rating,
    tags,
    minScore,
    pool,
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

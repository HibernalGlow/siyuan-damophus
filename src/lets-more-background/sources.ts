export type AspectRatioType = "landscape" | "wide" | "portrait" | "any";

export type SourceType = "booru" | "preset_api" | "custom_url";

export interface CoverSourceItem {
  label: string;
  url: string;
}

export interface SiteCredential {
  id: string;
  site: string; // e.g. "danbooru.donmai.us", "gelbooru.com", "e621.net"
  login: string;
  apiKey: string;
  enabled?: boolean;
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
  pool?: string[];
  // For preset_api or custom_url
  url?: string;
}

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
    pool: [
      "ask_(askzy)",
      "blade_(galaxist)",
      "chomoran",
      "gsusart",
      "henreader",
      "mignon",
      "parsley-f",
      "fkey",
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
  },
  {
    id: "tpl-yande-safe",
    name: "🌸 Yande.re · 精选插画 (横屏)",
    type: "booru",
    site: "yande.re",
    aspectRatio: "landscape",
    rating: "safe",
    tags: "scenery",
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

export function templateToUrl(template: CoverTemplateItem): string {
  if (template.type === "preset_api" || template.type === "custom_url") {
    return template.url || "";
  }

  const params = new URLSearchParams();
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
  if (template.pool && template.pool.length > 0) {
    params.set("pool", template.pool.join(","));
  }

  return `booru:${site}?${params.toString()}`;
}

export const DEFAULT_COVER_SOURCES: CoverSourceItem[] = DEFAULT_TEMPLATES.map((tpl) => ({
  label: tpl.name,
  url: templateToUrl(tpl),
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

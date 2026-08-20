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
}

export async function fetchImageForPreview(imageUrl: string): Promise<string> {
  if (!imageUrl) return "";
  if (imageUrl.startsWith("data:") || imageUrl.startsWith("blob:")) return imageUrl;

  // 1. 优先尝试直接 fetch 转 Blob URL (彻底剥离 Referer)
  try {
    const res = await fetch(imageUrl, {
      referrerPolicy: "no-referrer",
      headers: { Accept: "image/*,*/*" },
    });
    if (res.ok) {
      const blob = await res.blob();
      return URL.createObjectURL(blob);
    }
  } catch (directErr) {
    log.debug("Direct fetch image for preview failed:", directErr);
  }

  // 2. 使用思源内核 forwardProxy 代理获取图片
  // forwardProxy 返回的 body 在 bodyEncoding=text 时是字符串形式的二进制数据
  // 需要将其转为 Uint8Array → Blob → Object URL
  try {
    const proxyRes = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: imageUrl,
        method: "GET",
        timeout: 30000,
        contentType: "application/octet-stream",
        headers: [
          "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept: image/*,*/*",
        ],
      }),
    });
    const proxyData = await proxyRes.json();
    if (proxyData.code === 0 && proxyData.data?.status === 200 && proxyData.data?.body) {
      const body: string = proxyData.data.body;
      const contentType: string = proxyData.data.contentType || "image/jpeg";
      const encoding: string = proxyData.data.bodyEncoding || "text";

      let blob: Blob;
      if (encoding === "base64") {
        // base64 编码：直接解码
        const binaryStr = atob(body);
        const bytes = new Uint8Array(binaryStr.length);
        for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
        blob = new Blob([bytes], { type: contentType });
      } else {
        // text 编码：逐字符提取 charCode 构建 Uint8Array
        const bytes = new Uint8Array(body.length);
        for (let i = 0; i < body.length; i++) bytes[i] = body.charCodeAt(i) & 0xff;
        blob = new Blob([bytes], { type: contentType });
      }

      if (blob.size > 0) {
        return URL.createObjectURL(blob);
      }
    }
  } catch (proxyErr) {
    log.debug("SiYuan forwardProxy image fetch failed:", proxyErr);
  }

  return imageUrl;
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

  // 1. 尝试直接 fetch
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

  // 2. 尝试思源内核代理 forwardProxy (绕过 CORS / Cloudflare 质询)
  try {
    const headerList = Object.entries(headers).map(([k, v]) => `${k}: ${v}`);
    const proxyRes = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method: "GET",
        timeout: 10000,
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
      const parsed = JSON.parse(rawBody);
      if (Array.isArray(parsed)) return { success: true, posts: parsed };
    }
  } catch (proxyErr: any) {
    lastError = proxyErr?.message || String(proxyErr);
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
): Promise<BooruResolvedInfo | null> {
  try {
    if (urlOrUri.startsWith("booru:")) {
      const { site, tags, rating, random, login, apiKey, aspectRatio, minScore, pool } =
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
          30,
        );

        if (res.success && res.posts && res.posts.length > 0) {
          let candidates = res.posts.slice();
          if (aspectRatio && aspectRatio !== "any") {
            const filtered = candidates.filter((p) => {
              const width = p.image_width || p.width || 0;
              const height = p.image_height || p.height || 0;
              const ratio = width > 0 && height > 0 ? width / height : 1;
              if (aspectRatio === "landscape" && ratio < 1.0) return false;
              if (aspectRatio === "wide" && ratio < 1.33) return false;
              if (aspectRatio === "portrait" && ratio >= 1.0) return false;
              if (minScore !== undefined && typeof p.score === "number" && p.score < minScore) return false;
              return true;
            });
            if (filtered.length > 0) {
              candidates = filtered;
            }
          }

          const picked = candidates[Math.floor(Math.random() * candidates.length)];
          const imgUrl = picked?.file_url || picked?.large_file_url || picked?.preview_file_url;
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
): Promise<string | null> {
  const info = await resolveBooruImageInfo(urlOrUri, siteCredentials);
  return info?.imageUrl || null;
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

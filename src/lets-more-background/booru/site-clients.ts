import { resolveSite, search, sites } from "@himeka/booru";
import { getLogger } from "@/libs/logger";
import type { SiteCredential } from "../sources";
import type { BooruPostReference } from "./uri";
import { extractImageUrlFromPost, extractPostDetailUrl, parseBooruPostUrl } from "./uri";
import type { BooruResolvedInfo } from "./image-fetch";
import { findSiteCredential } from "./post-filter";

const log = getLogger("lets-more-background:booru");

interface DanbooruFetchResult {
  success: boolean;
  posts: any[];
  error?: string;
}

interface GenericBooruSite {
  domain?: string;
  insecure?: boolean;
  api?: { search?: string };
  tagQuery?: string;
  tagJoin?: string;
  paginate?: string;
  random?: boolean;
  defaultTags?: string[];
}

export function normalizeBooruPost(post: any): any {
  if (!post || typeof post !== "object") return post;
  return {
    ...post,
    fileUrl: post.fileUrl || post.file_url || null,
    sampleUrl: post.sampleUrl || post.sample_url || null,
    previewUrl: post.previewUrl || post.preview_url || null,
    width: post.width || post.image_width || post.sample_width || post.preview_width || 0,
    height: post.height || post.image_height || post.sample_height || post.preview_height || 0,
    tags: Array.isArray(post.tags)
      ? post.tags
      : typeof post.tags === "string"
      ? post.tags.split(/\s+/).filter(Boolean)
      : typeof post.tag_string === "string"
      ? post.tag_string.split(/\s+/).filter(Boolean)
      : [],
  };
}

export async function fetchGenericBooruPosts(
  resolvedDomain: string,
  tags: string[],
  limit: number,
  random: boolean,
  credentialsQuery?: string,
): Promise<any[]> {
  const site = sites[resolvedDomain] as GenericBooruSite | undefined;
  if (!site?.api?.search || !site.domain) return [];

  const queryTags = [...tags];
  let requestLimit = limit;
  if (random && site.random) {
    queryTags.push("order:random");
  } else if (random) {
    requestLimit = Math.max(limit, 100);
  }
  for (const defaultTag of site.defaultTags || []) {
    if (!queryTags.includes(defaultTag)) queryTags.push(defaultTag);
  }

  const tagQuery = site.tagQuery || "tags";
  const tagJoin = site.tagJoin || "+";
  const pagination = site.paginate || "page";
  const page = pagination === "pid" ? 0 : 1;
  const encodedTags = queryTags.map((tag) => encodeURIComponent(tag)).join(tagJoin);
  const protocol = site.insecure ? "http" : "https";
  const query = `${tagQuery}=${encodedTags}&limit=${requestLimit}&${pagination}=${page}`;
  const url = `${protocol}://${site.domain}${site.api.search}${query}${credentialsQuery ? `&${credentialsQuery.replace(/^&/, "")}` : ""}`;

  try {
    const proxyRes = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method: "GET",
        timeout: 15000,
        contentType: "application/json",
        responseEncoding: "text",
        headers: ["Accept: application/json"],
      }),
    });
    const proxyData = await proxyRes.json();
    const rawBody = proxyData.data?.body;
    if (proxyData.code === 0 && proxyData.data?.status === 200 && typeof rawBody === "string") {
      const parsed = JSON.parse(rawBody);
      if (Array.isArray(parsed)) return parsed.map(normalizeBooruPost);
      if (Array.isArray(parsed?.post)) return parsed.post.map(normalizeBooruPost);
    }
    log.debug("Generic booru forwardProxy returned no posts", { resolvedDomain, status: proxyData.data?.status });
  } catch (proxyErr) {
    log.debug("Generic booru forwardProxy failed, falling back to direct search:", proxyErr);
  }

  const directResults = await search(resolvedDomain, tags, {
    limit,
    random,
    credentials: credentialsQuery ? { query: credentialsQuery } : undefined,
  });
  return Array.from(directResults || []);
}

async function fetchBooruPostByApi(
  reference: BooruPostReference,
  credentials?: SiteCredential[],
): Promise<any | null> {
  const site = sites[reference.site] as GenericBooruSite & { api?: { postView?: string } } | undefined;
  if (!site?.domain || !site.api?.postView || site.api.postView.includes("/posts/")) return null;
  const credential = findSiteCredential(reference.site, credentials);
  const query = credential?.login && credential?.apiKey
    ? `login=${encodeURIComponent(credential.login)}&api_key=${encodeURIComponent(credential.apiKey)}`
    : credential?.apiKey
    ? `api_key=${encodeURIComponent(credential.apiKey)}`
    : "";
  const protocol = site.insecure ? "http" : "https";
  const separator = site.api.postView.includes("?") ? "&" : "?";
  const url = `${protocol}://${site.domain}${site.api.postView}${reference.postId}${query ? separator + query : ""}`;
  try {
    const response = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method: "GET",
        timeout: 15000,
        contentType: "application/json",
        responseEncoding: "text",
        headers: ["Accept: application/json"],
      }),
    });
    const data = await response.json();
    if (data?.code !== 0 || data.data?.status !== 200 || typeof data.data?.body !== "string") return null;
    const parsed = JSON.parse(data.data.body);
    return Array.isArray(parsed) ? parsed[0] || null : parsed?.post?.[0] || parsed?.post || parsed;
  } catch (error) {
    log.debug("Failed to fetch Booru post detail API:", error);
    return null;
  }
}

/** Resolve a manually supplied Booru post page or direct image URL. */
export async function resolveManualBooruUrl(
  value: string,
  siteCredentials?: SiteCredential[],
): Promise<BooruResolvedInfo | null> {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const reference = parseBooruPostUrl(raw);
  if (!reference) return /^https?:\/\//i.test(raw) || raw.startsWith("data:") ? { imageUrl: raw } : null;

  const credential = findSiteCredential(reference.site, siteCredentials);
  let post: any | null = await fetchBooruPostByApi(reference, siteCredentials);
  if (!post) {
    const isDanbooruFamily = reference.site.includes("donmai.us");
    if (isDanbooruFamily) {
      const result = await fetchDanbooruPosts(reference.site, [`id:${reference.postId}`], credential?.login, credential?.apiKey, 1);
      post = result.success ? result.posts[0] || null : null;
    } else {
      const credentialQuery = credential?.login && credential?.apiKey
        ? `login=${encodeURIComponent(credential.login)}&api_key=${encodeURIComponent(credential.apiKey)}`
        : credential?.apiKey ? `api_key=${encodeURIComponent(credential.apiKey)}` : undefined;
      const posts = await fetchGenericBooruPosts(reference.site, [`id:${reference.postId}`], 1, false, credentialQuery);
      post = posts.find((item) => String(item?.id) === reference.postId) || posts[0] || null;
    }
  }
  if (!post) return null;
  const normalized = normalizeBooruPost(post);
  const imageUrl = extractImageUrlFromPost(normalized);
  if (!imageUrl) return null;
  const postId = normalized.id || reference.postId;
  return {
    imageUrl,
    postUrl: raw,
    postId,
    site: reference.site,
    tags: normalized.tags,
    width: normalized.width || undefined,
    height: normalized.height || undefined,
    score: normalized.score,
  };
}

export async function fetchDanbooruPosts(
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

import { getLogger } from "@/libs/logger";

const log = getLogger("lets-more-background:booru");

export interface BooruResolveDiagnostic {
  totalFetched: number;
  filteredCount: number;
  rejectedByRatio?: number;
  rejectedByScore?: number;
  rejectedByBlacklist?: number;
  rejectedByTime?: number;
  rejectedByDuplicate?: number;
  errorMessage?: string;
}

export interface BooruResolvedInfo {
  imageUrl: string;
  previewBlobUrl?: string;
  /** Small preview URL (site preview/sample variant) for grid thumbnails. */
  previewUrl?: string;
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

import { getLogger } from "@/libs/logger";
import type { SiteCredential } from "./sources";
import type { CoverFavorite } from "./cover-favorites";

const log = getLogger("lets-more-background:favorite-sync");

export interface CoverFavoriteSyncResult {
  status: "unsupported" | "not-configured" | "synced" | "failed";
  message: string;
}

function normalizedSite(site?: string): string {
  return String(site || "").trim().toLowerCase().replace(/^www\./, "");
}

function isDanbooruFamily(site?: string): boolean {
  const value = normalizedSite(site);
  return value === "danbooru.donmai.us" || value === "safebooru.donmai.us";
}

function basicAuthorization(credential: SiteCredential): string | undefined {
  if (!credential.login.trim() || !credential.apiKey.trim()) return undefined;
  try {
    return `Basic ${btoa(`${credential.login.trim()}:${credential.apiKey.trim()}`)}`;
  } catch {
    return undefined;
  }
}

export async function syncCoverFavoriteToSite(
  favorite: CoverFavorite,
  credential: SiteCredential | undefined,
  desired = true,
): Promise<CoverFavoriteSyncResult> {
  if (!isDanbooruFamily(favorite.site)) {
    return { status: "unsupported", message: "该站点暂不提供统一的收藏 API" };
  }
  if (!favorite.postId) {
    return { status: "failed", message: "收藏记录缺少原站帖子 ID" };
  }
  if (!credential?.login.trim() || !credential.apiKey.trim()) {
    return { status: "not-configured", message: "请先在多站点凭据中填写登录名和 API Key" };
  }

  const site = normalizedSite(favorite.site);
  const postId = encodeURIComponent(String(favorite.postId));
  const url = desired
    ? `https://${site}/favorites.json`
    : `https://${site}/favorites/${postId}.json`;
  const authorization = basicAuthorization(credential);
  const headers = [
    "Accept: application/json",
    "Content-Type: application/x-www-form-urlencoded",
    ...(authorization ? [`Authorization: ${authorization}`] : []),
  ];
  try {
    const response = await fetch("/api/network/forwardProxy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        method: desired ? "POST" : "DELETE",
        timeout: 15000,
        contentType: "application/x-www-form-urlencoded",
        headers,
        payload: desired ? `post_id=${postId}` : "",
        payloadEncoding: "text",
        responseEncoding: "text",
      }),
    });
    const data = await response.json();
    const status = Number(data?.data?.status || 0);
    if (data?.code === 0 && (status === 200 || status === 201 || status === 204)) {
      return { status: "synced", message: desired ? "已同步到站点收藏" : "已从站点收藏中移除" };
    }
    const message = `站点返回 HTTP ${status || "未知"}`;
    log.warn("Cover favorite sync failed:", message, favorite.site, favorite.postId);
    return { status: "failed", message };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn("Cover favorite sync request failed:", message);
    return { status: "failed", message };
  }
}


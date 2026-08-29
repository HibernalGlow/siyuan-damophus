import { plugin } from "@/utils";

export interface AssetLinkMapData {
  version: 1;
  /** Network resource URL -> local asset path ("assets/...") produced by a previous conversion. */
  links: Record<string, string>;
}

const STORAGE_PATH = "network-assets-local/asset-links.json";

function looksLikeRemoteUrl(url: string): boolean {
  return /^(?:https?|file):\/\/|^\/\//iu.test(url);
}

export function normalizeAssetLinkMap(raw: unknown): AssetLinkMapData {
  const links: Record<string, string> = {};
  if (raw && typeof raw === "object") {
    const candidate = (raw as { links?: unknown }).links ?? raw;
    if (typeof candidate === "object" && candidate !== null) {
      for (const [url, path] of Object.entries(candidate as Record<string, unknown>)) {
        if (typeof url === "string" && looksLikeRemoteUrl(url) && typeof path === "string" && path.startsWith("assets/")) {
          links[url] = path;
        }
      }
    }
  }
  return { version: 1, links };
}

export async function loadAssetLinkMap(): Promise<AssetLinkMapData> {
  try {
    return normalizeAssetLinkMap(await plugin.loadData(STORAGE_PATH));
  } catch {
    return { version: 1, links: {} };
  }
}

export async function saveAssetLinkMap(map: AssetLinkMapData): Promise<void> {
  await plugin.saveData(STORAGE_PATH, map);
}

import { sql } from "@/api";
import { resolveSite } from "@himeka/booru";

const SOURCE_ATTRIBUTE = "custom-damophus-cover-source-url";
const TITLE_IMAGE_ATTRIBUTES = new Set(["title-img", "custom-title-img"]);

export interface CoverAttributeRow {
  block_id?: string;
  name?: string;
  value?: string;
}

export function booruPostDedupKey(site: unknown, postId: unknown): string | null {
  const rawSite = String(site || "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  const rawPostId = String(postId || "").trim();
  const canonicalSite = rawSite ? (resolveSite(rawSite) || rawSite) : "";
  return canonicalSite && rawPostId ? `booru-post:${canonicalSite}:${rawPostId}` : null;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function extractUrl(value: string): string {
  const decoded = decodeHtmlEntities(value.trim());
  const match = decoded.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i);
  return (match?.[1] || match?.[2] || match?.[3] || decoded).trim();
}

export function normalizeCoverUrl(value: string): string | null {
  const source = extractUrl(String(value || ""));
  const candidate = source.startsWith("//") ? `https:${source}` : source;
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    const parsed = new URL(candidate);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return candidate.replace(/#.*$/, "");
  }
}

/** Normalize local asset paths so a leading `/data/` does not hide a match. */
export function normalizeCoverAssetPath(value: string): string | null {
  const source = extractUrl(String(value || ""));
  if (!source || /^(?:https?:|data:|blob:)/i.test(source)) return null;
  return source.replace(/^\/+/, "").replace(/^data\//i, "").replace(/\/+/g, "/");
}

export function collectUsedCoverUrls(rows: CoverAttributeRow[]): Set<string> {
  const urls = new Set<string>();
  const postMetadataByBlock = new Map<string, { site?: string; postId?: string }>();
  for (const row of rows || []) {
    if (row.block_id && row.name === "custom-damophus-post-site") {
      const existing = postMetadataByBlock.get(row.block_id) || {};
      postMetadataByBlock.set(row.block_id, { ...existing, site: row.value });
    }
    if (row.block_id && row.name === "custom-damophus-post-id") {
      const existing = postMetadataByBlock.get(row.block_id) || {};
      postMetadataByBlock.set(row.block_id, { ...existing, postId: row.value });
    }
    if (row.name !== SOURCE_ATTRIBUTE && !TITLE_IMAGE_ATTRIBUTES.has(row.name || "")) continue;
    const normalized = normalizeCoverUrl(row.value || "");
    if (normalized) urls.add(normalized);
  }
  for (const metadata of postMetadataByBlock.values()) {
    const key = booruPostDedupKey(metadata.site, metadata.postId);
    if (key) urls.add(key);
  }
  return urls;
}

export async function loadUsedCoverUrls(): Promise<Set<string>> {
  const rows = await sql(
    "SELECT block_id, name, value FROM attributes WHERE name IN ('custom-damophus-cover-source-url', 'title-img', 'custom-title-img', 'custom-damophus-post-site', 'custom-damophus-post-id')",
  );
  return collectUsedCoverUrls(rows as CoverAttributeRow[]);
}

export interface CoverHistoryUrlEntry {
  imageUrl?: string;
  sourceUrl?: string;
  site?: string;
  postId?: string | number;
}

export function collectHistoryCoverUrls(entries: CoverHistoryUrlEntry[]): Set<string> {
  const urls = new Set<string>();
  for (const entry of entries || []) {
    const normalized = normalizeCoverUrl(entry.imageUrl || "");
    if (normalized) urls.add(normalized);
    const source = normalizeCoverUrl(entry.sourceUrl || "");
    if (source) urls.add(source);
    const key = booruPostDedupKey(entry.site, entry.postId);
    if (key) urls.add(key);
  }
  return urls;
}

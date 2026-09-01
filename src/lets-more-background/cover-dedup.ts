import { sql } from "@/api";
import { resolveSite } from "@himeka/booru";

const SOURCE_ATTRIBUTE = "custom-damophus-cover-source-url";
const TITLE_IMAGE_ATTRIBUTES = new Set(["title-img", "custom-title-img"]);

export interface CoverAttributeRow {
  block_id?: string;
  name?: string;
  value?: string;
}

export interface CoverBlockRow {
  block_id?: string;
  ial?: string;
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
  if (!source || /^(?:data:|blob:)/i.test(source)) return null;

  // SiYuan serves local assets through a loopback or dev-tunnel URL in some
  // persisted attributes, while file listings return the relative
  // `assets/...` path. Treat both forms as the same cover identity.
  const loopbackAsset = source.match(
    /^https?:\/\/(?:(?:localhost|127\.0\.0\.1)(?::\d+)?|(?:[a-z0-9-]+\.)+devtunnels\.ms(?::\d+)?)\/(?:data\/)?(assets\/.*)$/i,
  );
  const path = loopbackAsset?.[1] || source;
  if (/^https?:\/\//i.test(path)) return null;
  return path.replace(/^\/+/, "").replace(/^data\//i, "").replace(/\/+/g, "/");
}

/** Return a stable identity for both remote covers and local asset paths. */
export function coverDedupIdentity(value: string): string | null {
  const asset = normalizeCoverAssetPath(value);
  if (asset) return `asset:${asset.toLowerCase()}`;
  return normalizeCoverUrl(value);
}

export function collectTitleImageRows(blocks: CoverBlockRow[]): CoverAttributeRow[] {
  const rows: CoverAttributeRow[] = [];
  for (const block of blocks || []) {
    const ial = String(block.ial || "");
    for (const name of TITLE_IMAGE_ATTRIBUTES) {
      const match = ial.match(new RegExp(`(?:^|[\\s{])${name}="([^"]*)"`));
      if (match?.[1]) rows.push({ block_id: block.block_id, name, value: match[1] });
    }
  }
  return rows;
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
    const identity = coverDedupIdentity(row.value || "");
    if (identity) urls.add(identity);
  }
  for (const metadata of postMetadataByBlock.values()) {
    const key = booruPostDedupKey(metadata.site, metadata.postId);
    if (key) urls.add(key);
  }
  return urls;
}

export async function loadUsedCoverUrls(): Promise<Set<string>> {
  const [attributeRows, blockRows] = await Promise.all([
    sql(
      "SELECT block_id, name, value FROM attributes WHERE name IN ('custom-damophus-cover-source-url', 'custom-damophus-post-site', 'custom-damophus-post-id') LIMIT 100000",
    ),
    sql(
      "SELECT id AS block_id, ial FROM blocks WHERE type = 'd' AND (ial LIKE '%title-img=%' OR ial LIKE '%custom-title-img=%') LIMIT 100000",
    ),
  ]);
  return collectUsedCoverUrls([
    ...(attributeRows as CoverAttributeRow[]),
    ...collectTitleImageRows(blockRows as CoverBlockRow[]),
  ]);
}

export interface CoverHistoryUrlEntry {
  imageUrl?: string;
  sourceUrl?: string;
  site?: string;
  postId?: string | number;
}

export interface CoverCacheIndexEntry {
  path?: string;
  sourceUrl?: string;
  site?: string;
  postId?: string | number;
}

export function collectHistoryCoverUrls(entries: CoverHistoryUrlEntry[]): Set<string> {
  const urls = new Set<string>();
  for (const entry of entries || []) {
    const identity = coverDedupIdentity(entry.imageUrl || "");
    if (identity) urls.add(identity);
    const source = coverDedupIdentity(entry.sourceUrl || "");
    if (source) urls.add(source);
    const key = booruPostDedupKey(entry.site, entry.postId);
    if (key) urls.add(key);
  }
  return urls;
}

export function collectCacheIndexCoverUrls(entries: CoverCacheIndexEntry[]): Set<string> {
  return collectHistoryCoverUrls((entries || []).map((entry) => ({
    imageUrl: entry.path,
    sourceUrl: entry.sourceUrl,
    site: entry.site,
    postId: entry.postId,
  })));
}

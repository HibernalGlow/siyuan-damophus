import { sql } from "@/api";

const SOURCE_ATTRIBUTE = "custom-damophus-cover-source-url";
const TITLE_IMAGE_ATTRIBUTES = new Set(["title-img", "custom-title-img"]);

export interface CoverAttributeRow {
  name?: string;
  value?: string;
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
  if (!/^https?:\/\//i.test(source)) return null;
  try {
    const parsed = new URL(source);
    parsed.hash = "";
    return parsed.href;
  } catch {
    return source.replace(/#.*$/, "");
  }
}

export function collectUsedCoverUrls(rows: CoverAttributeRow[]): Set<string> {
  const urls = new Set<string>();
  for (const row of rows || []) {
    if (row.name !== SOURCE_ATTRIBUTE && !TITLE_IMAGE_ATTRIBUTES.has(row.name || "")) continue;
    const normalized = normalizeCoverUrl(row.value || "");
    if (normalized) urls.add(normalized);
  }
  return urls;
}

export async function loadUsedCoverUrls(): Promise<Set<string>> {
  const rows = await sql(
    "SELECT name, value FROM attributes WHERE name IN ('custom-damophus-cover-source-url', 'title-img', 'custom-title-img')",
  );
  return collectUsedCoverUrls(rows as CoverAttributeRow[]);
}

export interface CoverHistoryUrlEntry {
  imageUrl?: string;
}

export function collectHistoryCoverUrls(entries: CoverHistoryUrlEntry[]): Set<string> {
  const urls = new Set<string>();
  for (const entry of entries || []) {
    const normalized = normalizeCoverUrl(entry.imageUrl || "");
    if (normalized) urls.add(normalized);
  }
  return urls;
}

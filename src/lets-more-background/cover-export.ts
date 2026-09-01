import { getHPathByID, sql } from "@/api";
import { getLogger } from "@/libs/logger";
import { getCoverHistory, getSeenCovers, type SeenCoverEntry } from "./cover-history";
import type { CoverHistoryEntry } from "./sources";

const log = getLogger("lets-more-background:export");

export const COVER_EXPORT_SCHEMA_VERSION = 1;

export interface CoverExportAttributeRow {
  block_id?: string;
  name?: string;
  value?: string;
}

export interface CurrentCoverExportEntry {
  blockId: string;
  path?: string;
  titleImg?: string;
  sourceUrl?: string;
  postUrl?: string;
  site?: string;
  postId?: string;
  tags?: string[];
  score?: string;
  dimensions?: string;
  cachePath?: string;
}

export interface CoverExportPayload {
  schemaVersion: number;
  exportedAt: string;
  history: CoverHistoryEntry[];
  seen: SeenCoverEntry[];
  current: CurrentCoverExportEntry[];
}

const CURRENT_COVER_ATTRIBUTE_NAMES = [
  "title-img",
  "custom-title-img",
  "custom-damophus-cover-source-url",
  "custom-damophus-cover-cache-path",
  "custom-damophus-post-site",
  "custom-damophus-post-id",
  "custom-damophus-post-url",
  "custom-damophus-post-tags",
  "custom-damophus-post-score",
  "custom-damophus-post-dimensions",
] as const;

export function groupCurrentCoverRows(rows: CoverExportAttributeRow[]): CurrentCoverExportEntry[] {
  const attrsByBlock = new Map<string, Record<string, string>>();
  for (const row of rows || []) {
    if (!row.block_id || !row.name) continue;
    const attrs = attrsByBlock.get(row.block_id) || {};
    if (attrs[row.name] === undefined) attrs[row.name] = row.value || "";
    attrsByBlock.set(row.block_id, attrs);
  }

  const entries: CurrentCoverExportEntry[] = [];
  for (const [blockId, attrs] of attrsByBlock) {
    if (!attrs["title-img"] && !attrs["custom-title-img"]) continue;
    const rawTags = attrs["custom-damophus-post-tags"] || "";
    entries.push({
      blockId,
      titleImg: attrs["title-img"] || attrs["custom-title-img"] || undefined,
      sourceUrl: attrs["custom-damophus-cover-source-url"] || undefined,
      postUrl: attrs["custom-damophus-post-url"] || undefined,
      site: attrs["custom-damophus-post-site"] || undefined,
      postId: attrs["custom-damophus-post-id"] || undefined,
      tags: rawTags ? rawTags.split(/\s+/).filter(Boolean) : undefined,
      score: attrs["custom-damophus-post-score"] || undefined,
      dimensions: attrs["custom-damophus-post-dimensions"] || undefined,
      cachePath: attrs["custom-damophus-cover-cache-path"] || undefined,
    });
  }

  return entries.sort((a, b) => a.blockId.localeCompare(b.blockId));
}

export async function loadCurrentCoverRows(): Promise<CoverExportAttributeRow[]> {
  const names = CURRENT_COVER_ATTRIBUTE_NAMES.map((name) => `'${name}'`).join(",");
  const rows = await sql(
    `SELECT block_id, name, value FROM attributes WHERE name IN (${names})`,
  );
  return rows as CoverExportAttributeRow[];
}

export async function buildCoverExportPayload(): Promise<CoverExportPayload> {
  const rows = await loadCurrentCoverRows();
  const current = groupCurrentCoverRows(rows);

  await Promise.all(current.map(async (entry) => {
    try {
      entry.path = await getHPathByID(entry.blockId);
    } catch (error) {
      log.debug("Failed to resolve document path for exported cover:", entry.blockId, error);
    }
  }));

  return {
    schemaVersion: COVER_EXPORT_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    history: getCoverHistory(),
    seen: getSeenCovers(),
    current,
  };
}

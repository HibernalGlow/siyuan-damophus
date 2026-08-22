import { getPathByID, listDocTree, sql } from "@/api";
import type { IResDocTreeItem } from "@/api";

export interface LegacyCoverMaintenanceResult {
  scanned: number;
  cached: number;
  skipped: number;
  failed: number;
}

export interface LocalCoverMaintenanceAdapter {
  getAttrs(blockId: string): Promise<Record<string, string>>;
  cacheRemoteCover(blockId: string, sourceUrl: string, attrs: Record<string, string>): Promise<string | null>;
  setAttrs(blockId: string, attrs: Record<string, string>): Promise<void>;
}

function flattenDocumentTree(nodes: IResDocTreeItem[], output: string[]): void {
  for (const node of nodes) {
    output.push(node.id);
    if (node.children?.length) flattenDocumentTree(node.children, output);
  }
}

export async function getDocumentTreeIds(rootId: string): Promise<string[]> {
  const { notebook, path } = await getPathByID(rootId);
  const tree = await listDocTree(notebook, path.replace(/^\/+/, ""));
  const descendants: string[] = [];
  flattenDocumentTree(tree, descendants);
  const documentId = path.replace(/\\/g, "/").split("/").pop()?.replace(/\.sy$/i, "") || rootId;
  return [...new Set([documentId, ...descendants])];
}

export function extractBlockIdFromDocumentLink(value: string): string | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/(?:block\/|id=|siyuan:\/\/blocks\/)([0-9]{14}-[a-z0-9]{7})/i) || text.match(/\b[0-9]{14}-[a-z0-9]{7}\b/i);
  return match?.[1] || null;
}

export function extractRemoteTitleImage(attrs: Record<string, string>): string | null {
  const explicit = attrs["custom-damophus-cover-source-url"]?.trim();
  if (explicit && /^https?:\/\//i.test(explicit)) return explicit;
  const titleImg = (attrs["title-img"] || attrs["custom-title-img"] || "")
    .replace(/&quot;/g, '"')
    .replace(/&#34;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
  const match = titleImg.match(/url\((?:"([^"]+)"|'([^']+)'|([^)]*))\)/i);
  const source = (match?.[1] || match?.[2] || match?.[3] || "").trim();
  const direct = match ? source : titleImg.trim();
  return /^https?:\/\//i.test(direct) ? direct : null;
}

export async function maintainDocumentTree(
  rootId: string,
  adapter: LocalCoverMaintenanceAdapter,
): Promise<LegacyCoverMaintenanceResult> {
  const ids = await getDocumentTreeIds(rootId);
  const result: LegacyCoverMaintenanceResult = { scanned: 0, cached: 0, skipped: 0, failed: 0 };
  for (const id of ids) {
    result.scanned += 1;
    try {
      const attrs = await adapter.getAttrs(id);
      const sourceUrl = extractRemoteTitleImage(attrs);
      if (!sourceUrl) {
        result.skipped += 1;
        continue;
      }
      const cachePath = await adapter.cacheRemoteCover(id, sourceUrl, attrs);
      if (!cachePath) {
        result.failed += 1;
        continue;
      }
      await adapter.setAttrs(id, {
        "custom-damophus-cover-source-url": sourceUrl,
        "custom-damophus-cover-cache-path": cachePath,
      });
      result.cached += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

interface CacheIndexEntry {
  path: string;
  [key: string]: unknown;
}

async function readText(path: string): Promise<string> {
  const response = await fetch("/api/file/getFile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok || response.status === 202) return "";
  return response.text();
}

async function writeText(path: string, content: string): Promise<void> {
  const form = new FormData();
  form.append("path", path);
  form.append("isDir", "false");
  form.append("file", new Blob([content], { type: "application/json;charset=utf-8" }), path.split("/").pop() || "index.json");
  await fetch("/api/file/putFile", { method: "POST", body: form });
}

export async function cleanupLocalCoverCache(cacheRoot: string): Promise<{ removed: number; kept: number }> {
  const root = `/data/${String(cacheRoot || "storage/petal/siyuan-damophus/more-background/covers")
    .replace(/\\/g, "/").replace(/^\/?data\//i, "").replace(/^\/+|\/+$/g, "")}`;
  const indexPath = `${root}/index.json`;
  let entries: CacheIndexEntry[] = [];
  try {
    const parsed = JSON.parse(await readText(indexPath));
    if (Array.isArray(parsed)) entries = parsed as CacheIndexEntry[];
  } catch {
    return { removed: 0, kept: 0 };
  }
  const rows = await sql("SELECT value FROM attributes WHERE name = 'custom-damophus-cover-cache-path'");
  const referenced = new Set((rows || []).map((row: { value?: string }) => row.value).filter(Boolean));
  let removed = 0;
  const kept: CacheIndexEntry[] = [];
  for (const entry of entries) {
    if (referenced.has(entry.path)) {
      kept.push(entry);
      continue;
    }
    try {
      await fetch("/api/file/removeFile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: entry.path }),
      });
      removed += 1;
    } catch {
      kept.push(entry);
    }
  }
  await writeText(indexPath, `${JSON.stringify(kept, null, 2)}\n`);
  return { removed, kept: kept.length };
}

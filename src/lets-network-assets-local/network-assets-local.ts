import {
  batchSetBlockAttrsStrict,
  convertNetworkAssetsToLocalStrict,
  getBlockAttrsStrict,
  getBlockKramdownStrict,
  statAssetStrict,
  updateBlockStrict,
  sqlStrict,
} from "@/api";
import { loadAssetLinkMap, saveAssetLinkMap } from "./asset-link-store";

export interface DocumentRow {
  id: string;
  box: string;
  hpath: string;
}

export interface NetworkAssetConversionResult {
  documents: number;
  /** Resources written to a brand-new local file during this run. */
  downloaded: number;
  /** Resources resolved to a local file that a previous conversion had already stored. */
  reused: number;
}

export interface ExcludedRuleItem {
  pattern: string;
  description?: string;
  enabled: boolean;
}

export const DEFAULT_EXCLUDED_RULES: ExcludedRuleItem[] = [
  {
    pattern: "inkloomer\\.github\\.io/inkloom",
    description: "InkLoom 动图与文档资源",
    enabled: true,
  },
  {
    pattern: "github\\.com/[^/]+/[^/]+/(?:issues|pull)",
    description: "GitHub Issues 与 Pull Requests",
    enabled: true,
  },
];

export interface NetworkAssetConversionOptions {
  skippedUrls?: ReadonlySet<string>;
  excludedPattern?: string | ExcludedRuleItem[];
  blockTypes?: ReadonlySet<string>;
  /** Reuse the same local file for identical network URLs across all documents (default true). */
  globalDedup?: boolean;
  /** Record the original network URL of every converted resource in the containing block's attributes (default true). */
  preserveSourceUrls?: boolean;
}

export const DEFAULT_NETWORK_ASSET_BLOCK_TYPES = [
  "NodeParagraph", "NodeHeading", "NodeList", "NodeListItem", "NodeBlockquote", "NodeTable",
];

const SIYUAN_SQL_BLOCK_TYPES: Record<string, string> = {
  d: "NodeDocument",
  s: "NodeSuperBlock",
  b: "NodeBlockquote",
  l: "NodeList",
  i: "NodeListItem",
  h: "NodeHeading",
  p: "NodeParagraph",
  m: "NodeMathBlock",
  t: "NodeTable",
  c: "NodeCodeBlock",
  html: "NodeHTMLBlock",
  query_embed: "NodeBlockQueryEmbed",
  tb: "NodeThematicBreak",
  audio: "NodeAudio",
  video: "NodeVideo",
  iframe: "NodeIFrame",
  widget: "NodeWidget",
};

export interface NetworkAssetPreviewDocument extends DocumentRow {
  urls: string[];
}

function sqlQuote(value: string): string {
  return `'${value.split("'").join("''")}'`;
}

export function isRemoteResourceUrl(value: string | null | undefined): boolean {
  return /^(?:https?:)?\/\/|^file:\/\//iu.test(value?.trim() ?? "");
}

/** The block menu is synchronous, so inspect rendered resource elements. */
export function hasRemoteResource(blocks: readonly HTMLElement[]): boolean {
  return blocks.some((block) => Array.from(block.querySelectorAll<HTMLElement>(
    "img[src], audio[src], video[src], source[src], a[data-type=file][href]",
  )).some((element) => isRemoteResourceUrl(element.getAttribute("src") ?? element.getAttribute("href"))));
}

export function remoteResourceUrls(markdown: string): string[] {
  const urls = new Set<string>();
  const add = (value: string | undefined) => {
    const url = value?.trim();
    if (url && isRemoteResourceUrl(url)) urls.add(url);
  };
  for (const match of markdown.matchAll(/!?(?:\[[^\]]*\])\(([^\s)]+)(?:\s+[^)]*)?\)/gu)) add(match[1]);
  for (const match of markdown.matchAll(/(?:src|href)=["']([^"']+)["']/giu)) add(match[1]);
  return [...urls];
}

export async function resolveDocumentTree(documentId: string, includeChildren: boolean): Promise<DocumentRow[]> {
  const rows = await sqlStrict<DocumentRow[]>(
    `SELECT id, box, hpath FROM blocks WHERE type = 'd' AND id = ${sqlQuote(documentId)} LIMIT 1`,
  );
  const document = rows[0];
  if (!document) throw new Error(`Document not found: ${documentId}`);
  if (!includeChildren) return [document];

  const prefix = `${document.hpath.replace(/\/+$/u, "")}/%`;
  return sqlStrict<DocumentRow[]>(
    `SELECT id, box, hpath FROM blocks WHERE type = 'd' AND box = ${sqlQuote(document.box)} `
      + `AND (hpath = ${sqlQuote(document.hpath)} OR hpath LIKE ${sqlQuote(prefix)}) ORDER BY hpath, id`,
  );
}

export async function convertDocumentTreeNetworkAssets(
  documentId: string,
  onProgress?: (completed: number, total: number) => void,
  options: NetworkAssetConversionOptions = {},
): Promise<NetworkAssetConversionResult> {
  const documents = await resolveDocumentTree(documentId, true);
  const store = options.globalDedup === false ? undefined : await AssetLinkStore.load();
  let downloaded = 0;
  let reused = 0;
  for (let index = 0; index < documents.length; index += 1) {
    onProgress?.(index, documents.length);
    const result = await convertDocumentNetworkAssets(documents[index].id, options, store);
    downloaded += result.downloaded;
    reused += result.reused;
  }
  await store?.flush();
  onProgress?.(documents.length, documents.length);
  return { documents: documents.length, downloaded, reused };
}

/** Converts one document (e.g. from a block context menu) with the same deduplication pipeline. */
export async function convertSingleDocumentNetworkAssets(
  documentId: string,
  options: NetworkAssetConversionOptions = {},
): Promise<NetworkAssetConversionResult> {
  const store = options.globalDedup === false ? undefined : await AssetLinkStore.load();
  const result = await convertDocumentNetworkAssets(documentId, options, store);
  await store?.flush();
  return { documents: 1, downloaded: result.downloaded, reused: result.reused };
}

export async function resolveConvertibleBlocks(
  documentId: string,
  blockTypes: ReadonlySet<string> = new Set(DEFAULT_NETWORK_ASSET_BLOCK_TYPES),
): Promise<Array<{ id: string; type: string }>> {
  const rows = await sqlStrict<Array<{ id: string; type: string }>>(
    `SELECT id, type FROM blocks WHERE root_id = ${sqlQuote(documentId)} ORDER BY id`,
  ) ?? [];
  return rows.filter((row) => blockTypes.has(SIYUAN_SQL_BLOCK_TYPES[row.type] ?? row.type));
}

export function normalizeExcludedRules(input: unknown): ExcludedRuleItem[] {
  if (Array.isArray(input)) {
    return input.map((item) => {
      if (typeof item === "string") {
        return { pattern: item, description: "", enabled: true };
      }
      return {
        pattern: String(item?.pattern ?? ""),
        description: typeof item?.description === "string" ? item.description : "",
        enabled: item?.enabled !== false,
      };
    }).filter((item) => item.pattern.trim().length > 0 || (item.description?.trim().length ?? 0) > 0);
  }
  if (typeof input === "string" && input.trim()) {
    try {
      const parsed = JSON.parse(input);
      if (Array.isArray(parsed)) return normalizeExcludedRules(parsed);
    } catch {
      // Not JSON, parse text lines
    }
    return input
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const isComment = line.startsWith("#") || line.startsWith("//");
        const cleanPattern = isComment ? line.replace(/^(?:#|\/\/)\s*/, "") : line;
        return {
          pattern: cleanPattern,
          description: "",
          enabled: !isComment,
        };
      });
  }
  return [];
}

export function parseExcludedRules(raw: string | ExcludedRuleItem[] | undefined): string[] {
  return normalizeExcludedRules(raw)
    .filter((rule) => rule.enabled && rule.pattern.trim().length > 0)
    .map((rule) => rule.pattern.trim());
}

export function compileExcludedPatterns(raw: string | ExcludedRuleItem[] | undefined): RegExp[] {
  const rules = normalizeExcludedRules(raw);
  const patterns: RegExp[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !rule.pattern?.trim()) continue;
    try {
      patterns.push(new RegExp(rule.pattern.trim(), "iu"));
    } catch {
      // invalid patterns are ignored by the caller
    }
  }
  return patterns;
}

export function isUrlExcludedByPatterns(url: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(url));
}

function excludedUrls(urls: readonly string[], options: NetworkAssetConversionOptions): Set<string> {
  const patterns = compileExcludedPatterns(options.excludedPattern);
  return new Set(urls.filter((url) => options.skippedUrls?.has(url) || isUrlExcludedByPatterns(url, patterns)));
}

/** Replacement targets are applied longest-first so a URL that is a prefix of another cannot corrupt it. */
export function replaceAllOrdered(text: string, replacements: Iterable<readonly [string, string]>): string {
  const ordered = [...replacements].sort((a, b) => b[0].length - a[0].length);
  for (const [from, to] of ordered) text = text.split(from).join(to);
  return text;
}

export function extractNetworkAssetPaths(kramdown: string): string[] {
  return [...kramdown.matchAll(/assets\/network-asset-[^\s)"'<>\\]+/giu)]
    .map((match) => match[0].replace(/[.,;:!?]+$/u, ""))
    .filter((path, index, all) => all.indexOf(path) === index);
}

/**
 * Pairs the URLs the kernel converter was expected to download with the local files it wrote.
 * Both lists follow document order: the kernel walks the tree top-down, so the i-th freshly
 * written "network-asset" file belongs to the i-th URL that is no longer present. URLs that
 * failed to download stay in the text and are excluded automatically.
 */
export function attributeConvertedAssets(
  pendingUrls: readonly string[],
  beforeKramdown: string,
  afterKramdown: string,
): Array<[string, string]> {
  const succeeded = pendingUrls.filter((url) => !afterKramdown.includes(url));
  const knownPaths = new Set(extractNetworkAssetPaths(beforeKramdown));
  const freshPaths = extractNetworkAssetPaths(afterKramdown).filter((path) => !knownPaths.has(path));
  const pairs: Array<[string, string]> = [];
  const count = Math.min(succeeded.length, freshPaths.length);
  for (let index = 0; index < count; index += 1) pairs.push([succeeded[index], freshPaths[index]]);
  return pairs;
}

/** Custom block attribute storing { localAssetPath: originalNetworkUrl } for converted resources. */
export const SOURCE_URL_ATTR_KEY = "custom-damophus-remote-asset-urls";

const SOURCE_ATTR_BLOCK_TYPES = "('p', 'h', 't', 'c', 'html', 'audio', 'video', 'iframe', 'widget')";

export function parseSourceUrlAttr(raw: unknown): Record<string, string> {
  if (typeof raw !== "string" || raw.length === 0) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    const entries: Record<string, string> = {};
    for (const [path, url] of Object.entries(parsed as Record<string, unknown>)) {
      if (path.startsWith("assets/") && typeof url === "string") entries[path] = url;
    }
    return entries;
  } catch {
    return {};
  }
}

/**
 * Inline images have no block of their own, so the original network URL is recorded on the
 * nearest enclosing block (paragraph, heading, table, ...) as a custom attribute.
 */
export async function recordSourceUrlAttrs(
  documentId: string,
  mappings: readonly (readonly [string, string])[],
): Promise<void> {
  if (mappings.length === 0) return;
  const rows = await sqlStrict<Array<{ id: string; markdown: string }>>(
    `SELECT id, markdown FROM blocks WHERE root_id = ${sqlQuote(documentId)} AND type IN ${SOURCE_ATTR_BLOCK_TYPES}`,
  ) ?? [];
  const byBlock = new Map<string, Record<string, string>>();
  for (const [url, localPath] of mappings) {
    for (const row of rows) {
      if (typeof row.markdown === "string" && row.markdown.includes(localPath)) {
        const entry = byBlock.get(row.id) ?? {};
        entry[localPath] = url;
        byBlock.set(row.id, entry);
      }
    }
  }
  const blockAttrs: Array<{ id: string; attrs: Record<string, string> }> = [];
  for (const [blockId, entry] of byBlock) {
    let attrs: Record<string, string> | undefined;
    try {
      attrs = await getBlockAttrsStrict(blockId);
    } catch {
      continue; // block may have vanished mid-run
    }
    blockAttrs.push({
      id: blockId,
      attrs: { [SOURCE_URL_ATTR_KEY]: JSON.stringify({ ...parseSourceUrlAttr(attrs?.[SOURCE_URL_ATTR_KEY]), ...entry }) },
    });
  }
  if (blockAttrs.length > 0) await batchSetBlockAttrsStrict(blockAttrs);
}

export async function resolveRootBlockId(blockId: string): Promise<string> {
  const rows = await sqlStrict<Array<{ root_id: string }>>(
    `SELECT root_id FROM blocks WHERE id = ${sqlQuote(blockId)} LIMIT 1`,
  );
  return rows[0]?.root_id || blockId;
}

/** Maps network resource URLs to the local asset files previous conversions stored for them. */
export class AssetLinkStore {
  private readonly links = new Map<string, string>();
  private readonly existence = new Map<string, boolean>();
  private dirty = false;

  static async load(): Promise<AssetLinkStore> {
    const store = new AssetLinkStore();
    const map = await loadAssetLinkMap();
    for (const [url, path] of Object.entries(map.links)) store.links.set(url, path);
    return store;
  }

  get size(): number {
    return this.links.size;
  }

  /** Returns the local file for a URL, but only while that file still exists in the workspace. */
  async resolveExisting(url: string): Promise<string | undefined> {
    const known = this.links.get(url);
    if (!known) return undefined;
    let exists = this.existence.get(known);
    if (exists === undefined) {
      exists = await statAssetStrict(known);
      this.existence.set(known, exists);
    }
    if (!exists) {
      this.links.delete(url);
      this.dirty = true;
      return undefined;
    }
    return known;
  }

  set(url: string, path: string): void {
    if (this.links.get(url) === path) return;
    this.links.set(url, path);
    this.dirty = true;
  }

  isDirty(): boolean {
    return this.dirty;
  }

  async flush(): Promise<void> {
    if (!this.dirty) return;
    await saveAssetLinkMap({ version: 1, links: Object.fromEntries(this.links) });
    this.dirty = false;
  }
}

async function convertDocumentNetworkAssets(
  documentId: string,
  options: NetworkAssetConversionOptions,
  sharedStore?: AssetLinkStore,
): Promise<{ downloaded: number; reused: number }> {
  const current = await getBlockKramdownStrict(documentId);
  const source = current.kramdown ?? "";
  const allUrls = remoteResourceUrls(source);
  if (allUrls.length === 0) return { downloaded: 0, reused: 0 };

  const excluded = excludedUrls(allUrls, options);
  const store = options.globalDedup === false ? undefined : sharedStore ?? await AssetLinkStore.load();

  // Resources whose file a previous conversion already stored: point them at the existing file
  // so the kernel has nothing left to download. URLs nested inside an excluded URL are skipped
  // because the exclusion rewrite would run after them and mangle the result.
  const reusedPairs: Array<[string, string]> = [];
  if (store) {
    for (const url of allUrls) {
      if (excluded.has(url)) continue;
      if ([...excluded].some((other) => other !== url && other.includes(url))) continue;
      const localPath = await store.resolveExisting(url);
      if (localPath) reusedPairs.push([url, localPath]);
    }
  }
  const pendingUrls = allUrls.filter(
    (url) => !excluded.has(url) && !reusedPairs.some(([reusedUrl]) => reusedUrl === url),
  );
  if (pendingUrls.length === 0 && reusedPairs.length === 0) return { downloaded: 0, reused: 0 };

  // Mask excluded URLs before writing so the kernel converter cannot touch them.
  const placeholders = new Map<string, string>();
  [...excluded].forEach((url, index) => {
    placeholders.set(`damophus-skip-network-resource-${index}-${documentId}`, url);
  });
  let working = source;
  if (pendingUrls.length > 0 && placeholders.size > 0) {
    working = replaceAllOrdered(working, [...placeholders].map(([placeholder, url]) => [url, placeholder] as const));
  }
  if (reusedPairs.length > 0) working = replaceAllOrdered(working, reusedPairs);
  if (working !== source) await updateBlockStrict("markdown", working, documentId);

  let converted = working;
  if (pendingUrls.length > 0) {
    try {
      await convertNetworkAssetsToLocalStrict(documentId);
      converted = (await getBlockKramdownStrict(documentId)).kramdown ?? "";
      for (const [placeholder, url] of placeholders) converted = converted.split(placeholder).join(url);
      if (converted !== working) await updateBlockStrict("markdown", converted, documentId);
    } catch (error) {
      if (working !== source) await updateBlockStrict("markdown", source, documentId);
      throw error;
    }
  }

  const newPairs = attributeConvertedAssets(pendingUrls, working, converted);
  if (store) for (const [url, localPath] of newPairs) store.set(url, localPath);

  if (options.preserveSourceUrls !== false) {
    await recordSourceUrlAttrs(documentId, [...reusedPairs, ...newPairs]);
  }
  return { downloaded: newPairs.length, reused: reusedPairs.length };
}

export async function previewDocumentTreeNetworkAssets(
  documentId: string,
  blockTypes: ReadonlySet<string> = new Set(DEFAULT_NETWORK_ASSET_BLOCK_TYPES),
): Promise<NetworkAssetPreviewDocument[]> {
  const documents = await resolveDocumentTree(documentId, true);
  return Promise.all(documents.map(async (document) => {
    const blocks = await resolveConvertibleBlocks(document.id, blockTypes);
    const markdown = await Promise.all(blocks.map(async (block) => (await getBlockKramdownStrict(block.id)).kramdown ?? ""));
    return { ...document, urls: [...new Set(markdown.flatMap(remoteResourceUrls))] };
  }));
}

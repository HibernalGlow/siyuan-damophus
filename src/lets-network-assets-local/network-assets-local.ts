import {
  convertNetworkAssetsToLocalStrict,
  getBlockKramdownStrict,
  updateBlockStrict,
  sqlStrict,
} from "@/api";

export interface DocumentRow {
  id: string;
  box: string;
  hpath: string;
}

export interface NetworkAssetConversionResult {
  documents: number;
}

export interface NetworkAssetConversionOptions {
  skippedUrls?: ReadonlySet<string>;
  excludedPattern?: string;
  blockTypes?: ReadonlySet<string>;
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
  for (let index = 0; index < documents.length; index += 1) {
    onProgress?.(index, documents.length);
    await convertDocumentNetworkAssets(documents[index].id, options);
  }
  onProgress?.(documents.length, documents.length);
  return { documents: documents.length };
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

export function parseExcludedRules(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("//"));
}

export function compileExcludedPatterns(raw: string | undefined): RegExp[] {
  const rules = parseExcludedRules(raw);
  const patterns: RegExp[] = [];
  for (const rule of rules) {
    try {
      patterns.push(new RegExp(rule, "iu"));
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

async function convertDocumentNetworkAssets(documentId: string, options: NetworkAssetConversionOptions): Promise<void> {
  const current = await getBlockKramdownStrict(documentId);
  const source = current.kramdown ?? "";
  const excluded = excludedUrls(remoteResourceUrls(source), options);
  if (excluded.size === 0) {
    await convertNetworkAssetsToLocalStrict(documentId);
    return;
  }

  const replacements = new Map<string, string>();
  let masked = source;
  excluded.forEach((url, index) => {
    const placeholder = `damophus-skip-network-resource-${index}-${documentId}`;
    replacements.set(placeholder, url);
    masked = masked.split(url).join(placeholder);
  });
  if (masked === source) return;

  await updateBlockStrict("markdown", masked, documentId);
  try {
    await convertNetworkAssetsToLocalStrict(documentId);
    let converted = (await getBlockKramdownStrict(documentId)).kramdown ?? "";
    for (const [placeholder, url] of replacements) converted = converted.split(placeholder).join(url);
    await updateBlockStrict("markdown", converted, documentId);
  } catch (error) {
    await updateBlockStrict("markdown", source, documentId);
    throw error;
  }
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

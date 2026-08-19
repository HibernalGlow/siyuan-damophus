import { convertNetworkAssetsToLocalStrict, sqlStrict } from "@/api";

export interface DocumentRow {
  id: string;
  box: string;
  hpath: string;
}

export interface NetworkAssetConversionResult {
  documents: number;
}

function sqlQuote(value: string): string {
  return `'${value.split("'").join("''")}'`;
}

export function isRemoteResourceUrl(value: string | null | undefined): boolean {
  return /^(?:https?:)?\/\//iu.test(value?.trim() ?? "");
}

/** The block menu is synchronous, so inspect rendered resource elements. */
export function hasRemoteResource(blocks: readonly HTMLElement[]): boolean {
  return blocks.some((block) => Array.from(block.querySelectorAll<HTMLElement>(
    "img[src], audio[src], video[src], source[src], a[data-type=file][href]",
  )).some((element) => isRemoteResourceUrl(element.getAttribute("src") ?? element.getAttribute("href"))));
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
): Promise<NetworkAssetConversionResult> {
  const documents = await resolveDocumentTree(documentId, true);
  for (let index = 0; index < documents.length; index += 1) {
    onProgress?.(index, documents.length);
    await convertNetworkAssetsToLocalStrict(documents[index].id);
  }
  onProgress?.(documents.length, documents.length);
  return { documents: documents.length };
}

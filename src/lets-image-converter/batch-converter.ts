import {
  getBlockKramdownStrict,
  createWorkspaceSnapshot,
  lsNotebooks,
  removeFileStrict,
  removeUnusedAssetStrict,
  sqlStrict,
  updateBlockStrict,
  uploadAssetsStrict,
} from "@/api";
import {
  clampQuality,
  convertImageFileDetailed,
  isImageAssetPath,
  parseImageFormat,
  type ImageConversionOptions,
} from "./image-converter";

export type BatchScope = "document" | "notebook";

export interface BatchProgress {
  phase: "snapshot" | "scan" | "convert" | "references" | "verify" | "cleanup" | "done";
  completed: number;
  total: number;
  message: string;
}

export interface BatchConversionOptions {
  targetId: string;
  scope: BatchScope;
  includeChildren: boolean;
  skipAnimated: boolean;
  conversion: ImageConversionOptions;
  onProgress?: (progress: BatchProgress) => void;
}

export interface BatchConversionResult {
  documents: number;
  assets: number;
  converted: number;
  skippedAnimated: number;
  skippedUnsupported: number;
  retainedOriginals: number;
  removedOriginals: number;
  verified: boolean;
}

interface DocumentRow {
  id: string;
  box: string;
  hpath: string;
}

interface AssetRow {
  block_id: string;
  root_id: string;
  path: string;
}

interface ReferenceBackup {
  id: string;
  kramdown: string;
}

interface ConvertedAsset {
  oldPath: string;
  newPath: string;
  blockIds: string[];
}

const mimeByExtension: Record<string, string> = {
  avif: "image/avif",
  bmp: "image/bmp",
  gif: "image/gif",
  jpeg: "image/jpeg",
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

function sqlQuote(value: string): string {
  return `'${value.split("'").join("''")}'`;
}

function report(
  options: BatchConversionOptions,
  phase: BatchProgress["phase"],
  completed: number,
  total: number,
  message: string,
): void {
  options.onProgress?.({phase, completed, total, message});
}

async function resolveDocuments(options: BatchConversionOptions): Promise<DocumentRow[]> {
  const targetId = options.targetId.trim();
  if (!targetId) throw new Error("A document or notebook ID is required");
  const notebooks = await lsNotebooks();
  const notebook = notebooks?.notebooks?.find((item) => item.id === targetId);
  if (notebook) {
    if (options.scope !== "notebook") throw new Error("A notebook ID requires notebook scope");
    return sqlStrict<DocumentRow[]>(
      `SELECT id, box, hpath FROM blocks WHERE type = 'd' AND box = ${sqlQuote(targetId)} ORDER BY hpath, id`,
    );
  }

  const target = await sqlStrict<DocumentRow[]>(
    `SELECT id, box, hpath FROM blocks WHERE type = 'd' AND id = ${sqlQuote(targetId)} LIMIT 1`,
  );
  const document = target[0];
  if (!document) throw new Error(`Document or notebook not found: ${targetId}`);
  if (options.scope !== "document") throw new Error("A document ID requires document scope");
  if (!options.includeChildren) return [document];

  const prefix = `${document.hpath.replace(/\/+$/u, "")}/%`;
  return sqlStrict<DocumentRow[]>(
    `SELECT id, box, hpath FROM blocks WHERE type = 'd' AND box = ${sqlQuote(document.box)} `
      + `AND (hpath = ${sqlQuote(document.hpath)} OR hpath LIKE ${sqlQuote(prefix)}) ORDER BY hpath, id`,
  );
}

async function fetchAsset(path: string): Promise<File> {
  const cleanPath = path.split(/[?#]/u, 1)[0].replace(/^\/+/, "");
  const candidates = [`/${cleanPath}`, `/assets/${cleanPath.split("/").pop() ?? cleanPath}`];
  for (const candidate of candidates) {
    const response = await fetch(candidate);
    if (!response.ok) continue;
    const bytes = await response.arrayBuffer();
    const name = cleanPath.split("/").pop() ?? "asset";
    const extension = name.split(".").pop()?.toLowerCase() ?? "";
    return new File([bytes], name, {type: mimeByExtension[extension] ?? response.headers.get("content-type") ?? "application/octet-stream"});
  }
  throw new Error(`Unable to read asset: ${path}`);
}

export function replaceAssetReferences(source: string, oldPath: string, newPath: string): string {
  const escaped = oldPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  const boundary = `(?=[?#)\\]}>"'\\s]|$)`;
  const raw = new RegExp(`${escaped}${boundary}`, "gu");
  let result = source.replace(raw, `${newPath}`);
  const encodedOldPath = encodeURI(oldPath);
  if (encodedOldPath !== oldPath) {
    result = result.replace(new RegExp(`${encodedOldPath.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&")}${boundary}`, "gu"), newPath);
  }
  return result;
}

async function selectedAssetRows(documents: DocumentRow[]): Promise<AssetRow[]> {
  if (documents.length === 0) return [];
  const roots = documents.map((document) => sqlQuote(document.id)).join(", ");
  return sqlStrict<AssetRow[]>(
    `SELECT block_id, root_id, path FROM assets WHERE root_id IN (${roots}) ORDER BY root_id, block_id, path`,
  );
}

async function globalReferenceCount(path: string): Promise<number> {
  const rows = await sqlStrict<Array<{count: number | string}>>(
    `SELECT COUNT(*) AS count FROM assets WHERE path = ${sqlQuote(path)}`,
  );
  return Number(rows[0]?.count ?? 0);
}

async function rollback(backups: ReferenceBackup[]): Promise<void> {
  for (const backup of backups.reverse()) {
    await updateBlockStrict("markdown", backup.kramdown, backup.id);
  }
}

function referenceCount(rows: AssetRow[], path: string): number {
  return rows.filter((row) => row.path.split(/[?#]/u, 1)[0] === path).length;
}

async function waitForReferenceRefresh(documents: DocumentRow[], oldPaths: Set<string>): Promise<AssetRow[]> {
  let rows: AssetRow[] = [];
  for (let attempt = 0; attempt < 20; attempt += 1) {
    rows = await selectedAssetRows(documents);
    if (!rows.some((row) => oldPaths.has(row.path.split(/[?#]/u, 1)[0]))) return rows;
    await new Promise<void>((resolve) => window.setTimeout(resolve, 100));
  }
  return rows;
}

export async function resolveBatchDocuments(options: Pick<BatchConversionOptions, "targetId" | "scope" | "includeChildren">): Promise<DocumentRow[]> {
  return resolveDocuments({...options, skipAnimated: true, conversion: {format: "avifq60", quality: 60}});
}

export async function convertBatchImages(options: BatchConversionOptions): Promise<BatchConversionResult> {
  const parsed = parseImageFormat(options.conversion.format);
  const conversion = {
    ...options.conversion,
    quality: clampQuality(options.conversion.quality, parsed.presetQuality),
    skipAnimated: options.skipAnimated,
  };
  report(options, "snapshot", 0, 1, "Creating workspace snapshot");
  const snapshot = await createWorkspaceSnapshot(
    `Damophus image conversion ${options.targetId} -> ${parsed.format}q${conversion.quality}`,
  );
  if (snapshot.code !== 0) throw new Error(snapshot.msg || "Unable to create workspace snapshot");

  report(options, "scan", 0, 1, "Resolving documents");
  const documents = await resolveDocuments(options);
  const rows = await selectedAssetRows(documents);
  const assets = [...new Map(rows
    .filter((row) => isImageAssetPath(row.path))
    .map((row) => [row.path.split(/[?#]/u, 1)[0], row] as const)).values()];
  report(options, "scan", 1, 1, `Found ${assets.length} image assets in ${documents.length} documents`);

  const createdPaths: string[] = [];
  const convertedAssets: ConvertedAsset[] = [];
  const backups: ReferenceBackup[] = [];
  let skippedAnimated = 0;
  let skippedUnsupported = 0;
  try {
    for (let index = 0; index < assets.length; index += 1) {
      const asset = assets[index];
      report(options, "convert", index, assets.length, `Converting ${asset.path}`);
      const source = await fetchAsset(asset.path);
      const converted = await convertImageFileDetailed(source, conversion);
      if (converted.skipped) {
        if (converted.reason === "animated") skippedAnimated += 1;
        else skippedUnsupported += 1;
        continue;
      }
      const uploaded = await uploadAssetsStrict("assets", [converted.file]);
      const newPath = uploaded[converted.file.name];
      if (!newPath) throw new Error(`SiYuan did not return an uploaded path for ${converted.file.name}`);
      createdPaths.push(newPath);
      convertedAssets.push({
        oldPath: asset.path,
        newPath,
        blockIds: rows.filter((row) => row.path.split(/[?#]/u, 1)[0] === asset.path).map((row) => row.block_id),
      });
    }

    const replacements = new Map<string, string>();
    for (const asset of convertedAssets) replacements.set(asset.oldPath, asset.newPath);
    const blockIds = [...new Set(convertedAssets.flatMap((asset) => asset.blockIds))];
    for (let index = 0; index < blockIds.length; index += 1) {
      const id = blockIds[index];
      report(options, "references", index, blockIds.length, `Updating references in block ${id}`);
      const current = await getBlockKramdownStrict(id);
      let updated = current.kramdown;
      for (const [oldPath, newPath] of replacements) updated = replaceAssetReferences(updated, oldPath, newPath);
      if (updated === current.kramdown) continue;
      backups.push({id, kramdown: current.kramdown});
      await updateBlockStrict("markdown", updated, id);
    }

    report(options, "verify", 0, convertedAssets.length, "Verifying references");
    const refreshed = await waitForReferenceRefresh(documents, new Set(convertedAssets.map((asset) => asset.oldPath)));
    const remainingSelected = new Set(refreshed.map((row) => row.path.split(/[?#]/u, 1)[0]));
    for (const asset of convertedAssets) {
      if (remainingSelected.has(asset.oldPath)) throw new Error(`Reference verification failed: ${asset.oldPath}`);
      const beforeCount = referenceCount(rows, asset.oldPath) + referenceCount(rows, asset.newPath);
      const afterCount = referenceCount(refreshed, asset.newPath);
      if (beforeCount !== afterCount) {
        throw new Error(`Reference count changed for ${asset.oldPath}: ${beforeCount} -> ${afterCount}`);
      }
    }

    let removedOriginals = 0;
    let retainedOriginals = 0;
    for (let index = 0; index < convertedAssets.length; index += 1) {
      const asset = convertedAssets[index];
      report(options, "cleanup", index, convertedAssets.length, `Checking original ${asset.oldPath}`);
      if (await globalReferenceCount(asset.oldPath) === 0) {
        try {
          await removeUnusedAssetStrict(asset.oldPath);
          removedOriginals += 1;
        } catch {
          retainedOriginals += 1;
        }
      } else {
        retainedOriginals += 1;
      }
    }
    report(options, "done", convertedAssets.length, convertedAssets.length, "Conversion completed");
    return {
      documents: documents.length,
      assets: assets.length,
      converted: convertedAssets.length,
      skippedAnimated,
      skippedUnsupported,
      retainedOriginals,
      removedOriginals,
      verified: true,
    };
  } catch (error) {
    if (backups.length > 0) await rollback(backups);
    for (const path of createdPaths) {
      try { await removeFileStrict(`data/${path}`); } catch { /* retain recoverable output if cleanup fails */ }
    }
    throw error;
  }
}

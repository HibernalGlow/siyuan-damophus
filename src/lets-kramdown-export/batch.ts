import {
  getBlockKramdownsStrict,
  getPathByID,
  lsNotebooks,
  sqlStrict,
} from "@/api";
import { KramdownExportError, prepareKramdown } from "@/kramdown-export/siyuan";
import type { IalExportOptions } from "@hibernalglow/damophus-agent-contract";
import JSZip from "jszip";

export type BatchExportScope = "documentTreeZip" | "notebookZip";

export interface BatchDocument {
  id: string;
  title: string;
  hpath: string;
}

export interface MarkdownArchive {
  bytes: Uint8Array;
  count: number;
  filename: string;
}

interface DocumentRow {
  id: string;
  content?: string;
  hpath?: string;
}

const KRAMDOWN_CHUNK_SIZE = 128;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const output: T[][] = [];
  for (let index = 0; index < values.length; index += size) output.push(values.slice(index, index + size));
  return output;
}

function sanitizeSegment(value: string): string {
  const sanitized = value
    .replace(/[<>:"/\\|?*\u0000-\u001f]/gu, "_")
    .replace(/[. ]+$/gu, "")
    .trim();
  return sanitized || "Untitled";
}

export function archivePath(document: BatchDocument): string {
  const segments = document.hpath.split("/").filter(Boolean).map(sanitizeSegment);
  if (segments.length === 0) segments.push(sanitizeSegment(document.title || document.id));
  segments[segments.length - 1] = `${segments.at(-1)}.md`;
  return segments.join("/");
}

export function uniqueArchivePaths(documents: readonly BatchDocument[]): Map<string, string> {
  const paths = new Map<string, string>();
  const occupied = new Set<string>();
  for (const document of documents) {
    let candidate = archivePath(document);
    const collisionKey = candidate.toLocaleLowerCase();
    if (occupied.has(collisionKey)) {
      candidate = candidate.replace(/\.md$/u, ` [${document.id}].md`);
    }
    occupied.add(candidate.toLocaleLowerCase());
    paths.set(document.id, candidate);
  }
  return paths;
}

export function relativeDocumentTreePaths(
  documents: readonly BatchDocument[],
  rootDocumentId: string,
): BatchDocument[] {
  const root = documents.find((document) => document.id === rootDocumentId);
  if (!root) return [...documents];
  const rootSegments = root.hpath.split("/").filter(Boolean);
  const parentSegments = rootSegments.slice(0, -1);
  return documents.map((document) => {
    const segments = document.hpath.split("/").filter(Boolean);
    const sharesParent = parentSegments.every((segment, index) => segments[index] === segment);
    return sharesParent
      ? { ...document, hpath: `/${segments.slice(parentSegments.length).join("/")}` }
      : document;
  });
}

export async function zipMarkdownDocuments(
  documents: readonly BatchDocument[],
  kramdowns: Readonly<Record<string, string>>,
  options: IalExportOptions,
): Promise<Uint8Array> {
  const paths = uniqueArchivePaths(documents);
  const zip = new JSZip();
  for (const document of documents) {
    const kramdown = kramdowns[document.id];
    if (!kramdown) {
      throw new KramdownExportError("EXPORT_FAILED", `SiYuan returned no Kramdown for ${document.id}`);
    }
    zip.file(paths.get(document.id)!, `${prepareKramdown(kramdown, options).trimEnd()}\n`);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/gu, "''")}'`;
}

async function batchDocuments(documentId: string, scope: BatchExportScope): Promise<{
  documents: BatchDocument[];
  archiveName: string;
}> {
  const location = await getPathByID(documentId);
  const notebooks = await lsNotebooks();
  const notebookName = notebooks.notebooks.find((notebook) => notebook.id === location.notebook)?.name
    ?? location.notebook;
  const where = scope === "notebookZip"
    ? `box = ${sqlLiteral(location.notebook)}`
    : `box = ${sqlLiteral(location.notebook)} AND (path = ${sqlLiteral(location.path)} OR path LIKE ${sqlLiteral(`${location.path.replace(/\.sy$/u, "")}/%`)})`;
  const rows = await sqlStrict<DocumentRow[]>(
    `SELECT id, content, hpath FROM blocks WHERE type = 'd' AND ${where} ORDER BY path`,
  );
  return {
    documents: rows.map((row) => ({
      id: row.id,
      title: row.content?.trim() || row.id,
      hpath: row.hpath?.trim() || `/${row.content?.trim() || row.id}`,
    })),
    archiveName: notebookName,
  };
}

export async function createMarkdownArchive(
  documentId: string,
  scope: BatchExportScope,
  options: IalExportOptions,
): Promise<MarkdownArchive> {
  const target = await batchDocuments(documentId, scope);
  const documents = scope === "documentTreeZip"
    ? relativeDocumentTreePaths(target.documents, documentId)
    : target.documents;
  if (documents.length === 0) throw new KramdownExportError("TARGET_NOT_FOUND", "No documents found for ZIP export");
  const ids = documents.map((document) => document.id);
  const allKramdowns: Record<string, string> = {};
  for (const group of chunks(ids, KRAMDOWN_CHUNK_SIZE)) {
    Object.assign(allKramdowns, await getBlockKramdownsStrict(group));
  }
  const rootTitle = documents.find((document) => document.id === documentId)?.title ?? target.archiveName;
  const filename = `${sanitizeSegment(scope === "notebookZip" ? target.archiveName : rootTitle)}-Markdown.zip`;
  return {
    bytes: await zipMarkdownDocuments(documents, allKramdowns, options),
    count: documents.length,
    filename,
  };
}

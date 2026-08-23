import { getBlockKramdownsStrict, getHPathByID, getIDsByHPath } from "@/api";
import type {
  DocumentLocator,
  IalExportOptions,
} from "@hibernalglow/damophus-agent-contract";
import { containsHtmlTable, filterKramdownIal } from "./ial";
import { convertHtmlTablesToMarkdown } from "./table";

export class KramdownExportError extends Error {
  constructor(
    readonly code: "TARGET_NOT_FOUND" | "TARGET_AMBIGUOUS" | "EXPORT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "KramdownExportError";
  }
}

export function assertMarkdownTables(kramdown: string): void {
  if (containsHtmlTable(kramdown)) {
    throw new KramdownExportError(
      "EXPORT_FAILED",
      "The document contains an HTML table; Damophus only exports Markdown tables with IAL",
    );
  }
}

export function prepareKramdown(kramdown: string, options: IalExportOptions): string {
  const markdown = containsHtmlTable(kramdown) ? convertHtmlTablesToMarkdown(kramdown) : kramdown;
  assertMarkdownTables(markdown);
  return filterKramdownIal(markdown, options);
}

export async function exportBlocksKramdown(blockIds: readonly string[], options: IalExportOptions): Promise<string> {
  const uniqueIds = [...new Set(blockIds.filter(Boolean))];
  if (uniqueIds.length === 0) throw new KramdownExportError("TARGET_NOT_FOUND", "No blocks were selected for export");
  const kramdowns = await getBlockKramdownsStrict(uniqueIds);
  const parts: string[] = [];
  for (const blockId of uniqueIds) {
    const kramdown = kramdowns[blockId];
    if (!kramdown) throw new KramdownExportError("EXPORT_FAILED", `SiYuan returned no Kramdown for ${blockId}`);
    parts.push(prepareKramdown(kramdown, options).trimEnd());
  }
  return `${parts.join("\n\n")}\n`;
}

export async function resolveExportTarget(locator: DocumentLocator): Promise<{ documentId: string; targetPath: string }> {
  if ("documentId" in locator) {
    const targetPath = await getHPathByID(locator.documentId);
    if (!targetPath) throw new KramdownExportError("TARGET_NOT_FOUND", `Document not found: ${locator.documentId}`);
    return { documentId: locator.documentId, targetPath };
  }
  const ids = await getIDsByHPath(locator.notebookId, locator.path);
  if (!ids || ids.length === 0) throw new KramdownExportError("TARGET_NOT_FOUND", `Document not found: ${locator.path}`);
  if (ids.length > 1) throw new KramdownExportError("TARGET_AMBIGUOUS", `Document path is ambiguous: ${locator.path}`);
  return { documentId: ids[0], targetPath: locator.path };
}

export async function exportKramdown(
  locator: DocumentLocator,
  options: IalExportOptions,
): Promise<{ documentId: string; targetPath: string; markdown: string }> {
  const target = await resolveExportTarget(locator);
  return { ...target, markdown: await exportBlocksKramdown([target.documentId], options) };
}

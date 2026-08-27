import type { OpenDocumentTab } from "./open-document-tabs";

export const DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY = "documentPathHighlights";
export const DEFAULT_DOCUMENT_PATH_HIGHLIGHTS = ["真金题"];

export function normalizeDocumentPathHighlights(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/[\r\n,，;；]+/u)
      : [];
  return [...new Set(source
    .map((item) => String(item).trim())
    .filter(Boolean))].slice(0, 32);
}

export function documentPathMatchesHighlight(
  path: string | undefined,
  highlights: readonly string[],
): boolean {
  const normalizedPath = path?.trim().toLocaleLowerCase();
  if (!normalizedPath) return false;
  return highlights.some((highlight) => normalizedPath.includes(highlight.toLocaleLowerCase()));
}

export function openDocumentTabMatchesHighlight(
  tab: OpenDocumentTab,
  highlights: readonly string[],
): boolean {
  return documentPathMatchesHighlight(tab.path, highlights);
}

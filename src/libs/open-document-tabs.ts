export interface OpenDocumentTab {
  documentId: string;
  title: string;
  path?: string;
}

export type OpenDocumentTabLoader = () => OpenDocumentTab[] | Promise<OpenDocumentTab[]>;

export function openDocumentTabLabel(tab: OpenDocumentTab): string {
  return tab.path?.trim() || tab.title.trim() || tab.documentId;
}

export function openDocumentTabTitle(tab: OpenDocumentTab): string {
  const title = tab.title.trim();
  if (title) return title;
  const segments = tab.path?.split("/").filter(Boolean) ?? [];
  return segments.at(-1) || tab.documentId;
}

export function openDocumentTabParentPath(tab: OpenDocumentTab): string {
  const segments = tab.path?.split("/").filter(Boolean) ?? [];
  if (segments.length <= 1) return "";
  return `/${segments.slice(0, -1).join("/")}`;
}

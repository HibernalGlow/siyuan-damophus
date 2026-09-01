import { getActiveTab, getAllEditor, getAllTabs, type IProtyle } from "siyuan";
import { isMobile } from "@/utils";
import { getHPathByID } from "@/api";
import type { OpenFlashcardDocument } from "@/flashcard/open-documents";
import {
  DEFAULT_DOCUMENT_PATH_HIGHLIGHTS,
  DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY,
  normalizeDocumentPathHighlights,
} from "@/libs/document-path-highlights";
import { settings } from "@/settings";

export function currentReviewContext(protyle?: IProtyle): { documentId: string; documentName: string; notebookId?: string; notebookName?: string } | undefined {
  const mobileEditor = window.siyuan?.mobile?.popEditor ?? window.siyuan?.mobile?.editor;
  const mobileProtyle = mobileEditor?.protyle;
  const mobileDocumentId = mobileProtyle?.block?.rootID;
  const activeId = document.querySelector<HTMLElement>(
    ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
  )?.dataset.nodeId
    ?? document.querySelector<HTMLElement>(
      ".protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
  // The published `siyuan` package only ships declarations; the host injects
  // these helpers at runtime. Keep the fallback optional for tests and for
  // mobile shells where the desktop tab helpers are absent.
  const activeModel = (typeof getActiveTab === "function" ? getActiveTab()?.model : undefined) as { editor?: { protyle?: { block?: { rootID?: string } } } } | undefined;
  const editors = typeof getAllEditor === "function" ? getAllEditor() : [];
  const documentId = mobileDocumentId ?? protyle?.block?.rootID ?? activeId ?? activeModel?.editor?.protyle?.block?.rootID ?? editors[0]?.protyle.block.rootID;
  if (!documentId) return undefined;
  const documentName = document.querySelector<HTMLInputElement>(
    `.protyle-background[data-node-id="${CSS.escape(documentId)}"] + .protyle-title input`,
  )?.value || documentId;
  const notebookId = mobileDocumentId
    ? mobileProtyle?.notebookId
    : protyle?.notebookId
    ?? editors.find((editor) => editor.protyle.block.rootID === documentId)?.protyle.notebookId;
  const notebook = window.siyuan?.notebooks?.find((item) => item.id === notebookId);
  return { documentId, documentName, notebookId, notebookName: notebook?.name };
}

export async function listOpenDocuments(): Promise<OpenFlashcardDocument[]> {
  const activeContext = currentReviewContext();
  if (isMobile && activeContext?.documentId) {
    return [{
      documentId: activeContext.documentId,
      title: activeContext.documentName,
      path: await getHPathByID(activeContext.documentId).catch(() => activeContext.documentName),
      active: true,
    }];
  }
  const activeDocumentId = activeContext?.documentId;
  const seen = new Set<string>();
  const candidates = getAllTabs().flatMap((tab) => {
    const model = tab.model as unknown as { editor?: { protyle?: { block?: { rootID?: string } } } } | undefined;
    let documentId = model?.editor?.protyle?.block?.rootID;
    if (!documentId) {
      try {
        const initData = tab.headElement?.getAttribute("data-initdata");
        const parsed = initData ? JSON.parse(initData) as { instance?: string; rootId?: string; rootID?: string } : undefined;
        if (parsed?.instance === "Editor") documentId = parsed.rootId ?? parsed.rootID;
      } catch {
        // Restored tabs may contain malformed init data; skip their fallback ID.
      }
    }
    if (!documentId || !/^\d{14}-[a-z0-9]{7}$/u.test(documentId) || seen.has(documentId)) return [];
    seen.add(documentId);
    return [{ documentId, title: tab.title || documentId }];
  });
  return Promise.all(candidates.map(async ({ documentId, title }) => ({
    documentId,
    title,
    path: await getHPathByID(documentId).catch(() => title),
    active: documentId === activeDocumentId,
  })));
}

export function documentPathHighlights(): string[] {
  return normalizeDocumentPathHighlights(
    settings.getBySpace("questionBank", DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY) ?? DEFAULT_DOCUMENT_PATH_HIGHLIGHTS,
  );
}

export async function saveDocumentPathHighlights(value: string[]): Promise<void> {
  settings.setBySpace("questionBank", DOCUMENT_PATH_HIGHLIGHTS_SETTING_KEY, value.join("\n"));
  await settings.save();
}

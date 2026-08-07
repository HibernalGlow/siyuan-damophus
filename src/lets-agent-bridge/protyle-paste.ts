import { getAllEditor, getAllTabs, openTab, type Protyle } from "siyuan";
import { createDocWithMd, getBlockKramdown, getHPathByID, getIDsByHPath } from "@/api";
import { plugin, sleep } from "@/utils";
import type { PasteItem } from "@hibernalglow/damophus-agent-contract";

export class PasteAdapterError extends Error {
  constructor(
    readonly code: "TARGET_EXISTS" | "TARGET_NOT_FOUND" | "TARGET_AMBIGUOUS" | "ACTIVE_TARGET" | "PASTE_FAILED" | "VERIFY_FAILED" | "UNSUPPORTED_LOCAL_ASSET",
    message: string,
  ) {
    super(message);
    this.name = "PasteAdapterError";
  }
}

export interface PreparedPasteItem {
  item: PasteItem;
  documentId?: string;
  targetPath: string;
}

async function waitForEditor(documentId: string): Promise<Protyle> {
  await openTab({
    app: plugin.app,
    doc: { id: documentId, action: ["cb-get-focus", "cb-get-scroll"] },
    keepCursor: true,
  });
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const editor = getAllEditor().find((item) =>
      item.protyle.block.rootID === documentId &&
      item.protyle.wysiwyg.element.querySelector('[data-node-id] [contenteditable="true"]'),
    );
    if (editor) return editor;
    await sleep(100);
  }
  throw new PasteAdapterError("PASTE_FAILED", `Document editor did not open: ${documentId}`);
}

function selectPasteRange(editor: Protyle, mode: "append" | "replace"): HTMLElement {
  const root = editor.protyle.wysiwyg.element;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))
    .filter((item) => item.querySelector('[contenteditable="true"]'));
  const first = blocks[0]?.querySelector<HTMLElement>('[contenteditable="true"]');
  const last = blocks.at(-1)?.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!first || !last) throw new PasteAdapterError("PASTE_FAILED", "No editable Protyle target was found");

  first.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  if (mode === "replace") {
    range.setStart(first, 0);
    range.setEnd(last, last.childNodes.length);
  } else {
    range.selectNodeContents(last);
    range.collapse(false);
  }
  selection?.removeAllRanges();
  selection?.addRange(range);
  return last;
}

async function dispatchMarkdownPaste(editor: Protyle, markdown: string, mode: "append" | "replace"): Promise<void> {
  const target = selectPasteRange(editor, mode);
  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", markdown);
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  });
  target.dispatchEvent(event);
}

async function readKramdown(documentId: string): Promise<string> {
  const response = await getBlockKramdown(documentId);
  return typeof response?.kramdown === "string" ? response.kramdown : "";
}

async function waitForPersistence(documentId: string, baseline: string, allowSame = false): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastKramdown = "";
  let stableReads = 0;
  while (Date.now() < deadline) {
    const kramdown = await readKramdown(documentId);
    if (kramdown && kramdown !== lastKramdown) {
      lastKramdown = kramdown;
      stableReads = 0;
    } else if (kramdown) {
      stableReads += 1;
    }
    if (kramdown && stableReads >= 2 && (allowSame || kramdown !== baseline)) return;
    await sleep(250);
  }
  throw new PasteAdapterError("VERIFY_FAILED", `Document did not persist after paste: ${documentId}`);
}

export async function pasteCreate(item: PasteItem): Promise<{ documentId: string; targetPath: string }> {
  if (item.target.mode !== "create") throw new PasteAdapterError("PASTE_FAILED", "Invalid create target");
  const existingIds = await getIDsByHPath(item.target.notebookId, item.target.path);
  if (existingIds?.length > 0) {
    throw new PasteAdapterError("TARGET_EXISTS", `Document already exists: ${item.target.path}`);
  }
  const documentId = await createDocWithMd(item.target.notebookId, item.target.path, "");
  if (!documentId) throw new PasteAdapterError("PASTE_FAILED", "SiYuan did not return the new document ID");
  const editor = await waitForEditor(documentId);
  const baseline = await readKramdown(documentId);
  await dispatchMarkdownPaste(editor, item.markdown, "append");
  await waitForPersistence(documentId, baseline, item.markdown.trim() === "");
  return { documentId, targetPath: item.target.path };
}

async function resolveExistingTarget(item: PasteItem): Promise<{ documentId: string; targetPath: string }> {
  if (item.target.mode !== "append" && item.target.mode !== "replace") {
    throw new PasteAdapterError("PASTE_FAILED", "Invalid existing target");
  }
  const locator = item.target.locator;
  if ("documentId" in locator) {
    const targetPath = await getHPathByID(locator.documentId);
    if (!targetPath) throw new PasteAdapterError("TARGET_NOT_FOUND", `Document not found: ${locator.documentId}`);
    return { documentId: locator.documentId, targetPath };
  }
  const ids = await getIDsByHPath(locator.notebookId, locator.path);
  if (!ids || ids.length === 0) throw new PasteAdapterError("TARGET_NOT_FOUND", `Document not found: ${locator.path}`);
  if (ids.length > 1) throw new PasteAdapterError("TARGET_AMBIGUOUS", `Document path is ambiguous: ${locator.path}`);
  return { documentId: ids[0], targetPath: locator.path };
}

export async function pasteExisting(item: PasteItem): Promise<{ documentId: string; targetPath?: string }> {
  if (item.target.mode !== "append" && item.target.mode !== "replace") {
    throw new PasteAdapterError("PASTE_FAILED", "Invalid existing target");
  }
  const target = await resolveExistingTarget(item);
  const editor = await waitForEditor(target.documentId);
  const baseline = await readKramdown(target.documentId);
  await dispatchMarkdownPaste(editor, item.markdown, item.target.mode);
  await waitForPersistence(target.documentId, baseline, item.target.mode === "replace" && item.markdown.trim() === "");
  return target;
}

export async function preparePasteItem(item: PasteItem): Promise<PreparedPasteItem> {
  if (item.target.mode === "create") {
    const existingIds = await getIDsByHPath(item.target.notebookId, item.target.path);
    if (existingIds?.length > 0) {
      throw new PasteAdapterError("TARGET_EXISTS", `Document already exists: ${item.target.path}`);
    }
    return { item, targetPath: item.target.path };
  }
  const target = await resolveExistingTarget(item);
  return { item, ...target };
}

export function findOpenTargetDocumentIds(items: PreparedPasteItem[]): string[] {
  const targetIds = new Set(items.flatMap((item) => item.documentId ? [item.documentId] : []));
  return [...new Set(getAllEditor()
    .map((editor) => editor.protyle.block.rootID)
    .filter((documentId) => targetIds.has(documentId)))];
}

export async function closeTargetDocuments(documentIds: string[]): Promise<void> {
  if (documentIds.length === 0) return;
  const targets = new Set(documentIds);
  for (const tab of getAllTabs()) {
    const editor = (tab.model as unknown as { editor?: Protyle } | undefined)?.editor;
    if (editor && targets.has(editor.protyle.block.rootID)) tab.close();
  }
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const remaining = getAllEditor().some((editor) => targets.has(editor.protyle.block.rootID));
    if (!remaining) return;
    await sleep(100);
  }
  throw new PasteAdapterError("ACTIVE_TARGET", "SiYuan did not close every active target tab");
}

export async function pastePrepared(item: PreparedPasteItem): Promise<{ documentId: string; targetPath?: string }> {
  return item.item.target.mode === "create"
    ? pasteCreate(item.item)
    : pasteExisting(item.item);
}

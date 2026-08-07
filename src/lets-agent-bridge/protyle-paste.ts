import { getAllEditor, openTab, type Protyle } from "siyuan";
import { createDocWithMd, getBlockKramdown, getIDsByHPath } from "@/api";
import { plugin, sleep } from "@/utils";
import type { PasteItem } from "@hibernalglow/damophus-agent-contract";

export class PasteAdapterError extends Error {
  constructor(
    readonly code: "TARGET_EXISTS" | "TARGET_NOT_FOUND" | "TARGET_AMBIGUOUS" | "PASTE_FAILED" | "VERIFY_FAILED" | "UNSUPPORTED_LOCAL_ASSET",
    message: string,
  ) {
    super(message);
    this.name = "PasteAdapterError";
  }
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

function focusAtEnd(editor: Protyle): HTMLElement {
  const root = editor.protyle.wysiwyg.element;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-node-id]'))
    .filter((item) => item.querySelector('[contenteditable="true"]'));
  const block = blocks.at(-1);
  const target = block?.querySelector<HTMLElement>('[contenteditable="true"]')
    ?? root.querySelector<HTMLElement>('[contenteditable="true"]');
  if (!target) throw new PasteAdapterError("PASTE_FAILED", "No editable Protyle target was found");
  target.focus();
  const selection = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(target);
  range.collapse(false);
  selection?.removeAllRanges();
  selection?.addRange(range);
  return target;
}

async function dispatchMarkdownPaste(editor: Protyle, markdown: string): Promise<void> {
  const target = focusAtEnd(editor);
  const dataTransfer = new DataTransfer();
  dataTransfer.setData("text/plain", markdown);
  const event = new ClipboardEvent("paste", {
    bubbles: true,
    cancelable: true,
    clipboardData: dataTransfer,
  });
  target.dispatchEvent(event);
}

async function waitForPersistence(documentId: string, markdown: string): Promise<void> {
  const deadline = Date.now() + 30_000;
  let lastKramdown = "";
  let stableReads = 0;
  while (Date.now() < deadline) {
    const response = await getBlockKramdown(documentId);
    const kramdown = typeof response?.kramdown === "string" ? response.kramdown : "";
    if (kramdown && kramdown !== lastKramdown) {
      lastKramdown = kramdown;
      stableReads = 0;
    } else if (kramdown) {
      stableReads += 1;
    }
    if (kramdown && stableReads >= 2 && (markdown.trim() === "" || kramdown.trim().length > 0)) return;
    await sleep(250);
  }
  throw new PasteAdapterError("VERIFY_FAILED", `Document did not persist after paste: ${documentId}`);
}

export async function pasteCreate(item: PasteItem): Promise<{ documentId: string; targetPath: string }> {
  if (item.target.mode !== "create") {
    throw new PasteAdapterError("PASTE_FAILED", "The first adapter slice only accepts create targets");
  }
  const existingIds = await getIDsByHPath(item.target.notebookId, item.target.path);
  if (existingIds?.length > 0) {
    throw new PasteAdapterError("TARGET_EXISTS", `Document already exists: ${item.target.path}`);
  }
  const documentId = await createDocWithMd(item.target.notebookId, item.target.path, "");
  if (!documentId) throw new PasteAdapterError("PASTE_FAILED", "SiYuan did not return the new document ID");
  const editor = await waitForEditor(documentId);
  await dispatchMarkdownPaste(editor, item.markdown);
  await waitForPersistence(documentId, item.markdown);
  return { documentId, targetPath: item.target.path };
}

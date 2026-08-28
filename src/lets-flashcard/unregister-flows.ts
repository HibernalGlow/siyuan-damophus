import { Dialog, confirm, showMessage } from "siyuan";
import { escapeHtml, type UnregisterProgressDialog } from "./plugin-utils";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import type { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import type { NativePriorityControls } from "@/flashcard/native-priority-controls";
import type { FlashcardUnregisterAudit, FlashcardUnregisterScope, RiffCardRecord } from "@/flashcard/siyuan-adapter";

export interface FlashcardUnregisterHost {
  readonly runtime: FlashcardRuntime;
  readonly compat: Pick<FlashcardRendererCompat, "forget" | "refresh">;
  readonly priorityControls: Pick<NativePriorityControls, "refresh">;
  readonly reviewCards: Map<string, RiffCardRecord>;
  currentReviewCard: RiffCardRecord | undefined;
  t(key: string): string;
  reportError(message: string, error: unknown): void;
  confirmUnregister(title: string, message: string): Promise<boolean>;
  confirmAndUnregister(cards: readonly RiffCardRecord[], label: string, audit?: FlashcardUnregisterAudit): Promise<void>;
  createUnregisterAudit(scope: FlashcardUnregisterScope): FlashcardUnregisterAudit;
  unregisterDocumentScope(ids: readonly string[], includeSubdocuments: boolean, label: string, audit?: FlashcardUnregisterAudit): Promise<void>;
  openUnregisterProgressDialog(total: number): UnregisterProgressDialog;
}

export async function unregisterCard(host: FlashcardUnregisterHost, card: RiffCardRecord): Promise<boolean> {
  const approved = await host.confirmUnregister(
    "取消闪卡登记",
    "这会从当前牌组移除 1 张闪卡，保留正文和原有属性，并将优先级标签移到不可用命名空间。确认执行取消登记吗？",
  );
  if (!approved) return false;
  await host.runtime.adapter.removeCards(host.runtime.getSettings().deckId, [card.blockID]);
  host.reviewCards.delete(card.blockID);
  host.compat.forget([card.blockID]);
  host.compat.refresh();
  await host.runtime.adapter.markCardsUnregistered([card.blockID], host.createUnregisterAudit("card"));
  showMessage("已取消闪卡登记，原笔记块保持不变", 4000, "info");
  return true;
}

export async function unregisterContainers(
  host: FlashcardUnregisterHost,
  containerIds: readonly string[],
  label: string,
): Promise<void> {
  try {
    const candidates = await host.runtime.adapter.getContainerBlockIds(containerIds);
    const cards = await host.runtime.adapter.getCardsByBlockIds(candidates);
    await host.confirmAndUnregister(cards, label, host.createUnregisterAudit("container"));
  } catch (error) {
    host.reportError("查询容器内闪卡失败", error);
  }
}

export function openDocumentUnregisterDialog(
  host: FlashcardUnregisterHost,
  targetIds: readonly string[],
  label: string,
): void {
  const dialog = new Dialog({
    title: host.t("lets-flashcard.unregisterDialogTitle"),
    width: "min(460px, 92vw)",
    content: `
        <div class="b3-dialog__content">
          <label class="fn__flex fn__flex-1 fn__flex-center">
            <input type="checkbox" data-field="include-subdocuments">
            <span class="fn__space--left">${escapeHtml(host.t("lets-flashcard.unregisterIncludeSubdocuments"))}</span>
          </label>
          <label class="fn__flex fn__flex-1 fn__flex-center fn__space--top">
            <input type="checkbox" data-field="write-audit" checked>
            <span class="fn__space--left">${escapeHtml(host.t("lets-flashcard.unregisterWriteAudit"))}</span>
          </label>
          <div class="b3-label fn__space--top">${escapeHtml(host.t("lets-flashcard.unregisterAuditDescription"))}</div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel" type="button">${escapeHtml(host.t("lets-flashcard.cancel"))}</button>
          <button class="b3-button b3-button--text" data-action="unregister" type="button">${escapeHtml(host.t("lets-flashcard.unregisterConfirm"))}</button>
        </div>
      `,
  });
  const includeSubdocuments = dialog.element.querySelector<HTMLInputElement>('[data-field="include-subdocuments"]');
  const writeAudit = dialog.element.querySelector<HTMLInputElement>('[data-field="write-audit"]');
  const unregisterButton = dialog.element.querySelector<HTMLButtonElement>('[data-action="unregister"]');
  dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
  unregisterButton?.addEventListener("click", () => {
    unregisterButton.disabled = true;
    const include = includeSubdocuments?.checked === true;
    const audit = writeAudit?.checked === true
      ? host.createUnregisterAudit(include ? "document-tree" : "document")
      : undefined;
    dialog.destroy();
    void host.unregisterDocumentScope(targetIds, include, label, audit);
  });
}

export async function unregisterDocumentScope(
  host: FlashcardUnregisterHost,
  ids: readonly string[],
  includeSubdocuments: boolean,
  label: string,
  audit?: FlashcardUnregisterAudit,
): Promise<void> {
  try {
    const cards = (await Promise.all(ids.map((id) => host.runtime.adapter.getDocumentCards(id, includeSubdocuments))))
      .flat();
    await host.confirmAndUnregister(cards, label, audit);
  } catch (error) {
    host.reportError("查询文档范围闪卡失败", error);
  }
}

export async function unregisterDocumentTree(
  host: FlashcardUnregisterHost,
  ids: readonly string[],
  notebook: boolean,
  audit?: FlashcardUnregisterAudit,
): Promise<void> {
  try {
    const cards = notebook
      ? (await Promise.all(ids.map((id) => host.runtime.adapter.getNotebookCards(id))).then((all) => all.flat()))
      : (await Promise.all(ids.map((id) => host.runtime.adapter.getDocumentCards(id, true))).then((all) => all.flat()));
    await host.confirmAndUnregister(cards, notebook ? "所选笔记本" : "所选文档", audit);
  } catch (error) {
    host.reportError("查询文档范围闪卡失败", error);
  }
}

export async function confirmAndUnregister(
  host: FlashcardUnregisterHost,
  cards: readonly RiffCardRecord[],
  label: string,
  audit?: FlashcardUnregisterAudit,
): Promise<void> {
  const byBlockId = new Map(cards.map((card) => [card.blockID, card]));
  const selected = [...byBlockId.values()];
  if (selected.length === 0) {
    showMessage(`${label}中没有已登记的闪卡`, 4000, "info");
    return;
  }
  const approved = await host.confirmUnregister(
    "批量取消闪卡登记",
    `即将从思源原生牌组移除 ${selected.length} 张闪卡。正文和原有属性会保留，优先级标签会移到不可用命名空间。确认执行批量取消登记吗？`,
  );
  if (!approved) return;
  const progress = selected.length > 1 ? host.openUnregisterProgressDialog(selected.length) : undefined;
  try {
    progress?.setRemoving();
    await host.runtime.adapter.removeCards(host.runtime.getSettings().deckId, selected.map((card) => card.blockID));
    for (const card of selected) host.reviewCards.delete(card.blockID);
    host.compat.forget(selected.map((card) => card.blockID));
    host.compat.refresh();
    progress?.setWriting(0, selected.length);
    await host.runtime.adapter.markCardsUnregistered(
      selected.map((card) => card.blockID),
      audit,
      (completed, total) => progress?.setWriting(completed, total),
    );
    if (selected.some((card) => card.blockID === host.currentReviewCard?.blockID)) {
      host.currentReviewCard = undefined;
    }
    host.priorityControls.refresh();
    showMessage(`已取消登记 ${selected.length} 张闪卡，原笔记块保持不变`, 5000, "info");
  } finally {
    progress?.destroy();
  }
}

export function confirmUnregister(
  title: string,
  message: string,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    confirm(title, message, () => resolve(true), () => resolve(false));
  });
}

export function createUnregisterAudit(
  host: FlashcardUnregisterHost,
  scope: FlashcardUnregisterScope,
): FlashcardUnregisterAudit {
  return {
    lastUnregisteredAt: new Date().toISOString(),
    deckId: host.runtime.getSettings().deckId,
    scope,
  };
}

export function openUnregisterProgressDialog(
  host: FlashcardUnregisterHost,
  total: number,
): UnregisterProgressDialog {
  const dialog = new Dialog({
    title: host.t("lets-flashcard.unregisterProgressTitle"),
    width: "min(420px, 92vw)",
    content: `
        <div class="b3-dialog__content" aria-live="polite">
          <strong data-progress-message></strong>
          <progress class="fn__block fn__space--top" data-progress-bar max="${total}"></progress>
          <div class="b3-label fn__space--top" data-progress-count></div>
        </div>
      `,
  });
  const message = dialog.element.querySelector<HTMLElement>("[data-progress-message]");
  const bar = dialog.element.querySelector<HTMLProgressElement>("[data-progress-bar]");
  const count = dialog.element.querySelector<HTMLElement>("[data-progress-count]");
  const setMessage = (text: string, completed?: number, countTotal = total): void => {
    if (!message || !bar || !count) return;
    message.textContent = text;
    if (completed === undefined) {
      bar.removeAttribute("value");
      count.textContent = "";
      return;
    }
    bar.max = countTotal;
    bar.value = completed;
    count.textContent = `${completed} / ${countTotal}`;
  };
  return {
    setRemoving: () => setMessage(host.t("lets-flashcard.unregisterProgressRemoving")),
    setWriting: (completed, countTotal) => setMessage(host.t("lets-flashcard.unregisterProgressWriting"), completed, countTotal),
    destroy: () => dialog.destroy(),
  };
}

import { showMessage } from "siyuan";
import { isMobileEntryFrontend } from "@/libs/plugin-entry-settings";

export interface FlashcardMobileEntryHost {
  mobileNativeEntryBound: boolean;
  mobileReviewButtonObserver: MutationObserver | undefined;
  currentReviewContext(): { documentId: string; documentName: string; notebookId?: string; notebookName?: string } | undefined;
  reviewDocumentScope(documentId: string, targetName: string): void;
  handleMobileNativeReviewEntry(event: MouseEvent): void;
}

export function bindMobileNativeReviewEntry(host: FlashcardMobileEntryHost): void {
  if (host.mobileNativeEntryBound || typeof document === "undefined") return;
  document.addEventListener("click", host.handleMobileNativeReviewEntry, true);
  host.mobileNativeEntryBound = true;
}

export function bindMobileReviewButtonLabel(host: FlashcardMobileEntryHost): void {
  if (!isMobileEntryFrontend() || typeof document === "undefined") return;
  const update = (): void => {
    const button = document.querySelector<HTMLElement>("#mobileBottomBarSpacedRepetition");
    if (!button) return;
    button.setAttribute("aria-label", "打开本文档");
    button.setAttribute("title", "打开本文档");
    const label = button.querySelector<HTMLElement>(".mobile-bottom-bar__label");
    if (label && label.textContent !== "打开本文档") label.textContent = "打开本文档";
  };
  update();
  host.mobileReviewButtonObserver = new MutationObserver(update);
  host.mobileReviewButtonObserver.observe(document.body, { childList: true, subtree: true });
}

export function unbindMobileNativeReviewEntry(host: FlashcardMobileEntryHost): void {
  if (!host.mobileNativeEntryBound || typeof document === "undefined") return;
  document.removeEventListener("click", host.handleMobileNativeReviewEntry, true);
  host.mobileNativeEntryBound = false;
}

export function handleMobileNativeReviewEntry(host: FlashcardMobileEntryHost, event: MouseEvent): void {
  if (!isMobileEntryFrontend()) return;
  const target = event.target instanceof Element
    ? event.target.closest<HTMLElement>("#mobileBottomBarSpacedRepetition")
    : null;
  if (!target) return;
  if (target.dataset.damophusGlobalReviewBypass === "true") {
    delete target.dataset.damophusGlobalReviewBypass;
    return;
  }
  const context = host.currentReviewContext();
  event.preventDefault();
  event.stopImmediatePropagation();
  if (!context) {
    showMessage("当前没有可识别的文档，未打开全局闪卡", 4000, "info");
    return;
  }
  host.reviewDocumentScope(context.documentId, context.documentName);
}

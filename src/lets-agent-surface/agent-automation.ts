const AGENT_PANEL_SELECTOR = ".sy__agentChat";
const COMPOSER_SELECTOR = ".agent-chat__composer-host .protyle-wysiwyg";
const CONFIRM_SELECTOR = ".agent-chat__msg--confirm:not(.agent-chat__msg--confirmed)";
const CONFIRM_ACTION_SELECTOR = ".agent-chat__confirm-actions button";
const ALWAYS_ALLOW_SELECTOR = ".agent-chat__confirm-always";
const DRAFT_EXPIRY_MS = 15_000;
const INVISIBLE_TEXT = /[\u200b\u200c\u200d\u2060\ufeff]/gu;

type PendingDraft = {
  html: string;
  expiryTimer: number;
};

export type AgentApprovalNotice = {
  description: string;
  delayMs: number;
};

export type AgentAutomationOptions = {
  isYoloEnabled: () => boolean;
  approvalDelayMs: () => number;
  notifyApproval?: (notice: AgentApprovalNotice) => void;
  preserveNewSessionDraft: () => boolean;
};

function composerHasContent(editor: HTMLElement): boolean {
  const text = (editor.textContent ?? "").replace(INVISIBLE_TEXT, "").trim();
  if (text) return true;
  return Boolean(editor.querySelector(
    '[data-type~="block-ref"], img, video, audio, [data-type="NodeBlockQueryEmbed"]',
  ));
}

function approvalDescription(card: HTMLElement): string {
  return card.querySelector<HTMLElement>(".agent-chat__confirm-header")?.textContent?.trim() ?? "";
}

export class AgentAutomationController {
  private observer?: MutationObserver;
  private readonly approvalTimers = new Map<HTMLElement, number>();
  private readonly pendingDrafts = new Map<HTMLElement, PendingDraft>();

  constructor(
    private readonly root: HTMLElement,
    private readonly options: AgentAutomationOptions,
  ) {}

  start(): void {
    if (this.observer) return;
    this.root.addEventListener("click", this.handleClick, true);
    this.observer = new MutationObserver(() => this.scan());
    this.observer.observe(this.root, { childList: true, characterData: true, subtree: true });
    this.scan();
  }

  stop(): void {
    this.root.removeEventListener("click", this.handleClick, true);
    this.observer?.disconnect();
    this.observer = undefined;
    for (const timer of this.approvalTimers.values()) window.clearTimeout(timer);
    for (const draft of this.pendingDrafts.values()) window.clearTimeout(draft.expiryTimer);
    this.approvalTimers.clear();
    this.pendingDrafts.clear();
  }

  private readonly handleClick = (event: MouseEvent): void => {
    const target = event.target instanceof Element ? event.target : undefined;
    if (!target) return;

    const confirmAction = target.closest<HTMLElement>(CONFIRM_ACTION_SELECTOR);
    const confirmCard = confirmAction?.closest<HTMLElement>(CONFIRM_SELECTOR);
    if (confirmCard) this.cancelApproval(confirmCard);

    if (!this.options.preserveNewSessionDraft()) return;
    const newSessionButton = target.closest<HTMLElement>('.block__icon[data-type="new-session"]');
    const panel = newSessionButton?.closest<HTMLElement>(AGENT_PANEL_SELECTOR);
    const editor = panel?.querySelector<HTMLElement>(COMPOSER_SELECTOR);
    if (!panel || !editor || !composerHasContent(editor)) return;

    const previous = this.pendingDrafts.get(panel);
    if (previous) window.clearTimeout(previous.expiryTimer);
    const expiryTimer = window.setTimeout(() => this.pendingDrafts.delete(panel), DRAFT_EXPIRY_MS);
    this.pendingDrafts.set(panel, { html: editor.innerHTML, expiryTimer });
  };

  private scan(): void {
    this.restoreDrafts();
    if (!this.options.isYoloEnabled()) return;
    this.root.querySelectorAll<HTMLElement>(CONFIRM_SELECTOR).forEach((card) => {
      this.scheduleApproval(card);
    });
  }

  private scheduleApproval(card: HTMLElement): void {
    if (this.approvalTimers.has(card)) return;
    const alwaysAllow = card.querySelector<HTMLButtonElement>(ALWAYS_ALLOW_SELECTOR);
    if (!alwaysAllow || alwaysAllow.disabled) return;

    const delayMs = Math.max(0, Number(this.options.approvalDelayMs()) || 0);
    if (delayMs > 0) {
      this.options.notifyApproval?.({
        description: approvalDescription(card),
        delayMs,
      });
    }
    const timer = window.setTimeout(() => {
      this.approvalTimers.delete(card);
      if (!this.options.isYoloEnabled() || !card.isConnected) return;
      if (card.classList.contains("agent-chat__msg--confirmed")) return;
      const currentButton = card.querySelector<HTMLButtonElement>(ALWAYS_ALLOW_SELECTOR);
      if (!currentButton || currentButton.disabled) return;
      currentButton.click();
    }, delayMs);
    this.approvalTimers.set(card, timer);
  }

  private cancelApproval(card: HTMLElement): void {
    const timer = this.approvalTimers.get(card);
    if (timer === undefined) return;
    window.clearTimeout(timer);
    this.approvalTimers.delete(card);
  }

  private restoreDrafts(): void {
    for (const [panel, draft] of this.pendingDrafts) {
      if (!panel.isConnected) continue;
      const editor = panel.querySelector<HTMLElement>(COMPOSER_SELECTOR);
      if (!editor || composerHasContent(editor)) continue;

      window.clearTimeout(draft.expiryTimer);
      this.pendingDrafts.delete(panel);
      editor.innerHTML = draft.html;
      editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
    }
  }
}

import { showMessage } from "siyuan";
import type { RiffCardRecord } from "./siyuan-adapter";
import { priorityTag } from "./priority-tags";

export interface NativePriorityControlOptions {
  documentRef: Document;
  getCurrentCard: () => RiffCardRecord | undefined;
  resolveCard?: (blockId: string) => Promise<RiffCardRecord | undefined>;
  setPriority: (card: RiffCardRecord, priority: number) => Promise<"native" | "pending">;
}

const PRIORITIES = [
  { value: 100, label: "P1" },
  { value: 75, label: "P2" },
  { value: 50, label: "P3" },
  { value: 25, label: "P4" },
] as const;

/** Adds a small menu to the native card toolbar without replacing siyuan-card. */
export class NativePriorityControls {
  private observer?: MutationObserver;
  private readonly controls = new Map<HTMLSelectElement, { root: HTMLElement; handler: () => void }>();

  constructor(private readonly options: NativePriorityControlOptions) {}

  install(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scan());
    const root = this.options.documentRef.body;
    if (root) this.observer.observe(root, { childList: true, subtree: true });
    this.scan();
  }

  refresh(): void {
    for (const [control, entry] of this.controls) {
      const enabled = Boolean(this.options.getCurrentCard() || this.blockIdForRoot(entry.root));
      control.disabled = !enabled;
      control.setAttribute("aria-disabled", String(!enabled));
    }
  }

  uninstall(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const [control, entry] of this.controls) {
      control.removeEventListener("change", entry.handler);
      control.remove();
    }
    this.controls.clear();
  }

  private scan(): void {
    const roots = this.options.documentRef.querySelectorAll<HTMLElement>(
      '[data-key="dialog-opencard"] .card__main',
    );
    for (const root of roots) this.attach(root);
    this.refresh();
  }

  private attach(root: HTMLElement): void {
    if (root.querySelector("[data-damophus-priority-control]")) return;
    const toolbar = root.querySelector<HTMLElement>(".block__icons, .toolbar");
    if (!toolbar) return;
    const control = this.options.documentRef.createElement("select");
    control.className = "block__icon block__icon--show damophus-flashcard-priority";
    control.setAttribute("data-damophus-priority-control", "true");
    control.setAttribute("aria-label", "设置闪卡优先级");
    control.title = "设置闪卡优先级";
    const placeholder = this.options.documentRef.createElement("option");
    placeholder.value = "";
    placeholder.textContent = "P";
    control.append(placeholder);
    for (const option of PRIORITIES) {
      const item = this.options.documentRef.createElement("option");
      item.value = String(option.value);
      item.textContent = option.label;
      control.append(item);
    }
    const handler = () => {
      const value = Number(control.value);
      if (!Number.isFinite(value)) return;
      const previousValue = control.value;
      control.disabled = true;
      const blockId = this.blockIdForRoot(root);
      const cardPromise = ((blockId && this.options.resolveCard)
        ? this.options.resolveCard(blockId)
        : Promise.resolve(this.options.getCurrentCard()))
        .catch(() => this.options.getCurrentCard());
      void cardPromise.then((card) => {
        // The rendered card can expose a nested paragraph node instead of the
        // Riff root. Keep the native event-selected card as a safe fallback.
        return card ?? this.options.getCurrentCard();
      }).then((card) => {
        if (!card) {
          showMessage("无法定位当前闪卡，请重新打开复习卡片", 4000, "error");
          return undefined;
        }
        return this.options.setPriority(card, value);
      }).then((status) => {
        if (!status) return;
        showMessage(
          status === "pending"
            ? `当前卡片已写入 ${priorityTag(value)} 标签，运行时优先级待同步`
            : `当前卡片优先级已调整为 ${priorityTag(value)}`,
          4000,
          status === "pending" ? "error" : "info",
        );
      }).catch(() => {
        showMessage("优先级保存失败，请检查闪卡标签", 4000, "error");
      }).finally(() => {
        control.disabled = false;
        control.value = previousValue;
        this.refresh();
      });
    };
    control.addEventListener("change", handler);
    toolbar.append(control);
    this.controls.set(control, { root, handler });
  }

  private blockIdForRoot(root: HTMLElement): string | undefined {
    const node = root.matches("[data-node-id]")
      ? root
      : root.querySelector<HTMLElement>("[data-node-id]");
    const blockId = node?.dataset.nodeId;
    return blockId && /^\d{14}-[a-z0-9]{7}$/u.test(blockId) ? blockId : undefined;
  }
}

export { PRIORITIES };

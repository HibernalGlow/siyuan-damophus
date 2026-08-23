import { showMessage } from "siyuan";
import type { RiffCardRecord } from "./siyuan-adapter";
import { priorityTag } from "./priority-tags";

export interface NativePriorityControlOptions {
  documentRef: Document;
  getCurrentCard: () => RiffCardRecord | undefined;
  setPriority: (card: RiffCardRecord, priority: number) => Promise<"native" | "tomato" | "pending">;
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
  private readonly controls = new Map<HTMLSelectElement, () => void>();

  constructor(private readonly options: NativePriorityControlOptions) {}

  install(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scan());
    const root = this.options.documentRef.body;
    if (root) this.observer.observe(root, { childList: true, subtree: true });
    this.scan();
  }

  refresh(): void {
    const enabled = Boolean(this.options.getCurrentCard());
    for (const control of this.controls.keys()) {
      control.disabled = !enabled;
      control.setAttribute("aria-disabled", String(!enabled));
    }
  }

  uninstall(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const [control, handler] of this.controls) {
      control.removeEventListener("change", handler);
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
      const card = this.options.getCurrentCard();
      const value = Number(control.value);
      control.value = "";
      if (!card || !Number.isFinite(value)) return;
      void this.options.setPriority(card, value).then((status) => {
        showMessage(
          status === "pending"
            ? `当前卡片已写入 ${priorityTag(value)} 标签，运行时优先级待同步`
            : `当前卡片优先级已调整为 ${priorityTag(value)}`,
          4000,
          status === "pending" ? "error" : "info",
        );
      });
    };
    control.addEventListener("change", handler);
    toolbar.append(control);
    this.controls.set(control, handler);
  }
}

export { PRIORITIES };

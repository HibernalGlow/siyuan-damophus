import { Menu, showMessage } from "siyuan";
import type { RiffCardRecord } from "./siyuan-adapter";
import { priorityTag } from "./priority-tags";

export interface NativeReviewToolbarSettings {
  enabled: boolean;
  locate: boolean;
  unregister: boolean;
  priority: boolean;
  workbench: boolean;
  renderer: boolean;
}

export interface NativePriorityControlOptions {
  documentRef: Document;
  getSettings: () => NativeReviewToolbarSettings;
  getCurrentCard: () => RiffCardRecord | undefined;
  resolveCard?: (blockId: string, root?: HTMLElement) => Promise<RiffCardRecord | undefined>;
  setPriority: (card: RiffCardRecord, priority: number) => Promise<"native" | "pending">;
  locate: (card: RiffCardRecord) => void | Promise<void>;
  unregister: (card: RiffCardRecord) => Promise<boolean>;
  openWorkbench: () => void;
  isRendererOverrideEnabled: () => boolean;
  toggleRendererOverride: () => void | Promise<void>;
}

const PRIORITIES = [
  { value: 100, label: "P1" },
  { value: 75, label: "P2" },
  { value: 50, label: "P3" },
  { value: 25, label: "P4" },
] as const;

interface AttachedControl {
  root: HTMLElement;
  elements: HTMLElement[];
  signature: string;
}

/** Adds narrow actions to SiYuan's native review toolbar on desktop and mobile. */
export class NativePriorityControls {
  private observer?: MutationObserver;
  private readonly controls = new Map<HTMLElement, AttachedControl>();

  constructor(private readonly options: NativePriorityControlOptions) {}

  install(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scan());
    const root = this.options.documentRef.body;
    if (root) this.observer.observe(root, { childList: true, subtree: true });
    this.scan();
  }

  refresh(): void {
    const settings = this.options.getSettings();
    for (const [toolbar, entry] of this.controls) {
      if (!toolbar.isConnected || !settings.enabled) {
        for (const element of entry.elements) element.remove();
        this.controls.delete(toolbar);
        continue;
      }
      const enabled = Boolean(this.options.getCurrentCard() || this.blockIdForRoot(entry.root));
      for (const element of entry.elements) {
        if (element instanceof HTMLButtonElement) element.disabled = !enabled;
        element.setAttribute("aria-disabled", String(!enabled));
      }
    }
    this.scan();
  }

  uninstall(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const entry of this.controls.values()) {
      for (const element of entry.elements) element.remove();
    }
    this.controls.clear();
  }

  private scan(): void {
    const settings = this.options.getSettings();
    if (!settings.enabled) return;
    const signature = JSON.stringify(settings);
    for (const root of this.options.documentRef.querySelectorAll<HTMLElement>(".card__main")) {
      const toolbar = root.querySelector<HTMLElement>(":scope > .block__icons, :scope > .toolbar");
      if (!toolbar) continue;
      const current = this.controls.get(toolbar);
      if (current?.signature === signature) continue;
      if (current) {
        for (const element of current.elements) element.remove();
        this.controls.delete(toolbar);
      }
      this.attach(root, toolbar, settings, signature);
    }
  }

  private attach(root: HTMLElement, toolbar: HTMLElement, settings: NativeReviewToolbarSettings, signature: string): void {
    const elements: HTMLElement[] = [];
    if (settings.locate) elements.push(this.createAction(toolbar, "iconFocus", "定位闪卡原块", async () => {
      const card = await this.resolveCard(root);
      if (card) await this.options.locate(card);
    }));
    if (settings.unregister) elements.push(this.createAction(toolbar, "iconCloseRound", "取消闪卡登记", async () => {
      const card = await this.resolveCard(root);
      if (card && await this.options.unregister(card)) {
        root.querySelector<HTMLButtonElement>('.card__action:not(.fn__none) button[data-type="-3"]')?.click();
      }
    }));
    if (settings.priority) elements.push(this.createAction(toolbar, "iconSort", "设置闪卡优先级", async (trigger) => {
      const card = await this.resolveCard(root);
      if (card) this.openPriorityMenu(trigger, card);
    }));
    if (settings.renderer) {
      const enabled = this.options.isRendererOverrideEnabled();
      elements.push(this.createAction(
        toolbar,
        enabled ? "iconEye" : "iconEyeoff",
        enabled ? "关闭按卡片渲染" : "启用按卡片渲染",
        () => this.options.toggleRendererOverride(),
      ));
    }
    if (settings.workbench) elements.push(this.createAction(toolbar, "iconSettings", "打开闪卡工作台", () => this.options.openWorkbench()));
    this.controls.set(toolbar, { root, elements, signature });
  }

  private createAction(
    toolbar: HTMLElement,
    icon: string,
    label: string,
    action: (trigger: HTMLElement) => void | Promise<void>,
  ): HTMLElement {
    const mobile = toolbar.classList.contains("toolbar");
    const element = this.options.documentRef.createElement(mobile ? "svg" : "button");
    element.className = mobile ? "toolbar__icon" : "block__icon block__icon--show";
    element.setAttribute("data-damophus-flashcard-tool", icon);
    element.setAttribute("aria-label", label);
    element.setAttribute("title", label);
    if (mobile) {
      const use = this.options.documentRef.createElementNS("http://www.w3.org/2000/svg", "use");
      use.setAttribute("href", `#${icon}`);
      element.append(use);
    } else {
      element.innerHTML = `<svg><use href="#${icon}"></use></svg>`;
    }
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      void action(element);
    });
    const filter = toolbar.querySelector('[data-type="filter"]');
    toolbar.insertBefore(element, filter ?? null);
    return element;
  }

  private openPriorityMenu(trigger: HTMLElement, card: RiffCardRecord): void {
    const menu = new Menu("damophus-flashcard-priority-menu");
    for (const option of PRIORITIES) {
      menu.addItem({
        icon: "iconSort",
        label: option.label,
        click: () => void this.options.setPriority(card, option.value).then((status) => {
          showMessage(
            status === "pending"
              ? `当前卡片的 ${priorityTag(option.value)} 标签保存失败`
              : `当前卡片优先级已调整为 ${priorityTag(option.value)}`,
            4000,
            status === "pending" ? "error" : "info",
          );
        }),
      });
    }
    const rect = trigger.getBoundingClientRect();
    menu.open({ x: rect.left, y: rect.bottom, isLeft: false });
  }

  private async resolveCard(root: HTMLElement): Promise<RiffCardRecord | undefined> {
    const blockId = this.blockIdForRoot(root);
    const card = await ((blockId && this.options.resolveCard)
      ? this.options.resolveCard(blockId, root)
      : Promise.resolve(this.options.getCurrentCard()))
      .catch(() => this.options.getCurrentCard());
    const resolved = card ?? this.options.getCurrentCard();
    if (!resolved) showMessage("无法定位当前闪卡，请重新打开复习卡片", 4000, "error");
    return resolved;
  }

  private blockIdForRoot(root: HTMLElement): string | undefined {
    const node = root.querySelector<HTMLElement>("[data-node-id]");
    const blockId = node?.dataset.nodeId;
    return blockId && /^\d{14}-[a-z0-9]{7}$/u.test(blockId) ? blockId : undefined;
  }
}

export { PRIORITIES };

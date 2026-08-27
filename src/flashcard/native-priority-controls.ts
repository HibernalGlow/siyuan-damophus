import { Menu, showMessage, type IMenu } from "siyuan";
import type { RiffCardRecord } from "./siyuan-adapter";
import { priorityTag } from "./priority-tags";
import { getReviewToolbarActions, getReviewToolbarActionRevision, type ReviewToolbarAction, type ReviewToolbarActionContext } from "./review-action-registry";

export interface NativeReviewToolbarSettings {
  enabled: boolean;
  locate: boolean;
  unregister: boolean;
  priority: boolean;
  workbench: boolean;
  renderer: boolean;
  skipBetween: boolean;
  showExitFocus?: boolean;
  showBrand: boolean;
  showFilter?: boolean;
  showFullscreen?: boolean;
  reviewToolbarActionOrder?: string[];
  reviewToolbarCustomCss?: string;
}

export type RendererVisibilityKey = "mark" | "list" | "heading" | "superBlock" | "blockquote" | "callout" | "tag" | "topicRelations";
export type ReviewToolbarKey = "locate" | "unregister" | "priority" | "workbench" | "renderer" | "filter" | "fullscreen";

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
  getRendererVisibility: () => Partial<Record<RendererVisibilityKey, boolean>>;
  toggleRendererVisibility: (key: RendererVisibilityKey) => void | Promise<void>;
  toggleToolVisibility: (key: ReviewToolbarKey) => void | Promise<void>;
}

const PRIORITIES = [
  { value: 100, label: "P1" },
  { value: 75, label: "P2" },
  { value: 50, label: "P3" },
  { value: 25, label: "P4" },
] as const;

interface AttachedControl {
  root: HTMLElement;
  elements: Element[];
  signature: string;
}

const BREADCRUMB_POLICY_STYLE_ID = "damophus-flashcard-breadcrumb-policy";
const CUSTOM_STYLE_ID = "damophus-flashcard-custom-toolbar-style";
const BREADCRUMB_POLICY_STYLE = `
.protyle-breadcrumb[data-damophus-flashcard-breadcrumb]:not([data-damophus-show-exit-focus]) > [data-type="exit-focus"] {
  display: none !important;
}
.protyle-breadcrumb[data-damophus-flashcard-breadcrumb] > .block__icon {
  margin-left: 2px;
  padding: 2px;
}
.protyle-breadcrumb[data-damophus-flashcard-breadcrumb] > [data-type="readonly"].block__icon {
  margin-left: 0;
}
.card__main[data-damophus-hide-native-filter] > :is(.toolbar, .block__icons) > [data-type="filter"],
.card__main[data-damophus-hide-native-filter] > :is(.toolbar, .block__icons) > [data-damophus-native-filter-space],
.card__main[data-damophus-hide-native-fullscreen] > :is(.toolbar, .block__icons) > [data-type="fullscreen"],
.card__main[data-damophus-hide-native-fullscreen] > :is(.toolbar, .block__icons) > [data-damophus-native-fullscreen-space] {
  display: none !important;
}
`;

/** Adds narrow actions to SiYuan's native review toolbar on desktop and mobile. */
export class NativePriorityControls {
  private observer?: MutationObserver;
  private scanTimer?: number;
  private readonly controls = new Map<HTMLElement, AttachedControl>();
  private readonly handleNativeMoreClick = (event: Event): void => {
    const target = event.target as Element | null;
    const more = target?.closest<HTMLElement>('[data-type="more"]');
    const root = more?.closest<HTMLElement>(".card__main");
    if (!root || !this.options.getSettings().enabled) return;
    // Native SiYuan creates #commonMenu during the click handler itself.
    // Defer until after that handler and retry once for slower mobile menus.
    for (const delay of [0, 40, 120]) {
      window.setTimeout(() => this.appendNativeMoreItems(root), delay);
    }
  };

  constructor(private readonly options: NativePriorityControlOptions) {}

  openPriorityMenuForAction(trigger: Element, card: RiffCardRecord): void {
    this.openPriorityMenu(trigger, card);
  }

  install(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scan());
    const root = this.options.documentRef.body;
    if (root) this.observer.observe(root, { childList: true, subtree: true });
    this.options.documentRef.addEventListener("click", this.handleNativeMoreClick, true);
    this.scanTimer = window.setInterval(() => this.scan(), 250);
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
      this.applyCardBrandVisibility(entry.root, settings.showBrand);
      this.applyNativeToolbarVisibility(entry.root, settings);
      this.applySkipPlacement(entry.root, settings.skipBetween);
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
    this.options.documentRef.removeEventListener("click", this.handleNativeMoreClick, true);
    if (this.scanTimer !== undefined) window.clearInterval(this.scanTimer);
    this.scanTimer = undefined;
    for (const entry of this.controls.values()) {
      for (const element of entry.elements) element.remove();
    }
    this.clearBreadcrumbPolicies();
    this.clearNativeToolbarPolicies();
    this.controls.clear();
    this.options.documentRef.getElementById(BREADCRUMB_POLICY_STYLE_ID)?.remove();
    this.options.documentRef.getElementById(CUSTOM_STYLE_ID)?.remove();
  }

  private scan(): void {
    const settings = this.options.getSettings();
    if (!settings.enabled) {
      this.clearBreadcrumbPolicies();
      this.clearNativeToolbarPolicies();
      return;
    }
    const signature = JSON.stringify({ settings, actionRevision: getReviewToolbarActionRevision() });
    this.applyCustomStyle(settings.reviewToolbarCustomCss ?? "");
    const actions = this.resolveActions(settings);
    for (const root of this.options.documentRef.querySelectorAll<HTMLElement>(".card__main")) {
      const toolbar = [...root.children].find((child): child is HTMLElement =>
        child.classList.contains("block__icons") || child.classList.contains("toolbar"),
      );
      if (!toolbar) continue;
      this.applyCardBrandVisibility(root, settings.showBrand);
      this.applyNativeToolbarVisibility(root, settings);
      this.applyBreadcrumbPolicy(root, settings, toolbar.classList.contains("toolbar"));
      this.applySkipPlacement(root, settings.skipBetween);
      const current = this.controls.get(toolbar);
      if (current?.signature === signature && current.elements.every((element) => element.isConnected)) continue;
      if (current) {
        for (const element of current.elements) element.remove();
        this.controls.delete(toolbar);
      }
      this.attach(root, toolbar, actions, signature);
    }
  }

  private applyBreadcrumbPolicy(root: HTMLElement, settings: NativeReviewToolbarSettings, mobile: boolean): void {
    const breadcrumb = root.querySelector<HTMLElement>(".protyle-breadcrumb");
    if (!breadcrumb) return;
    const active = settings.enabled && mobile;
    breadcrumb.toggleAttribute("data-damophus-flashcard-breadcrumb", active);
    breadcrumb.toggleAttribute("data-damophus-show-exit-focus", active && settings.showExitFocus === true);
    if (active) this.ensureBreadcrumbPolicyStyle();
  }

  private applyCardBrandVisibility(root: HTMLElement, showBrand: boolean): void {
    const desktopToolbar = [...root.children].find((child): child is HTMLElement => child.classList.contains("block__icons"));
    const desktopBrand = desktopToolbar
      ? [...desktopToolbar.children].find((child): child is HTMLElement => child.classList.contains("block__logo"))
      : undefined;
    desktopBrand?.toggleAttribute("hidden", !showBrand);

    const mobileToolbar = [...root.children].find((child): child is HTMLElement => child.classList.contains("toolbar"));
    if (!mobileToolbar) return;
    const mobileBrandIcon = [...mobileToolbar.children].find((child): child is HTMLElement =>
      child.classList.contains("toolbar__icon") && !(child as HTMLElement).dataset?.type,
    );
    const mobileBrandText = [...mobileToolbar.children].find((child): child is HTMLElement =>
      child.classList.contains("toolbar__text"),
    );
    mobileBrandIcon?.toggleAttribute("hidden", !showBrand);
    mobileBrandText?.toggleAttribute("hidden", !showBrand);
  }

  private applyNativeToolbarVisibility(root: HTMLElement, settings: NativeReviewToolbarSettings): void {
    root.toggleAttribute("data-damophus-hide-native-filter", settings.showFilter === false);
    root.toggleAttribute("data-damophus-hide-native-fullscreen", settings.showFullscreen === false);
    const toolbar = [...root.children].find((child): child is HTMLElement =>
      child.classList.contains("block__icons") || child.classList.contains("toolbar"),
    );
    if (!toolbar) return;
    this.markFollowingSpace(toolbar.querySelector<HTMLElement>('[data-type="filter"]'), "data-damophus-native-filter-space");
    this.markFollowingSpace(toolbar.querySelector<HTMLElement>('[data-type="fullscreen"]'), "data-damophus-native-fullscreen-space");
    this.ensureBreadcrumbPolicyStyle();
  }

  private markFollowingSpace(control: HTMLElement | null, attribute: string): void {
    const space = control?.nextElementSibling;
    if (space instanceof HTMLElement && space.classList.contains("fn__space")) space.setAttribute(attribute, "");
  }

  private clearNativeToolbarPolicies(): void {
    for (const root of this.options.documentRef.querySelectorAll<HTMLElement>(
      ".card__main[data-damophus-hide-native-filter], .card__main[data-damophus-hide-native-fullscreen]",
    )) {
      root.removeAttribute("data-damophus-hide-native-filter");
      root.removeAttribute("data-damophus-hide-native-fullscreen");
    }
    for (const space of this.options.documentRef.querySelectorAll<HTMLElement>(
      "[data-damophus-native-filter-space], [data-damophus-native-fullscreen-space]",
    )) {
      space.removeAttribute("data-damophus-native-filter-space");
      space.removeAttribute("data-damophus-native-fullscreen-space");
    }
  }

  private clearBreadcrumbPolicies(): void {
    for (const breadcrumb of this.options.documentRef.querySelectorAll<HTMLElement>(
      '.card__main .protyle-breadcrumb[data-damophus-flashcard-breadcrumb]',
    )) {
      breadcrumb.removeAttribute("data-damophus-flashcard-breadcrumb");
      breadcrumb.removeAttribute("data-damophus-show-exit-focus");
    }
  }

  private ensureBreadcrumbPolicyStyle(): void {
    if (this.options.documentRef.getElementById(BREADCRUMB_POLICY_STYLE_ID)) return;
    const style = this.options.documentRef.createElement("style");
    style.id = BREADCRUMB_POLICY_STYLE_ID;
    style.textContent = BREADCRUMB_POLICY_STYLE;
    this.options.documentRef.head.append(style);
  }

  private resolveActions(settings: NativeReviewToolbarSettings): ReviewToolbarAction[] {
    const fallback: ReviewToolbarAction[] = [
      { id: "locate", icon: "iconFocus", label: "定位闪卡原块", source: "DAMO", execute: async (context) => { const card = await context.resolveCard(); if (card) await this.options.locate(card); } },
      { id: "unregister", icon: "iconCloseRound", label: "取消闪卡登记", source: "DAMO", execute: async (context) => { const card = await context.resolveCard(); if (card && await this.options.unregister(card)) context.click('.card__action:not(.fn__none) button[data-type="-3"]'); } },
      { id: "priority", icon: "iconSort", label: "设置闪卡优先级", source: "DAMO", execute: async (context) => { const card = await context.resolveCard(); if (card) this.openPriorityMenu(context.trigger, card); } },
      { id: "renderer", icon: "iconEye", label: "切换按卡片渲染", source: "DAMO", execute: () => this.options.toggleRendererOverride() },
      { id: "workbench", icon: "iconSettings", label: "打开闪卡工作台", source: "DAMO", execute: () => this.options.openWorkbench() },
      { id: "native.filter", icon: "iconFilter", label: "原生筛选", source: "思源", execute: (context) => { context.click('[data-type="filter"]'); } },
      { id: "native.fullscreen", icon: "iconFullscreen", label: "原生全屏", source: "思源", execute: (context) => { context.click('[data-type="fullscreen"]'); } },
      { id: "native.more", icon: "iconMore", label: "更多", source: "思源", execute: (context) => { context.click('[data-type="more"]'); } },
    ];
    const legacyVisibility: Record<string, boolean> = {
      locate: settings.locate,
      unregister: settings.unregister,
      priority: settings.priority,
      renderer: settings.renderer,
      workbench: settings.workbench,
      "native.filter": settings.showFilter !== false,
      "native.fullscreen": settings.showFullscreen !== false,
    };
    const all = new Map(fallback.map((action) => [action.id, action]));
    for (const action of getReviewToolbarActions()) all.set(action.id, action);
    const order = settings.reviewToolbarActionOrder?.length
      ? settings.reviewToolbarActionOrder
      : ["locate", "unregister", "priority", "renderer", "workbench"];
    const ordered = order
      .filter((id) => legacyVisibility[id] !== false)
      .map((id) => all.get(id))
      .filter((action): action is ReviewToolbarAction => Boolean(action));
    const included = new Set(ordered.map((action) => action.id));
    for (const action of all.values()) {
      if (!included.has(action.id) && action.source !== "DAMO" && action.source !== "思源") ordered.push(action);
    }
    return ordered;
  }

  private applyCustomStyle(css: string): void {
    const existing = this.options.documentRef.getElementById(CUSTOM_STYLE_ID);
    if (!css.trim()) {
      existing?.remove();
      return;
    }
    const style = existing ?? this.options.documentRef.createElement("style");
    style.id = CUSTOM_STYLE_ID;
    const scopedCss = `@scope (.card__main) {\n${css}\n}`;
    if (style.textContent !== scopedCss) style.textContent = scopedCss;
    if (!existing) this.options.documentRef.head.append(style);
  }

  private attach(root: HTMLElement, toolbar: HTMLElement, actions: ReviewToolbarAction[], signature: string): void {
    const elements: Element[] = [];
    for (const action of actions) {
      elements.push(this.createAction(toolbar, action, root));
    }
    this.controls.set(toolbar, { root, elements, signature });
  }

  private applySkipPlacement(root: HTMLElement, moveBetween: boolean): void {
    const action = [...root.querySelectorAll<HTMLElement>(".card__action")]
      .find((candidate) => candidate.querySelector('[data-type="-1"]'));
    if (!action) return;
    const pq = action.querySelector<HTMLElement>(':scope > [data-type="-2"]');
    const showAnswer = action.querySelector<HTMLElement>(':scope > [data-type="-1"]');
    const skip = action.querySelector<HTMLElement>(':scope > [data-type="-3"]');
    const spaces = [...action.querySelectorAll<HTMLElement>(":scope > .fn__space")];
    if (!pq || !showAnswer || !skip || spaces.length < 2) return;

    const ordered = moveBetween
      ? [pq, spaces[0], skip, spaces[1], showAnswer]
      : [pq, spaces[0], showAnswer, spaces[1], skip];
    if (ordered.every((element, index) => action.children[index] === element)) return;
    for (const element of ordered) action.append(element);
  }

  private appendNativeMoreItems(root: HTMLElement): void {
    const menuElement = this.options.documentRef.querySelector<HTMLElement>("#commonMenu");
    if (!menuElement || menuElement.classList.contains("fn__none")) return;
    if (menuElement.querySelector('[data-id^="damophus-flashcard-more-"]')) return;
    const menu = (window.siyuan as unknown as {
      menus?: { menu?: { addItem?: (item: IMenu) => void; addSeparator?: () => void } };
    }).menus?.menu;
    if (!menu?.addItem) return;
    menu.addItem({ id: "damophus-flashcard-more-separator", type: "separator" });
    menu.addItem({ id: "damophus-flashcard-more-locate", icon: "iconFocus", label: "定位原块", click: async () => {
      const card = await this.resolveCard(root);
      if (card) await this.options.locate(card);
    } });
    menu.addItem({ id: "damophus-flashcard-more-unregister", icon: "iconCloseRound", label: "取消登记", click: async () => {
      const card = await this.resolveCard(root);
      if (card && await this.options.unregister(card)) {
        root.querySelector<HTMLButtonElement>('.card__action:not(.fn__none) button[data-type="-3"]')?.click();
      }
    } });
    menu.addItem({
      id: "damophus-flashcard-more-priority",
      type: "submenu",
      icon: "iconSort",
      label: "设置优先级",
      submenu: PRIORITIES.map((option) => ({
        icon: "iconSort",
        label: option.label,
        click: async () => {
          const card = await this.resolveCard(root);
          if (!card) return;
          const status = await this.options.setPriority(card, option.value);
          showMessage(
            status === "pending"
              ? `当前卡片的 ${priorityTag(option.value)} 标签保存失败`
              : `当前卡片优先级已调整为 ${priorityTag(option.value)}`,
            4000,
            status === "pending" ? "error" : "info",
          );
        },
      })),
    });
    const rendererEnabled = this.options.isRendererOverrideEnabled();
    menu.addItem({
      id: "damophus-flashcard-more-renderer",
      icon: rendererEnabled ? "iconEye" : "iconEyeoff",
      label: rendererEnabled ? "关闭按卡片 renderer" : "启用按卡片 renderer",
      click: () => void this.options.toggleRendererOverride(),
    });
    menu.addItem({ id: "damophus-flashcard-more-workbench", icon: "iconSettings", label: "打开工作台", click: () => this.options.openWorkbench() });
    menu.addItem({ id: "damophus-flashcard-more-settings-separator", type: "separator" });
    const settings = this.options.getSettings();
    const tools: Array<[ReviewToolbarKey, string]> = [
      ["locate", "定位原块"],
      ["unregister", "取消登记"],
      ["priority", "优先级"],
      ["renderer", "按卡片 renderer"],
      ["workbench", "打开工作台"],
      ["filter", "原生筛选"],
      ["fullscreen", "原生全屏"],
    ];
    const toolState: Record<ReviewToolbarKey, boolean> = {
      locate: settings.locate,
      unregister: settings.unregister,
      priority: settings.priority,
      renderer: settings.renderer,
      workbench: settings.workbench,
      filter: settings.showFilter !== false,
      fullscreen: settings.showFullscreen !== false,
    };
    menu.addItem({ id: "damophus-flashcard-more-tools", type: "submenu", label: "工具栏按钮", submenu: tools.map(([key, label]) => ({
      icon: toolState[key] ? "iconCheck" : "iconUncheck",
      label: `${label}（${toolState[key] ? "已显示" : "已隐藏"}）`,
      click: () => void this.options.toggleToolVisibility(key),
    })) });
    const visibility = this.options.getRendererVisibility();
    const renderers: Array<[RendererVisibilityKey, string]> = [
      ["mark", "高亮 / 挖空"],
      ["list", "列表答案"],
      ["blockquote", "引述块答案"],
      ["callout", "提示块内容"],
      ["heading", "标题后续内容"],
      ["superBlock", "超级块内容"],
      ["tag", "标签"],
      ["topicRelations", "考点关系"],
    ];
    menu.addItem({ id: "damophus-flashcard-more-renderers", type: "submenu", label: "隐藏规则", submenu: renderers.map(([key, label]) => ({
      icon: visibility[key] ? "iconCheck" : "iconUncheck",
      label: `${label}（${visibility[key] ? "隐藏中" : "显示中"}）`,
      click: () => void this.options.toggleRendererVisibility(key),
    })) });
  }

  private createAction(
    toolbar: HTMLElement,
    action: ReviewToolbarAction,
    root: HTMLElement,
  ): Element {
    const mobile = toolbar.classList.contains("toolbar");
    const element = mobile
      ? this.options.documentRef.createElementNS("http://www.w3.org/2000/svg", "svg")
      : this.options.documentRef.createElement("button");
    element.setAttribute("class", mobile ? "toolbar__icon" : "block__icon block__icon--show");
    element.setAttribute("data-damophus-flashcard-tool", action.icon);
    element.setAttribute("data-damophus-flashcard-action", action.id);
    element.setAttribute("aria-label", action.label);
    element.setAttribute("title", action.label);
    if (mobile) {
      const use = this.options.documentRef.createElementNS("http://www.w3.org/2000/svg", "use");
      const iconHref = `#${action.icon}`;
      // SiYuan's mobile SVG templates still use the SVG 1.1 xlink form.
      use.setAttribute("href", iconHref);
      use.setAttributeNS("http://www.w3.org/1999/xlink", "xlink:href", iconHref);
      element.append(use);
    } else {
      element.innerHTML = `<svg><use href="#${action.icon}"></use></svg>`;
    }
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      const context: ReviewToolbarActionContext = {
        root,
        toolbar,
        trigger: element,
        documentRef: this.options.documentRef,
        resolveCard: () => this.resolveCard(root),
        click: (selector) => {
          const target = root.querySelector<HTMLElement>(selector);
          if (!target) return false;
          target.click();
          return true;
        },
      };
      void action.execute(context);
    });
    const filter = toolbar.querySelector('[data-type="filter"]');
    toolbar.insertBefore(element, filter ?? null);
    return element;
  }

  private openPriorityMenu(trigger: Element, card: RiffCardRecord): void {
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

import { Dialog, Menu, confirm, getActiveTab, getAllEditor, openMobileFileById, openTab, showMessage, type IEventBusMap, type IMenu, type IProtyle } from "siyuan";
import { mount, unmount } from "svelte";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { isMobileEntryFrontend } from "@/libs/plugin-entry-settings";
import { getLogger } from "@/libs/logger";
import { isMobile, plugin } from "@/utils";
import FlashcardSettings from "./FlashcardSettings.svelte";
import FlashcardResults from "./FlashcardResults.svelte";
import { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import { FlashcardRuntime } from "@/flashcard/runtime";
import { openDocumentFlow } from "@/flashcard/document-flow";
import type { FlashcardBlockRow, FlashcardGroup, FlashcardReviewScope, FlashcardRoot, FlashcardSettings as FlashcardSettingsConfig } from "@/flashcard/types";
import { convertSfpConfig, fetchSfpConfig } from "@/flashcard/sfp-migration";
import { priorityTag } from "@/flashcard/priority-tags";
import { NativePriorityControls, type ReviewToolbarKey } from "@/flashcard/native-priority-controls";
import { NativeReviewCounter, type ReviewPriorityBucket } from "@/flashcard/native-review-counter";
import { readReviewCardStats } from "@/flashcard/review-stats";
import type { DueCardsData, RiffCardRecord } from "@/flashcard/siyuan-adapter";
import { orderCardsByPriority } from "@/flashcard/priority-queue";
import { SiyuanMobileFlashcardSurfaceAdapter } from "@/flashcard/mobile-surface-adapter";

const log = getLogger("lets-flashcard");
const SETTINGS_TAB_TYPE = "damophus-flashcard-settings";
const BREADCRUMB_BUTTON_ID = "damophus-flashcard";
const BREADCRUMB_BUTTON_ICON = "iconRiffCard";

function settingsTabId(): string {
  return `${plugin.name}${SETTINGS_TAB_TYPE}`;
}

export default class FlashcardPlugin extends SubPluginBase {
  private readonly compat = new FlashcardRendererCompat();
  private readonly runtime = new FlashcardRuntime(
    (key) => this.getSetting(key),
    (key, value) => this.setSetting(key, value),
  );
  private entry?: UnifiedEntryPoint;
  private tabRegistered = false;
  private readonly mounted = new Map<HTMLElement, ReturnType<typeof mount>>();
  private dockApp?: ReturnType<typeof mount>;
  private mobileSettingsApp?: ReturnType<typeof mount>;
  private readonly mobileSurface = new SiyuanMobileFlashcardSurfaceAdapter(Dialog);
  private reviewScope?: { scope: FlashcardReviewScope; ids: Set<string> };
  private readonly reviewCards = new Map<string, RiffCardRecord>();
  private currentReviewCard?: RiffCardRecord;
  private menuEventsBound = false;
  private mobileNativeEntryBound = false;
  private mobileReviewButtonObserver?: MutationObserver;
  private breadcrumbButtonRegistered = false;
  private readonly reviewCounter = new NativeReviewCounter({
    documentRef: document,
    getStatsSettings: () => this.runtime.getSettings().reviewStats,
  });
  private readonly priorityControls = new NativePriorityControls({
    documentRef: document,
    getSettings: () => {
      const settings = this.runtime.getSettings();
      return {
        enabled: settings.reviewToolbarEnabled,
        locate: settings.reviewToolbarLocate,
        unregister: settings.reviewToolbarUnregister,
        priority: settings.reviewToolbarPriority,
        workbench: settings.reviewToolbarWorkbench,
        renderer: settings.reviewToolbarRenderer,
        skipBetween: settings.reviewToolbarSkipBetween,
        showExitFocus: settings.reviewToolbarShowExitFocus,
        showBrand: settings.reviewToolbarShowBrand,
      };
    },
    getCurrentCard: () => this.currentReviewCard,
    resolveCard: async (blockId, root) => {
      const cached = this.reviewCards.get(blockId);
      if (cached) return cached;
      const ids = [
        blockId,
        ...(root ? [...root.querySelectorAll<HTMLElement>("[data-node-id]")].map((node) => node.dataset.nodeId ?? "") : []),
      ].filter(Boolean);
      const cards = await this.runtime.adapter.getCardsByBlockIds(ids);
      const card = cards.find((candidate) => ids.includes(candidate.blockID));
      if (card) this.reviewCards.set(card.blockID, card);
      return card;
    },
    setPriority: (card, priority) => this.runtime.adapter.setPriority([card], priority),
    locate: (card) => this.locateCard(card),
    unregister: (card) => this.unregisterCard(card),
    openWorkbench: () => this.openSettings(),
    isRendererOverrideEnabled: () => this.runtime.getSettings().rendererInterceptionEnabled,
    toggleRendererOverride: async () => {
      const settings = this.runtime.getSettings();
      const enabled = !settings.rendererInterceptionEnabled;
      await this.runtime.saveSettings({ ...settings, rendererInterceptionEnabled: enabled });
      if (enabled) this.compat.install();
      else this.compat.uninstall();
      this.priorityControls.refresh();
      showMessage(enabled ? "已启用按卡片 renderer 渲染" : "已关闭按卡片 renderer 渲染", 3000, "info");
    },
    getRendererVisibility: () => this.runtime.getSettings().rendererVisibility,
    toggleRendererVisibility: async (key) => {
      const settings = this.runtime.getSettings();
      const rendererVisibility = { ...settings.rendererVisibility, [key]: !settings.rendererVisibility[key] };
      await this.runtime.saveSettings({ ...settings, rendererVisibility });
      this.compat.setVisibility(rendererVisibility);
      this.priorityControls.refresh();
      showMessage(`${key} 隐藏规则已${rendererVisibility[key] ? "启用" : "关闭"}`, 2500, "info");
    },
    toggleToolVisibility: async (key: ReviewToolbarKey) => {
      const settings = this.runtime.getSettings();
      const settingKeys: Record<ReviewToolbarKey, keyof FlashcardSettingsConfig> = {
        locate: "reviewToolbarLocate",
        unregister: "reviewToolbarUnregister",
        priority: "reviewToolbarPriority",
        renderer: "reviewToolbarRenderer",
        workbench: "reviewToolbarWorkbench",
      };
      const settingKey = settingKeys[key];
      await this.runtime.saveSettings({ ...settings, [settingKey]: !Boolean(settings[settingKey]) });
      this.priorityControls.refresh();
    },
  });

  private readonly handleCardRender = (blockId: string): void => {
    const card = this.reviewCards.get(blockId);
    if (!card) return;
    this.currentReviewCard = card;
    this.reviewCounter.setActiveCard(card.cardID);
    this.reviewCounter.updateCardStats(card.cardID, readReviewCardStats(card));
    this.compat.refresh();
    this.reviewCounter.refresh();
    this.priorityControls.refresh();
  };

  private readonly handleFlashcardAction = (
    event: CustomEvent<IEventBusMap["click-flashcard-action"]>,
  ): void => {
    const card = event.detail?.card as unknown as RiffCardRecord | undefined;
    if (!card?.blockID) return;
    this.reviewCards.set(card.blockID, card);
    this.currentReviewCard = card;
    this.reviewCounter.setActiveCard(card.cardID);
    this.reviewCounter.updateCardStats(card.cardID, readReviewCardStats(card));
    this.compat.refresh();
    this.reviewCounter.markReviewed(card.cardID, event.detail?.type ?? "");
    this.reviewCounter.refresh();
    this.priorityControls.refresh();
  };

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: SETTINGS_TAB_TYPE,
      init() {
        const element = this.element as HTMLElement;
        const app = owner.mountSettings(element);
        owner.mounted.set(element, app);
      },
      destroy() {
        const element = this.element as HTMLElement;
        const app = owner.mounted.get(element);
        if (app) void unmount(app);
        owner.mounted.delete(element);
      },
    });
  }

  override onload(): void {
    this.compat.onCardRender = this.handleCardRender;
    plugin.eventBus.on("click-flashcard-action", this.handleFlashcardAction);
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.on("open-menu-doctree", this.handleDocumentTreeMenu);
    this.menuEventsBound = true;
    this.bindMobileNativeReviewEntry();
    this.bindMobileReviewButtonLabel();
    this.reviewCounter.install();
    this.priorityControls.install();
    this.runtime.load();
    this.syncBreadcrumbButton();
    this.compat.setVisibility(this.runtime.getSettings().rendererVisibility);
    if (this.getSetting("rendererInterceptionEnabled") !== false) {
      const status = this.compat.install();
      if (!status.installed) log.warn("renderer-compat-unavailable", status.reason);
    }
    this.runtime.startAutomation();
    this.entry ??= new UnifiedEntryPoint({
      id: "flashcard.open",
      title: this.t("lets-flashcard.open"),
      icon: "iconRiffCard",
      execute: () => this.openConfiguredSurface(),
      executeFromActiveEditor: () => this.reviewFromActiveEditor(),
      executeWithEditor: (protyle) => this.reviewFromEditor(protyle),
      command: { langKey: "lets-flashcard.open" },
      dock: {
        config: {
          position: "LeftTop",
          size: { width: 420, height: 0 },
          icon: "iconRiffCard",
          title: this.t("lets-flashcard.displayName"),
          show: false,
        },
        data: {},
        type: "damophus-flashcard-dock",
        activation: "panel",
        init: (target) => {
          target.replaceChildren();
          this.dockApp = this.mountSettings(target);
        },
        destroy: (target) => {
          if (this.dockApp) void unmount(this.dockApp);
          this.dockApp = undefined;
          target.replaceChildren();
        },
      },
    }, plugin);
    this.entry.registerCommand();
    this.entry.registerDock();
    this.entry.setSurfaces(this.configuredSettingsEntrySurfaces());
    this.entry.setEnabled(true);
  }

  private configuredSettingsEntrySurfaces() {
    const dock = this.isEntryEnabled("dock");
    const tab = this.isEntryEnabled("tab");
    const hasTarget = tab || dock;
    return {
      menu: hasTarget && this.isEntryEnabled("menu"),
      command: hasTarget && this.isEntryEnabled("command"),
      dock,
    };
  }

  onDataChanged(): void {
    this.runtime.stopAutomation();
    this.runtime.startAutomation();
    this.entry?.setSurfaces(this.configuredSettingsEntrySurfaces());
    this.reviewCounter.refresh();
    this.priorityControls.refresh();
    this.syncBreadcrumbButton();
  }

  private syncBreadcrumbButton(): void {
    const api = plugin as unknown as {
      addBreadcrumbButton?: (options: {
        id: string;
        icon: string;
        title: string;
        callback: (event: MouseEvent, protyle: IProtyle) => void;
      }) => string;
      removeBreadcrumbButton?: (id: string) => void;
    };
    if (this.runtime.getSettings().showBreadcrumbReviewButton === false) {
      if (this.breadcrumbButtonRegistered) {
        api.removeBreadcrumbButton?.(BREADCRUMB_BUTTON_ID);
        this.breadcrumbButtonRegistered = false;
      }
      return;
    }
    if (typeof api.addBreadcrumbButton !== "function") {
      log.warn("breadcrumb-api-unavailable");
      return;
    }
    if (this.breadcrumbButtonRegistered) {
      api.removeBreadcrumbButton?.(BREADCRUMB_BUTTON_ID);
    }
    api.addBreadcrumbButton({
      id: BREADCRUMB_BUTTON_ID,
      icon: BREADCRUMB_BUTTON_ICON,
      title: this.t("lets-flashcard.reviewCurrentDocument"),
      callback: (_event, protyle) => this.reviewFromEditor(protyle),
    });
    this.breadcrumbButtonRegistered = true;
  }

  /** Shared settings surface used by the central DAMO settings page. */
  getSettingsRuntime(): FlashcardRuntime {
    return this.runtime;
  }

  reviewAllFromSettings(): void {
    void this.reviewAll();
  }

  private reviewFromActiveEditor(): void {
    const context = this.currentReviewContext();
    if (!context) {
      void this.reviewAll();
      return;
    }
    this.reviewDocumentScope(context.documentId, context.documentName);
  }

  private reviewFromEditor(protyle: IProtyle): void {
    const context = this.currentReviewContext(protyle);
    if (!context) {
      void this.reviewAll();
      return;
    }
    this.reviewDocumentScope(context.documentId, context.documentName);
  }

  private reviewDocumentScope(documentId: string, targetName: string): void {
    void this.reviewScopeCards({
      id: `document:${documentId}`,
      type: "document",
      targetId: documentId,
      targetName,
    });
  }

  reviewGroupFromSettings(group: FlashcardGroup): void {
    void this.reviewGroup(group);
  }

  reviewScopeFromSettings(scope: FlashcardReviewScope): void {
    void this.reviewScopeCards(scope);
  }

  async setScopePinnedFromSettings(scopeId: string, pinned: boolean): Promise<void> {
    await this.runtime.setScopePinned(scopeId, pinned);
  }

  async removeScopeHistoryFromSettings(scopeId: string): Promise<void> {
    await this.runtime.removeScopeHistory(scopeId);
  }

  locateCardFromSettings(card: RiffCardRecord): void {
    void this.locateCard(card);
  }

  unregisterCardFromSettings(card: RiffCardRecord): void {
    void this.unregisterCard(card);
  }

  setCardPriorityFromSettings(card: RiffCardRecord, priority: number): void {
    void this.runtime.adapter.setPriority([card], priority);
  }

  viewResultsFromSettings(group: FlashcardGroup, filtered: boolean): void {
    void this.viewResults(group, filtered);
  }

  openRawFromSettings(group: FlashcardGroup): void {
    this.openRawFlow(group);
  }

  openFilteredFromSettings(group: FlashcardGroup): void {
    void this.openFilteredFlow(group);
  }

  batchPriorityFromSettings(group: FlashcardGroup): void {
    void this.batchPriority(group);
  }

  importSfpFromSettings(): void {
    void this.importSfpConfig();
  }

  async updateCards(cardsData: {
    cards: RiffCardRecord[];
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
  }): Promise<typeof cardsData> {
    for (const card of cardsData.cards ?? []) {
      if (card?.blockID) this.reviewCards.set(card.blockID, card);
    }
    if (!Array.isArray(cardsData?.cards)) return cardsData;
    const scope = this.reviewScope;
    // Native Siyuan invokes updateCards again after a review round. The next
    // round may contain only newly-due cards, so none of their IDs need to be
    // present in the initial snapshot. Refresh the SQL boundary before
    // deciding whether this is a continuation; an unrelated native review
    // with no matching candidate releases the scope instead of showing blank.
    try {
      let cards = cardsData.cards;
      if (scope) {
        const rootIds = await this.runtime.provideScopeBlockIds(scope.scope, true);
        const allowed = new Set(rootIds);
        cards = cards.filter((card) => allowed.has(card.blockID));
        const overlapsInitial = cardsData.cards.some((card) => scope.ids.has(card.blockID));
        if (!overlapsInitial && cards.length === 0) {
          this.reviewScope = undefined;
          return this.orderCardsData(cardsData);
        }
      }
      const ordered = await this.orderCards(cards);
      return {
        cards: ordered,
        unreviewedCount: ordered.length,
        unreviewedNewCardCount: ordered.filter((card) => card.state === 0).length,
        unreviewedOldCardCount: ordered.filter((card) => card.state !== 0).length,
      };
    } catch (error) {
      if (!scope) {
        log.warn("priority-ordering-failed", error);
        return cardsData;
      }
      // A failed dynamic query must fail closed. Returning the native input
      // here would silently widen a scoped review to the whole deck.
      log.error("dynamic-review-query-failed", error);
      return { cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 };
    }
  }

  private async orderCardsData(cardsData: DueCardsData): Promise<DueCardsData> {
    const cards = await this.orderCards(cardsData.cards);
    return {
      ...cardsData,
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
    };
  }

  private async orderCards(cards: readonly RiffCardRecord[]): Promise<RiffCardRecord[]> {
    const roots = await this.runtime.adapter.inspectRoots(cards.map((card) => card.blockID), this.runtime.getSettings());
    this.compat.preloadMany(roots);
    const ordered = orderCardsByPriority(cards, roots, {
      randomInterleave: this.runtime.getSettings().randomInterleaveEnabled,
      samePriorityShuffle: this.runtime.getSettings().samePriorityShuffleEnabled,
    });
    const rootsById = new Map(roots.map((root) => [root.blockId, root]));
    this.reviewCounter.setQueue(ordered.map((card) => {
      const root = rootsById.get(card.blockID);
      const priority: ReviewPriorityBucket = root?.priority && !root.priorityConflict ? root.priority : "other";
      return { cardID: card.cardID, priority, stats: readReviewCardStats(card) };
    }));
    return ordered;
  }

  override onunload(): void {
    this.unbindMobileNativeReviewEntry();
    this.mobileReviewButtonObserver?.disconnect();
    this.mobileReviewButtonObserver = undefined;
    if (this.breadcrumbButtonRegistered) {
      (plugin as unknown as { removeBreadcrumbButton?: (id: string) => void }).removeBreadcrumbButton?.(BREADCRUMB_BUTTON_ID);
      this.breadcrumbButtonRegistered = false;
    }
    if (this.menuEventsBound) {
      plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
      plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
      plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
      this.menuEventsBound = false;
    }
    plugin.eventBus.off("click-flashcard-action", this.handleFlashcardAction);
    this.priorityControls.uninstall();
    this.reviewCounter.uninstall();
    this.compat.onCardRender = undefined;
    this.entry?.setEnabled(false);
    this.entry?.destroyDockContent();
    this.runtime.stopAutomation();
    this.compat.uninstall();
    this.reviewScope = undefined;
    this.currentReviewCard = undefined;
    this.reviewCards.clear();
    if (this.mobileSettingsApp) void unmount(this.mobileSettingsApp);
    this.mobileSettingsApp = undefined;
    for (const app of this.mounted.values()) void unmount(app);
    this.mounted.clear();
  }

  /**
   * SiYuan's mobile bottom-bar spaced-repetition action always calls the
   * global native entry. Intercept that one action so DAMO can preserve the
   * current document scope; the command/menu global actions remain unchanged.
   */
  private bindMobileNativeReviewEntry(): void {
    if (this.mobileNativeEntryBound || typeof document === "undefined") return;
    document.addEventListener("click", this.handleMobileNativeReviewEntry, true);
    this.mobileNativeEntryBound = true;
  }

  private bindMobileReviewButtonLabel(): void {
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
    this.mobileReviewButtonObserver = new MutationObserver(update);
    this.mobileReviewButtonObserver.observe(document.body, { childList: true, subtree: true });
  }

  private unbindMobileNativeReviewEntry(): void {
    if (!this.mobileNativeEntryBound || typeof document === "undefined") return;
    document.removeEventListener("click", this.handleMobileNativeReviewEntry, true);
    this.mobileNativeEntryBound = false;
  }

  private readonly handleMobileNativeReviewEntry = (event: MouseEvent): void => {
    if (!isMobileEntryFrontend()) return;
    const target = event.target instanceof Element
      ? event.target.closest<HTMLElement>("#mobileBottomBarSpacedRepetition")
      : null;
    if (!target) return;
    if (target.dataset.damophusGlobalReviewBypass === "true") {
      delete target.dataset.damophusGlobalReviewBypass;
      return;
    }
    const context = this.currentReviewContext();
    event.preventDefault();
    event.stopImmediatePropagation();
    if (!context) {
      showMessage("当前没有可识别的文档，未打开全局闪卡", 4000, "info");
      return;
    }
    this.reviewDocumentScope(context.documentId, context.documentName);
  };

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu") || (!this.isEntryEnabled("tab") && !this.isEntryEnabled("dock"))) return;
    const submenu: IMenu[] = [];
    if (this.isEntryEnabled("tab")) {
      submenu.push({
        icon: "iconRiffCard",
        label: this.t("lets-flashcard.openSettings"),
        click: () => this.openSettings(),
      });
    }
    submenu.push({
      icon: "iconRiffCard",
      label: this.t("lets-flashcard.reviewAll"),
      click: () => void this.reviewAll(),
    });
    const context = this.currentReviewContext();
    if (context) {
      submenu.push({ type: "separator" });
      submenu.push(this.scopeMenuItem("当前文档专项复习", "document", context.documentId, context.documentName));
      submenu.push(this.batchUnregisterScopeMenuItem("取消当前文档下所有闪卡登记", "document", context.documentId));
    }
    const groups = this.runtime.getEnabledGroups();
    if (groups.length > 0) submenu.push({ type: "separator" });
    for (const group of groups) {
      submenu.push({
        icon: "iconRiffCard",
        label: `复习：${group.name}`,
        click: () => void this.reviewGroup(group),
      });
    }
    // Keep one DAMO top-level entry. The row itself opens the settings
    // workbench; the existing review actions remain available as children.
    menu.addItem({
      icon: "iconRiffCard",
      label: this.t("lets-flashcard.displayName"),
      type: "submenu",
      submenu,
    });
  }

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu")) return;
    const ids = event.detail.blockElements
      .map((element) => element.dataset.nodeId ?? "")
      .filter(Boolean);
    if (ids.length === 0) return;
    event.detail.menu.addItem({
      icon: "iconRiffCard",
      label: ids.length > 1 ? "复习所选容器内闪卡" : "复习此容器内闪卡",
      click: () => void this.reviewContainerSelection(ids, ids.length > 1 ? "所选容器" : "当前容器"),
    });
    event.detail.menu.addItem({
      icon: "iconCloseRound",
      label: ids.length > 1 ? "取消所选容器内所有闪卡登记" : "取消此容器内所有闪卡登记",
      click: () => void this.unregisterContainers(ids, "所选容器"),
    });
  };

  private readonly handleDocumentTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu")) return;
    const documentId = event.detail.data.id;
    if (!documentId) return;
    event.detail.menu.addItem(this.contextScopeMenuItem(
      "document",
      [documentId],
      event.detail.data.name ?? documentId,
    ));
  };

  private readonly handleDocumentTreeMenu = (
    event: CustomEvent<IEventBusMap["open-menu-doctree"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu")) return;
    const isNotebook = event.detail.type === "notebook";
    const ids = [...event.detail.elements]
      .map((element) => isNotebook
        ? element.dataset.nodeId ?? element.dataset.url ?? element.parentElement?.dataset.url ?? ""
        : element.dataset.nodeId ?? "")
      .filter(Boolean);
    if (ids.length === 0) return;
    const targetName = ids.length > 1
      ? (isNotebook ? "所选笔记本" : "所选文档")
      : (isNotebook
        ? window.siyuan?.notebooks?.find((notebook) => notebook.id === ids[0])?.name
        : event.detail.elements[0]?.dataset.name) ?? ids[0];
    event.detail.menu.addItem(this.contextScopeMenuItem(
      isNotebook ? "notebook" : "document",
      ids,
      targetName,
    ));
  };

  private contextScopeMenuItem(
    type: "document" | "notebook",
    targetIds: readonly string[],
    targetName: string,
  ): IMenu {
    const singleTarget = targetIds.length === 1;
    const scopeLabel = type === "notebook"
      ? (singleTarget ? "当前笔记本专项复习" : "所选笔记本专项复习")
      : (singleTarget ? "当前文档专项复习" : "所选文档专项复习");
    const submenu: IMenu[] = [];
    if (this.isEntryEnabled("tab")) {
      submenu.push({
        icon: "iconRiffCard",
        label: this.t("lets-flashcard.openSettings"),
        click: () => this.openSettings(),
      });
    }
    submenu.push({
      icon: "iconRiffCard",
      label: this.t("lets-flashcard.reviewAll"),
      click: () => void this.reviewAll(),
    });
    submenu.push({ type: "separator" });
    submenu.push(singleTarget
      ? this.scopeMenuItem(scopeLabel, type, targetIds[0], targetName)
      : {
        icon: type === "notebook" ? "iconNotebook" : "iconFile",
        label: scopeLabel,
        click: () => void this.reviewDocumentTree(targetIds, type === "notebook", targetName),
      });
    submenu.push({
      icon: "iconCloseRound",
      label: type === "notebook"
        ? `取消${singleTarget ? "当前" : "所选"}笔记本下所有闪卡登记`
        : `取消${singleTarget ? "当前" : "所选"}文档下所有闪卡登记`,
      click: () => void this.unregisterDocumentTree(targetIds, type === "notebook"),
    });
    const groups = this.runtime.getEnabledGroups();
    if (groups.length > 0) submenu.push({ type: "separator" });
    for (const group of groups) {
      submenu.push({
        icon: "iconRiffCard",
        label: `复习：${group.name}`,
        click: () => void this.reviewGroup(group),
      });
    }
    return {
      icon: "iconRiffCard",
      label: this.t("lets-flashcard.displayName"),
      type: "submenu",
      submenu,
    };
  }

  private batchUnregisterScopeMenuItem(
    label: string,
    type: "document" | "notebook",
    targetId: string,
  ): IMenu {
    return {
      icon: "iconCloseRound",
      label,
      click: () => void this.unregisterDocumentTree([targetId], type === "notebook"),
    };
  }

  private async reviewContainerSelection(ids: readonly string[], label: string): Promise<void> {
    try {
      const blockIds = await this.runtime.adapter.getContainerBlockIds(ids);
      const due = await this.runtime.adapter.buildDueCardsData(
        this.runtime.getSettings().deckId,
        blockIds,
        this.runtime.getSettings().maxReviewCards,
      );
      if (due.cards.length === 0) {
        showMessage(`${label}没有可复习的已登记闪卡`, 5000, "info");
        return;
      }
      await this.openNativeReview(`复习：${label}`, due);
    } catch (error) {
      this.reportError("获取容器闪卡失败", error);
    }
  }

  private async reviewDocumentTree(ids: readonly string[], notebook: boolean, label: string): Promise<void> {
    try {
      const dueList = notebook
        ? await Promise.all(ids.map((id) => this.runtime.adapter.getNotebookDueCards(id)))
        : await Promise.all(ids.map((id) => this.runtime.adapter.getTreeDueCards(id)));
      const cards = [...new Map(dueList.flatMap((due) => due.cards).map((card) => [card.blockID, card])).values()]
        .slice(0, Math.max(1, this.runtime.getSettings().maxReviewCards));
      if (cards.length === 0) {
        showMessage(`${label}没有可复习的已登记闪卡`, 5000, "info");
        return;
      }
      const due: DueCardsData = {
        cards,
        unreviewedCount: cards.length,
        unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
        unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
      };
      await this.openNativeReview(`复习：${label}`, due);
    } catch (error) {
      this.reportError("获取文档范围闪卡失败", error);
    }
  }

  private scopeMenuItem(label: string, type: "document" | "notebook", targetId: string, targetName: string): IMenu {
    const scopes = [
      this.makeScope(type, targetId, targetName),
      ...this.runtime.getEnabledGroups().map((group) => this.makeScope(type, targetId, targetName, group)),
    ];
    return {
      icon: type === "document" ? "iconFile" : "iconNotebook",
      label,
      submenu: scopes.map((scope) => ({
        icon: "iconRiffCard",
        label: scope.groupName ? `应用分组：${scope.groupName}` : "全部到期卡",
        click: () => void this.reviewScopeCards(scope),
      })),
    };
  }

  private makeScope(type: "document" | "notebook", targetId: string, targetName: string, group?: FlashcardGroup): FlashcardReviewScope {
    return {
      id: `${type}:${targetId}:${group?.id ?? "all"}`,
      type,
      targetId,
      targetName,
      groupId: group?.id,
      groupName: group?.name,
    };
  }

  private currentReviewContext(protyle?: IProtyle): { documentId: string; documentName: string; notebookId?: string; notebookName?: string } | undefined {
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

  private mountSettings(target: HTMLElement): ReturnType<typeof mount> {
    target.classList.add("damophus-theme-root", "damophus-flashcard-settings-host", "h-full", "min-h-0");
    return mount(FlashcardSettings, {
      target,
      props: {
        runtime: this.runtime,
        onReviewGroup: (group: FlashcardGroup) => void this.reviewGroup(group),
        onReviewAll: () => void this.reviewAll(),
        onViewResults: (group: FlashcardGroup, filtered: boolean) => void this.viewResults(group, filtered),
        onOpenRaw: (group: FlashcardGroup) => this.openRawFlow(group),
        onOpenFiltered: (group: FlashcardGroup) => void this.openFilteredFlow(group),
        onBatchPriority: (group: FlashcardGroup) => void this.batchPriority(group),
        onImportSfp: () => this.importSfpConfig(),
        onReviewScope: (scope: FlashcardReviewScope) => void this.reviewScopeCards(scope),
        onLocateCard: (card: RiffCardRecord) => void this.locateCard(card),
        onUnregisterCard: (card: RiffCardRecord) => void this.unregisterCard(card),
        onSetCardPriority: (card: RiffCardRecord, priority: number) => void this.runtime.adapter.setPriority([card], priority),
        onSettingsChanged: () => {
          this.priorityControls.refresh();
          if (this.runtime.getSettings().rendererInterceptionEnabled) {
            this.compat.setVisibility(this.runtime.getSettings().rendererVisibility);
            const status = this.compat.install();
            if (!status.installed) log.warn("renderer-compat-unavailable", status.reason);
          } else {
            this.compat.uninstall();
          }
          this.syncBreadcrumbButton();
        },
      },
    });
  }

  private async importSfpConfig(): Promise<void> {
    try {
      const preview = convertSfpConfig(await fetchSfpConfig(), this.runtime.getSettings());
      const approved = await new Promise<boolean>((resolve) => {
        confirm(
          "导入 SFP 配置",
          `将导入 ${preview.categoryCount} 个分类、${preview.groupCount} 个 SQL 分组（${preview.enabledGroupCount} 个启用），覆盖当前闪卡分组设置。缓存不会导入，确认继续？`,
          () => resolve(true),
          () => resolve(false),
        );
      });
      if (!approved) return;
      await this.runtime.importSfpSettings(preview.settings);
      this.runtime.startAutomation();
      showMessage("SFP 配置已导入；缓存将按 DAMO 规则重新生成", 5000);
    } catch (error) {
      this.reportError("导入 SFP 配置失败", error);
    }
  }

  openSettings(): void {
    if (isMobileEntryFrontend()) {
      this.openMobileSettings();
      return;
    }
    void openTab({
      app: plugin.app,
      custom: {
        title: this.t("lets-flashcard.openSettings"),
        icon: "iconRiffCard",
        id: settingsTabId(),
      },
    });
  }

  private openMobileSettings(): void {
    this.mobileSurface.openSettings(
      this.t("lets-flashcard.openSettings"),
      (target) => { this.mobileSettingsApp = this.mountSettings(target); },
      () => {
        if (this.mobileSettingsApp) void unmount(this.mobileSettingsApp);
        this.mobileSettingsApp = undefined;
      },
    );
  }

  private openConfiguredSurface(): void {
    if (this.isEntryEnabled("tab")) {
      this.openSettings();
      return;
    }
    if (this.isEntryEnabled("dock")) this.entry?.openDock();
  }

  private async reviewAll(): Promise<void> {
    try {
      const due = await this.runtime.buildAllDueCards();
      await this.openNativeReview("到期：所有闪卡", due);
    } catch (error) {
      this.reportError("获取全部到期闪卡失败", error);
    }
  }

  private async reviewGroup(group: FlashcardGroup): Promise<void> {
    await this.reviewScopeCards({
      id: `group:${group.id}`,
      type: "group",
      targetName: group.name,
      groupId: group.id,
      groupName: group.name,
    });
  }

  private async reviewScopeCards(scope: FlashcardReviewScope): Promise<void> {
    try {
      const due = await this.runtime.buildScopeDueCards(scope, true);
      const label = scope.groupName && scope.type !== "group"
        ? `${scope.targetName} · ${scope.groupName}`
        : scope.groupName ?? scope.targetName;
      if (due.cards.length === 0 && (due.candidateCount ?? 0) > 0) {
        const registered = due.registeredCount;
        if (registered === 0) {
          await this.openScopeRegistration(scope, label, due);
          return;
        }
        showMessage(
          registered === undefined
            ? `范围“${label}”找到 ${due.candidateCount} 个闪卡根块，但无法确认 Riff 登记状态`
            : registered === 0
            ? `范围“${label}”找到 ${due.candidateCount} 个闪卡根块，但尚未登记到 Riff`
            : `范围“${label}”已登记 ${registered} 张卡，但当前没有到期卡`,
          7000,
          "info",
        );
      }
      if (due.cards.length === 0 && (due.candidateCount ?? 0) === 0) {
        showMessage(`范围“${label}”未找到符合条件的到期闪卡`, 5000, "info");
      }
      if (due.cards.length === 0) return;
      await this.runtime.recordScope(scope);
      await this.openNativeReview(`复习：${label}`, due, scope);
    } catch (error) {
      this.reportError(`获取复习范围“${scope.targetName}”失败`, error);
    }
  }

  private async openScopeRegistration(scope: FlashcardReviewScope, label: string, due: DueCardsData): Promise<void> {
    const ids = await this.runtime.provideScopeBlockIds(scope, true);
    const roots = await this.runtime.adapter.inspectRoots(ids, this.runtime.getSettings());
    const rows: FlashcardBlockRow[] = roots.map((root) => ({
      id: root.blockId,
      content: root.content,
      type: root.renderer,
      attributes: root.attributes,
    }));
    await this.openRegistrationResults({
      title: `${label} · 待登记闪卡`,
      rows,
      roots,
      due,
      onRegistered: async () => {
        await this.runtime.recordScope(scope);
        await this.reviewScopeCards(scope);
      },
    });
  }

  private async openRegistrationResults(options: {
    title: string;
    rows: FlashcardBlockRow[];
    roots: FlashcardRoot[];
    due?: DueCardsData;
    onRegistered: () => void | Promise<void>;
  }): Promise<void> {
    let app: ReturnType<typeof mount> | undefined;
    const dialog = new Dialog({
      title: options.title,
      content: '<div class="damophus-flashcard-results-host"></div>',
      width: "min(1000px, 94vw)",
      height: "min(760px, 84vh)",
      destroyCallback: () => { if (app) void unmount(app); },
    });
    const target = dialog.element.querySelector<HTMLElement>(".damophus-flashcard-results-host");
    if (!target) return;
    app = mount(FlashcardResults, {
      target,
      props: {
        title: options.title,
        rows: options.rows,
        roots: options.roots,
        due: options.due,
        filtered: true,
        canReview: false,
        onReview: () => undefined,
        onRegister: async () => {
          try {
            const ids = options.roots.map((root) => root.blockId);
            const approved = await new Promise<boolean>((resolve) => {
              confirm(
                "登记并开始复习",
                `预览包含 ${ids.length} 个卡片根块。登记并验证成功后将直接打开原生闪卡复习，确认继续？`,
                () => resolve(true),
                () => resolve(false),
              );
            });
            if (!approved) return;
            const result = await this.runtime.registerCards(ids);
            const pending = result.filter((entry) => entry.status === "pending").length;
            if (pending > 0) {
              showMessage(`${pending} 张闪卡登记或验证失败，请保留此窗口后重试`, 6000, "error");
              return;
            }
            showMessage(`已登记并验证 ${ids.length} 张闪卡，正在打开复习`, 4000, "info");
            dialog.destroy();
            await options.onRegistered();
          } catch (error) {
            this.reportError("登记闪卡并打开复习失败", error);
          }
        },
      },
    });
  }

  private async viewResults(group: FlashcardGroup, filtered: boolean): Promise<void> {
    try {
      const rows = await this.runtime.adapter.paginatedSql(group.sqlQuery);
      const roots = filtered
        ? await this.runtime.adapter.inspectRows(rows, this.runtime.getSettings())
        : [];
      const due = filtered
        ? await this.runtime.adapter.buildDueCardsData(this.runtime.getSettings().deckId, roots.map((root) => root.blockId), this.runtime.getSettings().maxReviewCards)
        : undefined;
      let app: ReturnType<typeof mount> | undefined;
      const dialog = new Dialog({
        title: `${group.name} · ${filtered ? "过滤结果" : "原始 SQL"}`,
        content: '<div class="damophus-flashcard-results-host"></div>',
        width: "min(1000px, 94vw)",
        height: "min(760px, 84vh)",
        destroyCallback: () => { if (app) void unmount(app); },
      });
      const target = dialog.element.querySelector<HTMLElement>(".damophus-flashcard-results-host");
      if (!target) return;
      app = mount(FlashcardResults, {
        target,
        props: {
          title: `${group.name} · ${filtered ? "过滤结果" : "原始 SQL"}`,
          rows,
          roots,
          due,
          filtered,
          onReview: () => {
            dialog.destroy();
            // Re-query after registration; the due snapshot was captured
            // before the user clicked "一键制卡并登记".
            void this.reviewGroup(group);
          },
          onRegister: async () => {
            const ids = roots.map((root) => root.blockId);
            const approved = await new Promise<boolean>((resolve) => {
              confirm(
                "登记闪卡",
                `预览包含 ${ids.length} 个卡片根块。确认调用 Riff 登记并保留已有调度状态？`,
                () => resolve(true),
                () => resolve(false),
              );
            });
            if (!approved) return;
            const result = await this.runtime.registerCards(ids);
            const pending = result.filter((entry) => entry.status === "pending").length;
            showMessage(pending === 0 ? `已登记 ${ids.length} 张闪卡` : `${pending} 张闪卡待制卡`, 5000, pending === 0 ? "info" : "error");
          },
        },
      });
    } catch (error) {
      this.reportError("查询闪卡结果失败", error);
    }
  }

  private openRawFlow(group: FlashcardGroup): void {
    openDocumentFlow("SQL", group.sqlQuery, `${group.name}-SQL查询`);
  }

  private async openFilteredFlow(group: FlashcardGroup): Promise<void> {
    try {
      const roots = await this.runtime.provideGroupBlockIds(group);
      if (roots.length === 0) {
        showMessage(`分组 "${group.name}" 未找到闪卡块`);
        return;
      }
      openDocumentFlow("IdList", roots, `${group.name}-闪卡块查询`);
    } catch (error) {
      this.reportError("打开过滤结果失败", error);
    }
  }

  private async batchPriority(group: FlashcardGroup): Promise<void> {
    try {
      const selected = window.prompt("输入优先级标签（P1、P2、P3 或 P4）", "P2")?.trim().toUpperCase();
      const priority = ({ P1: 100, P2: 75, P3: 50, P4: 25 } as Record<string, number>)[selected ?? ""];
      if (!priority) return;
      const preview = await this.runtime.previewBatchPriority(group, priority);
      if (preview.cards.length === 0) {
        showMessage(`分组 "${group.name}" 未找到对应的闪卡`);
        return;
      }
      const approved = await new Promise<boolean>((resolve) => {
        confirm(
          "批量设置优先级",
          `将对 ${preview.cards.length} 张卡设置优先级 ${priorityTag(preview.priority)}（${preview.priority}），并同步 Markdown 标签。该操作可能影响已有调度，确认继续？`,
          () => resolve(true),
          () => resolve(false),
        );
      });
      if (!approved) return;
      const result = await this.runtime.applyBatchPriority(group, priority);
      showMessage(`已处理 ${result.count} 张卡（${result.status === "pending" ? "待运行时同步" : "已提交"}）`, 5000, result.status === "pending" ? "error" : "info");
    } catch (error) {
      this.reportError("批量设置优先级失败", error);
    }
  }

  private async openNativeReview(title: string, due: DueCardsData, scope?: FlashcardReviewScope): Promise<void> {
    const orderedDue = await this.orderCardsData(due);
    for (const card of orderedDue.cards) this.reviewCards.set(card.blockID, card);
    this.currentReviewCard = orderedDue.cards[0];
    this.priorityControls.refresh();
    const roots = await this.runtime.adapter.inspectRoots(orderedDue.cards.map((card) => card.blockID), this.runtime.getSettings());
    this.compat.preloadMany(roots as Array<{ blockId: string; renderer: any }>);
    this.reviewScope = scope?.groupId
      ? { scope, ids: new Set(orderedDue.cards.map((card) => card.blockID)) }
      : undefined;
    const nativeScope = scope && !scope.groupId && scope.type !== "group" ? scope : undefined;
    if (isMobileEntryFrontend()) {
      this.openMobileNativeReview(nativeScope);
      return;
    }
    await openTab({
      app: plugin.app,
      custom: {
        title,
        icon: "iconRiffCard",
        id: "siyuan-card",
        data: {
          cardType: nativeScope?.type === "document" ? "doc" : nativeScope?.type ?? "all",
          id: nativeScope?.targetId ?? "",
          title,
          cardsData: orderedDue,
        },
      },
    });
    for (const delay of [0, 80, 250]) {
      window.setTimeout(() => this.compat.refresh(), delay);
    }
  }

  private openMobileNativeReview(scope?: FlashcardReviewScope): void {
    if (scope?.groupId || scope?.type === "group" || scope?.type === "notebook") {
      showMessage("移动端暂不支持按分组或笔记本打开自定义卡片队列，请先从当前文档复习", 5000, "info");
      return;
    }
    if (this.mobileSurface.openReview(scope)) return;
    showMessage(scope ? "移动端暂不支持按分组打开自定义卡片队列，请先从当前文档复习" : "未找到移动端闪卡入口", 5000, "info");
  }

  private async locateCard(card: RiffCardRecord): Promise<void> {
    if (isMobile) {
      openMobileFileById(plugin.app, card.blockID, ["cb-get-focus", "cb-get-scroll"]);
      return;
    }
    await openTab({
      app: plugin.app,
      doc: {
        id: card.blockID,
        zoomIn: true,
        action: ["cb-get-focus", "cb-get-scroll"],
      },
    });
  }

  private async unregisterCard(card: RiffCardRecord): Promise<boolean> {
    const approved = await this.confirmUnregister(
      "取消闪卡登记",
      "只从当前牌组移除这张闪卡，原笔记块和 DAMO 元数据会保留。是否继续查看最终确认？",
      "这会从当前牌组移除 1 张闪卡，但不会删除正文、IAL、优先级标签或复习内容。确认执行取消登记吗？",
    );
    if (!approved) return false;
    await this.runtime.adapter.removeCards(this.runtime.getSettings().deckId, [card.blockID]);
    this.reviewCards.delete(card.blockID);
    showMessage("已取消闪卡登记，原笔记块保持不变", 4000, "info");
    return true;
  }

  private async unregisterContainers(containerIds: readonly string[], label: string): Promise<void> {
    try {
      const candidates = await this.runtime.adapter.getContainerBlockIds(containerIds);
      const cards = await this.runtime.adapter.getCardsByBlockIds(candidates);
      await this.confirmAndUnregister(cards, label);
    } catch (error) {
      this.reportError("查询容器内闪卡失败", error);
    }
  }

  private async unregisterDocumentTree(ids: readonly string[], notebook: boolean): Promise<void> {
    try {
      const cards = notebook
        ? (await Promise.all(ids.map((id) => this.runtime.adapter.getNotebookCards(id))).then((all) => all.flat()))
        : (await Promise.all(ids.map((id) => this.runtime.adapter.getTreeCards(id))).then((all) => all.flat()));
      await this.confirmAndUnregister(cards, notebook ? "所选笔记本" : "所选文档");
    } catch (error) {
      this.reportError("查询文档范围闪卡失败", error);
    }
  }

  private async confirmAndUnregister(cards: readonly RiffCardRecord[], label: string): Promise<void> {
    const byBlockId = new Map(cards.map((card) => [card.blockID, card]));
    const selected = [...byBlockId.values()];
    if (selected.length === 0) {
      showMessage(`${label}中没有已登记的闪卡`, 4000, "info");
      return;
    }
    const approved = await this.confirmUnregister(
      "批量取消闪卡登记",
      `${label}中发现 ${selected.length} 张已登记闪卡。是否继续查看最终确认？`,
      `即将从思源原生牌组移除 ${selected.length} 张闪卡。正文、IAL、优先级标签和复习内容都会保留。确认执行批量取消登记吗？`,
    );
    if (!approved) return;
    await this.runtime.adapter.removeCards(this.runtime.getSettings().deckId, selected.map((card) => card.blockID));
    for (const card of selected) this.reviewCards.delete(card.blockID);
    if (selected.some((card) => card.blockID === this.currentReviewCard?.blockID)) {
      this.currentReviewCard = undefined;
    }
    this.priorityControls.refresh();
    showMessage(`已取消登记 ${selected.length} 张闪卡，原笔记块保持不变`, 5000, "info");
  }

  private async confirmUnregister(
    title: string,
    previewMessage: string,
    finalMessage: string,
  ): Promise<boolean> {
    const previewApproved = await new Promise<boolean>((resolve) => {
      confirm(title, previewMessage, () => resolve(true), () => resolve(false));
    });
    if (!previewApproved) return false;

    return new Promise<boolean>((resolve) => {
      confirm("最终确认取消登记", finalMessage, () => resolve(true), () => resolve(false));
    });
  }

  private reportError(message: string, error: unknown): void {
    log.error(message, error);
    showMessage(`${message}：${error instanceof Error ? error.message : String(error)}`, 7000, "error");
  }
}

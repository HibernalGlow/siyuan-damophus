import { Dialog, Menu, confirm, getActiveTab, getAllEditor, getAllTabs, openMobileFileById, openTab, showMessage, type IEventBusMap, type IMenu, type IProtyle } from "siyuan";
import { mount, unmount } from "svelte";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { isMobileEntryFrontend } from "@/libs/plugin-entry-settings";
import { getLogger } from "@/libs/logger";
import { isMobile, plugin } from "@/utils";
import { getHPathByID } from "@/api";
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
import { NativeReviewTimer } from "@/flashcard/native-review-timer";
import { readReviewCardStats } from "@/flashcard/review-stats";
import type {
  DueCardsData,
  FlashcardUnregisterAudit,
  FlashcardUnregisterScope,
  RiffCardRecord,
} from "@/flashcard/siyuan-adapter";
import { orderCardsByPriority } from "@/flashcard/priority-queue";
import { SiyuanMobileFlashcardSurfaceAdapter } from "@/flashcard/mobile-surface-adapter";
import {
  FsrsOptimizerLocalService,
  loadFsrsOptimizerAssets,
} from "@/flashcard/fsrs-optimizer-local-service";
import {
  buildFsrsTrainingDataset,
  parseFsrsWeights,
  type FsrsOptimizationResult,
} from "@/flashcard/fsrs-optimizer-protocol";
import { optimizeFsrsInPlugin } from "@/flashcard/fsrs-optimizer-internal";
import { applyFsrsWeights, previewFsrsWeights, type FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
import {
  appendFsrsWeightHistory,
  loadFsrsWeightHistory,
  type FsrsWeightHistoryEntry,
  type FsrsWeightHistoryStorage,
} from "@/flashcard/fsrs-weight-history";
import type { RiffReviewLogEntry } from "@/flashcard/review-log-export";
import type { OpenFlashcardDocument } from "@/flashcard/open-documents";

const log = getLogger("lets-flashcard");
const SETTINGS_TAB_TYPE = "damophus-flashcard-settings";
const BREADCRUMB_BUTTON_ID = "damophus-flashcard";
const BREADCRUMB_BUTTON_ICON = "iconRiffCard";

function settingsTabId(): string {
  return `${plugin.name}${SETTINGS_TAB_TYPE}`;
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
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
  private pendingExactReview?: DueCardsData;
  private readonly reviewCards = new Map<string, RiffCardRecord>();
  private currentReviewCard?: RiffCardRecord;
  private menuEventsBound = false;
  private mobileNativeEntryBound = false;
  private mobileReviewButtonObserver?: MutationObserver;
  private breadcrumbButtonRegistered = false;
  private optimizerService?: FsrsOptimizerLocalService;
  private readonly fsrsHistoryStorage: FsrsWeightHistoryStorage = {
    loadData: (storageName) => plugin.loadData(storageName),
    saveData: (storageName, content) => plugin.saveData(storageName, content),
  };
  private readonly reviewTimer = new NativeReviewTimer({
    getSettings: () => {
      const settings = this.runtime.getSettings();
      return {
        enabled: settings.reviewTimerEnabled,
        continueAfterAnswer: settings.reviewTimerContinueAfterAnswer,
        pauseOnBlur: settings.reviewTimerPauseOnBlur,
      };
    },
    onChange: () => this.reviewCounter.refresh(),
  });
  private readonly reviewCounter = new NativeReviewCounter({
    documentRef: document,
    getStatsSettings: () => this.runtime.getSettings().reviewStats,
    getTimerDisplay: () => this.reviewTimer.getDisplay(),
    onReviewSurfaceClosed: () => this.reviewTimer.stopSession(),
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
        showFilter: settings.reviewToolbarShowFilter,
        showFullscreen: settings.reviewToolbarShowFullscreen,
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
        filter: "reviewToolbarShowFilter",
        fullscreen: "reviewToolbarShowFullscreen",
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
    this.reviewTimer?.setActiveCard(card.cardID);
    this.reviewTimer?.markReviewSurfaceActive();
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
    this.reviewTimer?.handleAction(event.detail?.type ?? "", card.cardID);
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
    this.reviewTimer.installActivityTracking(
      window,
      document,
      (target) => target instanceof Element && Boolean(target.closest('[data-key="dialog-opencard"], .card__main')),
    );
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
    this.reviewTimer?.refresh();
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

  optimizeReviewLogFromSettings(entries: readonly RiffReviewLogEntry[]): Promise<{
    result: FsrsOptimizationResult;
    preview: FsrsWeightPreview;
  }> {
    return this.optimizeReviewLog(entries);
  }

  applyFsrsWeightsFromSettings(weights: number[]): Promise<boolean> {
    return this.confirmAndApplyFsrsWeights(weights);
  }

  getFsrsWeightsFromSettings(): number[] {
    try {
      return parseFsrsWeights(window.siyuan?.config?.flashcard?.weights);
    } catch {
      return [];
    }
  }

  loadFsrsHistoryFromSettings(): Promise<FsrsWeightHistoryEntry[]> {
    return loadFsrsWeightHistory(this.fsrsHistoryStorage);
  }

  undoFsrsWeightsFromSettings(entry: FsrsWeightHistoryEntry): Promise<boolean> {
    return this.confirmAndUndoFsrsWeights(entry);
  }

  async updateCards(cardsData: {
    cards: RiffCardRecord[];
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
  }): Promise<typeof cardsData> {
    const pendingExactReview = this.pendingExactReview;
    if (pendingExactReview) {
      this.pendingExactReview = undefined;
      for (const card of pendingExactReview.cards) this.reviewCards.set(card.blockID, card);
      this.reviewTimer?.ensureSession(pendingExactReview.cards[0]?.cardID);
      return pendingExactReview;
    }
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
      // Native review can be opened from SiYuan's own menu, bypassing
      // openNativeReview(). Start the timer from that callback as well, while
      // keeping subsequent round refreshes on the same session.
      this.reviewTimer?.ensureSession(ordered[0]?.cardID);
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

  private async orderCardsData(cardsData: DueCardsData, limit?: number): Promise<DueCardsData> {
    const cards = await this.orderCards(cardsData.cards, limit);
    return {
      ...cardsData,
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
    };
  }

  private async orderCards(cards: readonly RiffCardRecord[], limit?: number): Promise<RiffCardRecord[]> {
    const roots = await this.runtime.adapter.inspectRoots(cards.map((card) => card.blockID), this.runtime.getSettings());
    this.compat.preloadMany(roots);
    const ordered = orderCardsByPriority(cards, roots, {
      randomInterleave: this.runtime.getSettings().randomInterleaveEnabled,
      samePriorityShuffle: this.runtime.getSettings().samePriorityShuffleEnabled,
      reviewMode: this.nativeReviewMode(),
    });
    const limited = limit === undefined ? ordered : ordered.slice(0, Math.max(1, limit));
    const rootsById = new Map(roots.map((root) => [root.blockId, root]));
    this.reviewCounter.setQueue(limited.map((card) => {
      const root = rootsById.get(card.blockID);
      const priority: ReviewPriorityBucket = root?.priority && !root.priorityConflict ? root.priority : "other";
      return { cardID: card.cardID, priority, isNew: card.state === 0, stats: readReviewCardStats(card) };
    }));
    this.reviewTimer?.setQueue(limited.map((card) => card.cardID));
    return limited;
  }

  private nativeReviewMode(): 0 | 1 | 2 {
    const config = (window as Window & {
      siyuan?: { config?: { flashcard?: { reviewMode?: unknown } } };
    }).siyuan?.config?.flashcard?.reviewMode;
    const mode = Number(config);
    return mode === 1 || mode === 2 ? mode : 0;
  }

  override onunload(): void {
    this.reviewTimer?.stopSession();
    this.reviewTimer?.dispose();
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
    void this.optimizerService?.stop();
    this.optimizerService = undefined;
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
      submenu.push(this.documentUnregisterMenuItem([context.documentId], "当前文档"));
    }
    const groups = this.runtime.getEnabledGroups();
    if (groups.length > 0) submenu.push({ type: "separator" });
    for (const group of groups) {
      submenu.push({
        icon: "iconRiffCard",
        label: `检测：${group.name}`,
        click: () => void this.openMakeScope({
          id: `group:${group.id}`,
          type: "group",
          targetName: group.name,
          groupId: group.id,
          groupName: group.name,
        }),
      });
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
    const targetName = event.detail.data.name ?? documentId;
    for (const item of this.documentScopeMenuItems(documentId, targetName)) event.detail.menu.addItem(item);
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
    if (isNotebook) {
      event.detail.menu.addItem(this.contextScopeMenuItem("notebook", ids, targetName));
      return;
    }
    if (ids.length === 1) {
      for (const item of this.documentScopeMenuItems(ids[0], targetName)) event.detail.menu.addItem(item);
      return;
    }
    event.detail.menu.addItem({
      icon: "iconRiffCard",
      label: "复习所选文档闪卡",
      click: () => void this.reviewDocumentTree(ids, false, targetName),
    });
    event.detail.menu.addItem(this.documentUnregisterMenuItem(ids, "所选文档"));
  };

  private documentScopeMenuItems(documentId: string, targetName: string): IMenu[] {
    const scopes = [
      this.makeScope("document", documentId, targetName),
      ...this.runtime.getEnabledGroups().map((group) => this.makeScope("document", documentId, targetName, group)),
    ];
    return [
      ...scopes.flatMap((scope) => [
      {
        icon: "iconRiffCard",
        label: scope.groupName ? `制作当前文档闪卡 · ${scope.groupName}` : "制作当前文档闪卡 · 全部",
        click: () => void this.openMakeScope(scope),
      },
      {
        icon: "iconRiffCard",
        label: scope.groupName ? `复习当前文档闪卡 · ${scope.groupName}` : "复习当前文档闪卡 · 全部到期",
        click: () => void this.reviewScopeCards(scope),
      },
      ]),
      this.documentUnregisterMenuItem([documentId], "当前文档"),
    ];
  }

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
    submenu.push(type === "notebook"
      ? {
        icon: "iconCloseRound",
        label: `取消${singleTarget ? "当前" : "所选"}笔记本下所有闪卡登记`,
        click: () => void this.unregisterDocumentTree(targetIds, true, this.createUnregisterAudit("notebook")),
      }
      : this.documentUnregisterMenuItem(targetIds, singleTarget ? "当前文档" : "所选文档"));
    const groups = this.runtime.getEnabledGroups();
    if (groups.length > 0) submenu.push({ type: "separator" });
    for (const group of groups) {
      submenu.push({
        icon: "iconRiffCard",
        label: `检测：${group.name}`,
        click: () => void this.openMakeScope({
          id: `group:${group.id}`,
          type: "group",
          targetName: group.name,
          groupId: group.id,
          groupName: group.name,
        }),
      });
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

  private documentUnregisterMenuItem(targetIds: readonly string[], label: string): IMenu {
    return {
      icon: "iconCloseRound",
      label: `取消${label}闪卡登记`,
      click: () => this.openDocumentUnregisterDialog(targetIds, label),
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
      submenu: scopes.flatMap((scope) => [
        {
          icon: "iconRiffCard",
          label: scope.groupName ? `检测：${scope.groupName}` : "检测全部闪卡",
          click: () => void this.openMakeScope(scope),
        },
        {
          icon: "iconRiffCard",
          label: scope.groupName ? `应用分组：${scope.groupName}` : "全部到期卡",
          click: () => void this.reviewScopeCards(scope),
        },
      ]),
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

  private async listOpenDocuments(): Promise<OpenFlashcardDocument[]> {
    const activeContext = this.currentReviewContext();
    if (isMobile && activeContext?.documentId) {
      return [{
        documentId: activeContext.documentId,
        title: activeContext.documentName,
        path: await getHPathByID(activeContext.documentId).catch(() => activeContext.documentName),
        active: true,
      }];
    }
    const activeDocumentId = activeContext?.documentId;
    const seen = new Set<string>();
    const candidates = getAllTabs().flatMap((tab) => {
      const model = tab.model as unknown as { editor?: { protyle?: { block?: { rootID?: string } } } } | undefined;
      let documentId = model?.editor?.protyle?.block?.rootID;
      if (!documentId) {
        try {
          const initData = tab.headElement?.getAttribute("data-initdata");
          const parsed = initData ? JSON.parse(initData) as { instance?: string; rootId?: string; rootID?: string } : undefined;
          if (parsed?.instance === "Editor") documentId = parsed.rootId ?? parsed.rootID;
        } catch {
          // Restored tabs may contain malformed init data; skip their fallback ID.
        }
      }
      if (!documentId || !/^\d{14}-[a-z0-9]{7}$/u.test(documentId) || seen.has(documentId)) return [];
      seen.add(documentId);
      return [{ documentId, title: tab.title || documentId }];
    });
    return Promise.all(candidates.map(async ({ documentId, title }) => ({
      documentId,
      title,
      path: await getHPathByID(documentId).catch(() => title),
      active: documentId === activeDocumentId,
    })));
  }

  private mountSettings(target: HTMLElement): ReturnType<typeof mount> {
    target.classList.add("damophus-theme-root", "damophus-flashcard-settings-host", "h-full", "min-h-0");
    return mount(FlashcardSettings, {
      target,
      props: {
        runtime: this.runtime,
        onReviewGroup: (group: FlashcardGroup) => void this.reviewGroup(group),
        onMakeGroup: (group: FlashcardGroup) => void this.openMakeScope({
          id: `group:${group.id}`,
          type: "group",
          targetName: group.name,
          groupId: group.id,
          groupName: group.name,
        }),
        onReviewAll: () => void this.reviewAll(),
        onViewResults: (group: FlashcardGroup, filtered: boolean) => void this.viewResults(group, filtered),
        onOpenRaw: (group: FlashcardGroup) => this.openRawFlow(group),
        onOpenFiltered: (group: FlashcardGroup) => void this.openFilteredFlow(group),
        onBatchPriority: (group: FlashcardGroup) => void this.batchPriority(group),
        onImportSfp: () => this.importSfpConfig(),
        onReviewScope: (scope: FlashcardReviewScope) => void this.reviewScopeCards(scope),
        onMakeScope: (scope: FlashcardReviewScope) => void this.openMakeScope(scope),
        onLoadOpenDocuments: () => this.listOpenDocuments(),
        onLocateCard: (card: RiffCardRecord) => void this.locateCard(card),
        onUnregisterCard: (card: RiffCardRecord) => void this.unregisterCard(card),
        onSetCardPriority: (card: RiffCardRecord, priority: number) => void this.runtime.adapter.setPriority([card], priority),
        onOptimizeReviewLog: (entries: RiffReviewLogEntry[]) => this.optimizeReviewLog(entries),
        onApplyFsrsWeights: (weights: number[]) => this.confirmAndApplyFsrsWeights(weights),
        onGetFsrsWeights: () => this.getFsrsWeightsFromSettings(),
        onLoadFsrsHistory: () => this.loadFsrsHistoryFromSettings(),
        onUndoFsrsWeights: (entry: FsrsWeightHistoryEntry) => this.undoFsrsWeightsFromSettings(entry),
        onSettingsChanged: () => {
          this.reviewTimer?.refresh();
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

  private async optimizeReviewLog(entries: readonly RiffReviewLogEntry[]): Promise<{
    result: FsrsOptimizationResult;
    preview: FsrsWeightPreview;
  }> {
    const dataset = buildFsrsTrainingDataset(entries);
    if (this.runtime.getSettings().fsrsOptimizerMode === "internal") {
      const result = await optimizeFsrsInPlugin(dataset, { pluginName: plugin.name });
      return { result, preview: previewFsrsWeights(result.weights) };
    }
    const assets = await loadFsrsOptimizerAssets(plugin.name);
    this.optimizerService ??= new FsrsOptimizerLocalService();
    const result = await this.optimizerService.optimize(dataset, assets);
    return { result, preview: previewFsrsWeights(result.weights) };
  }

  private async confirmAndApplyFsrsWeights(weights: number[]): Promise<boolean> {
    const approved = await new Promise<boolean>((resolve) => {
      confirm(
        "应用 FSRS 参数",
        "将仅替换思源全局闪卡设置中的 19 项 FSRS 权重；保留率、最大间隔、卡片上限和制卡开关保持不变。确认写入并回读验证？",
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!approved) return false;
    const applied = await applyFsrsWeights(weights);
    await appendFsrsWeightHistory(this.fsrsHistoryStorage, {
      source: "optimizer",
      previous: applied.current,
      next: applied.optimized,
    });
    showMessage("FSRS 参数已写入并回读验证", 4000, "info");
    return true;
  }

  private async confirmAndUndoFsrsWeights(entry: FsrsWeightHistoryEntry): Promise<boolean> {
    const approved = await new Promise<boolean>((resolve) => {
      confirm(
        "撤销 FSRS 参数修改",
        "将恢复这条历史记录中的上一组 19 项权重，并回读验证。确认继续？",
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!approved) return false;
    const current = this.getFsrsWeightsFromSettings();
    if (current.length !== entry.next.length) throw new Error("当前 FSRS 参数不可用，无法撤销");
    const applied = await applyFsrsWeights(entry.previous);
    await appendFsrsWeightHistory(this.fsrsHistoryStorage, {
      source: "undo",
      previous: applied.current,
      next: applied.optimized,
    });
    showMessage("FSRS 参数已撤销并回读验证", 4000, "info");
    return true;
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

  private async reviewScopeCards(scope: FlashcardReviewScope, retryAfterRegistration = false): Promise<void> {
    try {
      let due = await this.runtime.buildScopeDueCards(scope, true);
      if (retryAfterRegistration && due.cards.length === 0 && (due.candidateCount ?? 0) > 0 && (due.registeredCount ?? 0) > 0) {
        for (const delay of [120, 300, 700]) {
          await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay));
          due = await this.runtime.buildScopeDueCards(scope, true);
          if (due.cards.length > 0) break;
        }
      }
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
        await this.reviewScopeCards(scope, true);
      },
    });
  }

  private async openMakeScope(scope: FlashcardReviewScope): Promise<void> {
    try {
      const settings = this.runtime.getSettings();
      const autoReviewAfterRegistration = settings.autoReviewAfterRegistration !== false;
      const label = scope.groupName && scope.type !== "group"
        ? `${scope.targetName} · ${scope.groupName}`
        : scope.groupName ?? scope.targetName;
      let rows: FlashcardBlockRow[];
      let roots: FlashcardRoot[];
      const group = scope.groupId
        ? this.runtime.getGroups().find((candidate) => candidate.id === scope.groupId)
        : undefined;
      if (group) {
        const inspection = await this.runtime.inspectGroupCandidates(group);
        if (scope.type === "group") {
          ({ rows, roots } = inspection);
        } else {
          const rootRows = await this.runtime.adapter.loadBlocks(inspection.roots.map((root) => root.blockId));
          const allowed = new Set(rootRows.filter((row) => scope.type === "document"
            ? row.id === scope.targetId || row.root_id === scope.targetId
            : row.box === scope.targetId,
          ).map((row) => row.id));
          roots = inspection.roots.filter((root) => allowed.has(root.blockId));
          rows = rootRows.filter((row) => allowed.has(row.id));
        }
      } else {
        const ids = await this.runtime.provideScopeBlockIds(scope);
        roots = await this.runtime.adapter.inspectRoots(ids, settings);
        rows = roots.map((root) => ({
          id: root.blockId,
          content: root.content,
          type: root.renderer,
          attributes: root.attributes,
        }));
      }
      if (roots.length === 0) {
        showMessage(`范围“${label}”未找到符合条件的闪卡根块`, 5000, "info");
        return;
      }
      await this.openRegistrationResults({
        title: `${label} · 制卡检测`,
        rows,
        roots,
        continueToReview: autoReviewAfterRegistration,
        onRegistered: async () => {
          await this.runtime.recordScope(scope);
          if (autoReviewAfterRegistration) await this.reviewScopeCards(scope, true);
        },
      });
    } catch (error) {
      this.reportError(`检测制卡范围“${scope.targetName}”失败`, error);
    }
  }

  private async openRegistrationResults(options: {
    title: string;
    rows: FlashcardBlockRow[];
    roots: FlashcardRoot[];
    due?: DueCardsData;
    continueToReview?: boolean;
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
            const continueToReview = options.continueToReview !== false;
            if (this.runtime.getSettings().confirmBeforeAutoRegister) {
              const approved = await new Promise<boolean>((resolve) => {
                confirm(
                  continueToReview ? "登记并开始复习" : "登记闪卡",
                  continueToReview
                    ? `预览包含 ${ids.length} 个卡片根块。登记并验证成功后将直接打开原生闪卡复习，确认继续？`
                    : `预览包含 ${ids.length} 个卡片根块。确认调用 Riff 登记并保留已有调度状态？`,
                  () => resolve(true),
                  () => resolve(false),
                );
              });
              if (!approved) return;
            }
            const result = await this.runtime.registerCards(ids);
            const pending = result.filter((entry) => entry.status === "pending").length;
            if (pending > 0) {
              showMessage(`${pending} 张闪卡登记或验证失败，请保留此窗口后重试`, 6000, "error");
              return;
            }
            showMessage(
              continueToReview ? `已登记并验证 ${ids.length} 张闪卡，正在打开复习` : `已登记并验证 ${ids.length} 张闪卡`,
              4000,
              "info",
            );
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
        ? await this.runtime.adapter.buildDueCardsData(
          this.runtime.getSettings().deckId,
          roots.map((root) => root.blockId),
          this.runtime.getSettings().maxReviewCards,
          this.runtime.getSettings().scopedReviewMode,
        )
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

  private async openNativeReview(_title: string, due: DueCardsData, scope?: FlashcardReviewScope): Promise<void> {
    const settings = this.runtime.getSettings();
    const orderedDue = await this.orderCardsData(due, settings.maxReviewCards);
    this.reviewTimer?.startSession(orderedDue.cards[0]?.cardID);
    for (const card of orderedDue.cards) this.reviewCards.set(card.blockID, card);
    this.currentReviewCard = orderedDue.cards[0];
    this.priorityControls.refresh();
    const roots = await this.runtime.adapter.inspectRoots(orderedDue.cards.map((card) => card.blockID), this.runtime.getSettings());
    this.compat.preloadMany(roots as Array<{ blockId: string; renderer: any }>);
    this.reviewScope = scope
      ? { scope, ids: new Set(orderedDue.cards.map((card) => card.blockID)) }
      : undefined;
    this.pendingExactReview = scope?.groupId && settings.scopedReviewMode === "exact"
      ? orderedDue
      : undefined;
    const mobile = isMobileEntryFrontend();
    const nativeScope = scope && !scope.groupId && scope.type !== "group" ? scope : undefined;
    const adapterScope = nativeScope?.type === "document"
      ? { type: nativeScope.type, targetId: nativeScope.targetId, targetName: nativeScope.targetName }
      : undefined;
    if (!this.mobileSurface.openReview(adapterScope, mobile)) {
      this.reviewTimer?.stopSession();
      this.reviewScope = undefined;
      this.pendingExactReview = undefined;
      showMessage("未找到思源原生闪卡浮窗入口", 5000, "error");
      return;
    }
    for (const delay of [0, 80, 250]) {
      window.setTimeout(() => this.compat.refresh(), delay);
    }
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
      "这会从当前牌组移除 1 张闪卡，保留正文和原有属性，并将优先级标签移到不可用命名空间。确认执行取消登记吗？",
    );
    if (!approved) return false;
    await this.runtime.adapter.removeCards(this.runtime.getSettings().deckId, [card.blockID]);
    this.reviewCards.delete(card.blockID);
    this.compat.forget([card.blockID]);
    this.compat.refresh();
    await this.runtime.adapter.markCardsUnregistered([card.blockID], this.createUnregisterAudit("card"));
    showMessage("已取消闪卡登记，原笔记块保持不变", 4000, "info");
    return true;
  }

  private async unregisterContainers(containerIds: readonly string[], label: string): Promise<void> {
    try {
      const candidates = await this.runtime.adapter.getContainerBlockIds(containerIds);
      const cards = await this.runtime.adapter.getCardsByBlockIds(candidates);
      await this.confirmAndUnregister(cards, label, this.createUnregisterAudit("container"));
    } catch (error) {
      this.reportError("查询容器内闪卡失败", error);
    }
  }

  private openDocumentUnregisterDialog(targetIds: readonly string[], label: string): void {
    const dialog = new Dialog({
      title: this.t("lets-flashcard.unregisterDialogTitle"),
      width: "min(460px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <label class="fn__flex fn__flex-1 fn__flex-center">
            <input type="checkbox" data-field="include-subdocuments">
            <span class="fn__space--left">${escapeHtml(this.t("lets-flashcard.unregisterIncludeSubdocuments"))}</span>
          </label>
          <label class="fn__flex fn__flex-1 fn__flex-center fn__space--top">
            <input type="checkbox" data-field="write-audit" checked>
            <span class="fn__space--left">${escapeHtml(this.t("lets-flashcard.unregisterWriteAudit"))}</span>
          </label>
          <div class="b3-label fn__space--top">${escapeHtml(this.t("lets-flashcard.unregisterAuditDescription"))}</div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel" type="button">${escapeHtml(this.t("lets-flashcard.cancel"))}</button>
          <button class="b3-button b3-button--text" data-action="unregister" type="button">${escapeHtml(this.t("lets-flashcard.unregisterConfirm"))}</button>
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
        ? this.createUnregisterAudit(include ? "document-tree" : "document")
        : undefined;
      dialog.destroy();
      void this.unregisterDocumentScope(targetIds, include, label, audit);
    });
  }

  private async unregisterDocumentScope(
    ids: readonly string[],
    includeSubdocuments: boolean,
    label: string,
    audit?: FlashcardUnregisterAudit,
  ): Promise<void> {
    try {
      const cards = (await Promise.all(ids.map((id) => this.runtime.adapter.getDocumentCards(id, includeSubdocuments))))
        .flat();
      await this.confirmAndUnregister(cards, label, audit);
    } catch (error) {
      this.reportError("查询文档范围闪卡失败", error);
    }
  }

  private async unregisterDocumentTree(
    ids: readonly string[],
    notebook: boolean,
    audit?: FlashcardUnregisterAudit,
  ): Promise<void> {
    try {
      const cards = notebook
        ? (await Promise.all(ids.map((id) => this.runtime.adapter.getNotebookCards(id))).then((all) => all.flat()))
        : (await Promise.all(ids.map((id) => this.runtime.adapter.getDocumentCards(id, true))).then((all) => all.flat()));
      await this.confirmAndUnregister(cards, notebook ? "所选笔记本" : "所选文档", audit);
    } catch (error) {
      this.reportError("查询文档范围闪卡失败", error);
    }
  }

  private async confirmAndUnregister(
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
    const approved = await this.confirmUnregister(
      "批量取消闪卡登记",
      `即将从思源原生牌组移除 ${selected.length} 张闪卡。正文和原有属性会保留，优先级标签会移到不可用命名空间。确认执行批量取消登记吗？`,
    );
    if (!approved) return;
    await this.runtime.adapter.removeCards(this.runtime.getSettings().deckId, selected.map((card) => card.blockID));
    for (const card of selected) this.reviewCards.delete(card.blockID);
    this.compat.forget(selected.map((card) => card.blockID));
    this.compat.refresh();
    await this.runtime.adapter.markCardsUnregistered(selected.map((card) => card.blockID), audit);
    if (selected.some((card) => card.blockID === this.currentReviewCard?.blockID)) {
      this.currentReviewCard = undefined;
    }
    this.priorityControls.refresh();
    showMessage(`已取消登记 ${selected.length} 张闪卡，原笔记块保持不变`, 5000, "info");
  }

  private async confirmUnregister(
    title: string,
    message: string,
  ): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      confirm(title, message, () => resolve(true), () => resolve(false));
    });
  }

  private createUnregisterAudit(scope: FlashcardUnregisterScope): FlashcardUnregisterAudit {
    return {
      lastUnregisteredAt: new Date().toISOString(),
      deckId: this.runtime.getSettings().deckId,
      scope,
    };
  }

  private reportError(message: string, error: unknown): void {
    log.error(message, error);
    showMessage(`${message}：${error instanceof Error ? error.message : String(error)}`, 7000, "error");
  }
}

import { Dialog, Menu, showMessage, openMobileFileById, openTab, type IEventBusMap, type IMenu, type IProtyle } from "siyuan";
import { unmount } from "svelte";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { isMobileEntryFrontend } from "@/libs/plugin-entry-settings";
import { getLogger } from "@/libs/logger";
import { isMobile, plugin } from "@/utils";
import { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import { FlashcardRuntime } from "@/flashcard/runtime";
import type { FlashcardGroup, FlashcardReviewScope } from "@/flashcard/types";
import { NativeReviewCounter } from "@/flashcard/native-review-counter";
import { NativeReviewTimer } from "@/flashcard/native-review-timer";
import { readReviewCardStats } from "@/flashcard/review-stats";
import type {
  DueCardsData,
  FlashcardUnregisterAudit,
  FlashcardUnregisterScope,
  RiffCardRecord,
} from "@/flashcard/siyuan-adapter";
import { FlashcardCategoryModule } from "@/flashcard/category-module";
import { SiyuanMobileFlashcardSurfaceAdapter } from "@/flashcard/mobile-surface-adapter";
import { FsrsOptimizerLocalService } from "@/flashcard/fsrs-optimizer-local-service";
import {
  parseFsrsWeights,
  type FsrsOptimizationResult,
} from "@/flashcard/fsrs-optimizer-protocol";
import type { FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
import {
  loadFsrsWeightHistory,
  type FsrsWeightHistoryEntry,
  type FsrsWeightHistoryStorage,
} from "@/flashcard/fsrs-weight-history";
import type { RiffReviewLogEntry } from "@/flashcard/review-log-export";
import type { OpenFlashcardDocument } from "@/flashcard/open-documents";
import {
  makeScope as buildFlashcardScope,
  scopeActionLabel as flashcardScopeActionLabel,
  settingsTabId,
  SETTINGS_TAB_TYPE,
  type UnregisterProgressDialog,
} from "./plugin-utils";
import {
  actionCategory as buildActionCategory,
  buildBlockMenu,
  buildDocumentTitleMenu,
  buildDocumentTreeMenu,
  buildFlashcardMenu,
  cancelCategory as buildCancelCategory,
  contextScopeMenuItem as buildContextScopeMenuItem,
  documentScopeMenuItems as buildDocumentScopeMenuItems,
  documentUnregisterMenuItem as buildDocumentUnregisterMenuItem,
  registerReviewToolbarActions as registerFlashcardReviewToolbarActions,
  reviewCategory as buildReviewCategory,
  toggleRendererOverride as toggleFlashcardRendererOverride,
} from "./menu-builder";
import {
  bindMobileNativeReviewEntry as bindFlashcardMobileNativeReviewEntry,
  bindMobileReviewButtonLabel as bindFlashcardMobileReviewButtonLabel,
  handleMobileNativeReviewEntry as handleFlashcardMobileNativeReviewEntry,
  unbindMobileNativeReviewEntry as unbindFlashcardMobileNativeReviewEntry,
} from "./mobile-entry";
import {
  confirmAndUnregister as confirmAndUnregisterFlashcardCards,
  confirmUnregister as confirmFlashcardUnregister,
  createUnregisterAudit as createFlashcardUnregisterAudit,
  openDocumentUnregisterDialog as openFlashcardDocumentUnregisterDialog,
  openUnregisterProgressDialog as openFlashcardUnregisterProgressDialog,
  unregisterCard as unregisterFlashcardCard,
  unregisterContainers as unregisterFlashcardContainers,
  unregisterDocumentScope as unregisterFlashcardDocumentScope,
  unregisterDocumentTree as unregisterFlashcardDocumentTree,
} from "./unregister-flows";
import {
  confirmAndApplyFsrsWeights as confirmAndApplyFlashcardFsrsWeights,
  confirmAndUndoFsrsWeights as confirmAndUndoFlashcardFsrsWeights,
  importSfpConfig as importFlashcardSfpConfig,
  optimizeReviewLog as optimizeFlashcardReviewLog,
} from "./fsrs-flows";
import {
  currentReviewContext as readCurrentReviewContext,
  documentPathHighlights as readDocumentPathHighlights,
  listOpenDocuments as listOpenFlashcardDocuments,
  saveDocumentPathHighlights as persistDocumentPathHighlights,
} from "./review-context";
import {
  openRegistrationResultsDialog,
  viewResultsDialog,
  type RegistrationResultsOptions,
} from "./results-dialogs";
import {
  batchPriorityFlow,
  openFilteredFlow as openFilteredFlowCards,
  openMakeScopeFlow,
  openRawFlow as openRawSqlFlow,
  openScopeRegistrationFlow,
  reviewAllCards,
  reviewContainerSelectionFlow,
  reviewDocumentTreeFlow,
  reviewGroupCards,
  reviewScopeCardsFlow,
} from "./scope-review-flows";
import { createNativePriorityControls } from "./priority-toolbar";
import { mountFlashcardSettings } from "./settings-surface";
import {
  orderCardsDataQueue,
  orderCardsQueue,
  updateCardsQueue,
} from "./review-queue";

const log = getLogger("lets-flashcard");
const BREADCRUMB_BUTTON_ID = "damophus-flashcard";
const BREADCRUMB_BUTTON_ICON = "iconRiffCard";

type SettingsApp = ReturnType<typeof mountFlashcardSettings>;

export default class FlashcardPlugin extends SubPluginBase {
  public readonly compat = new FlashcardRendererCompat();
  public readonly runtime = new FlashcardRuntime(
    (key) => this.getSetting(key),
    (key, value) => this.setSetting(key, value),
  );
  public readonly categories = new FlashcardCategoryModule({
    load: async () => plugin.loadData("flashcard/categories.json"),
    save: async (value) => { await plugin.saveData("flashcard/categories.json", value); },
  });
  private disposeCategoryContribution?: () => void;
  private disposeCategoryToolbar?: () => void;
  private entry?: UnifiedEntryPoint;
  private tabRegistered = false;
  private readonly mounted = new Map<HTMLElement, SettingsApp>();
  private dockApp?: SettingsApp;
  private mobileSettingsApp?: SettingsApp;
  private readonly mobileSurface = new SiyuanMobileFlashcardSurfaceAdapter(Dialog);
  public reviewScope?: { scope: FlashcardReviewScope; ids: Set<string> };
  public pendingExactReview?: DueCardsData;
  public readonly reviewCards = new Map<string, RiffCardRecord>();
  public currentReviewCard: RiffCardRecord | undefined;
  private menuEventsBound = false;
  public mobileNativeEntryBound = false;
  public mobileReviewButtonObserver: MutationObserver | undefined;
  private breadcrumbButtonRegistered = false;
  private flashcardBooted = false;
  private readonly reviewToolbarActionDisposers: Array<() => void> = [];
  public optimizerService: FsrsOptimizerLocalService | undefined;
  public readonly fsrsHistoryStorage: FsrsWeightHistoryStorage = {
    loadData: (storageName) => plugin.loadData(storageName),
    saveData: (storageName, content) => plugin.saveData(storageName, content),
  };
  public readonly reviewTimer = new NativeReviewTimer({
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
  public readonly reviewCounter = new NativeReviewCounter({
    documentRef: document,
    getStatsSettings: () => this.runtime.getSettings().reviewStats,
    getTimerDisplay: () => this.reviewTimer.getDisplay(),
    onReviewSurfaceClosed: () => this.reviewTimer.stopSession(),
  });
  public readonly priorityControls = createNativePriorityControls(this);

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
    // `initializeEnabledPlugins` re-runs onload on every onDataChanged; without this
    // guard the second run dies in registerReviewToolbarActions on the already
    // registered `toolbar-action:*` contributions and skips the rest of the setup.
    if (this.flashcardBooted) return;
    this.flashcardBooted = true;
    this.registerReviewToolbarActions();
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
    void this.categories.load().then(() => {
      this.disposeCategoryContribution?.();
      this.disposeCategoryContribution = this.categories.registerContribution();
      this.disposeCategoryToolbar?.();
      this.disposeCategoryToolbar = this.categories.registerToolbarAction();
      this.priorityControls.refresh();
    }).catch((error) => log.warn("flashcard-category-load-failed", error));
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
    this.entry.setSurfaces(this.configuredSettingsEntrySurfaces());
    this.entry.registerCommand();
    this.entry.registerDock();
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

  public syncBreadcrumbButton(): void {
    const api = plugin as unknown as {
      addBreadcrumbButton?: (options: {
        id: string;
        icon: string;
        title: string;
        callback: (event: MouseEvent, protyle: IProtyle) => void;
      }) => string;
      removeBreadcrumbButton?: (id: string) => void;
    };
    const settings = this.runtime.getSettings();
    const shouldShow = isMobileEntryFrontend()
      ? settings.showMobileBreadcrumbReviewButton
      : settings.showDesktopBreadcrumbReviewButton;
    if (!shouldShow) {
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

  public reviewDocumentScope(documentId: string, targetName: string): void {
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
    return updateCardsQueue(this, cardsData);
  }

  public async orderCardsData(cardsData: DueCardsData, limit?: number): Promise<DueCardsData> {
    return orderCardsDataQueue(this, cardsData, limit);
  }

  public async orderCards(cards: readonly RiffCardRecord[], limit?: number): Promise<RiffCardRecord[]> {
    return orderCardsQueue(this, cards, limit);
  }

  override onunload(): void {
    this.flashcardBooted = false;
    this.disposeCategoryContribution?.();
    this.disposeCategoryContribution = undefined;
    this.disposeCategoryToolbar?.();
    this.disposeCategoryToolbar = undefined;
    for (const dispose of this.reviewToolbarActionDisposers.splice(0)) dispose();
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
    bindFlashcardMobileNativeReviewEntry(this);
  }

  private bindMobileReviewButtonLabel(): void {
    bindFlashcardMobileReviewButtonLabel(this);
  }

  private unbindMobileNativeReviewEntry(): void {
    unbindFlashcardMobileNativeReviewEntry(this);
  }

  public readonly handleMobileNativeReviewEntry = (event: MouseEvent): void => {
    handleFlashcardMobileNativeReviewEntry(this, event);
  };

  addMenuItem(menu: Menu): void {
    buildFlashcardMenu(this, menu);
  }

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    buildBlockMenu(this, event);
  };

  private readonly handleDocumentTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    buildDocumentTitleMenu(this, event);
  };

  private readonly handleDocumentTreeMenu = (
    event: CustomEvent<IEventBusMap["open-menu-doctree"]>,
  ): void => {
    buildDocumentTreeMenu(this, event);
  };

  public documentScopeMenuItems(documentId: string, targetName: string): IMenu[] {
    return buildDocumentScopeMenuItems(this, documentId, targetName);
  }

  private registerReviewToolbarActions(): void {
    // Defense in depth: re-registering must not collide with stale contributions.
    for (const dispose of this.reviewToolbarActionDisposers.splice(0)) dispose();
    this.reviewToolbarActionDisposers.push(...registerFlashcardReviewToolbarActions(this));
  }

  public async toggleRendererOverride(): Promise<void> {
    await toggleFlashcardRendererOverride(this);
  }

  public contextScopeMenuItem(
    type: "document" | "notebook",
    targetIds: readonly string[],
    targetName: string,
    providedScopes?: FlashcardReviewScope[],
  ): IMenu {
    return buildContextScopeMenuItem(this, type, targetIds, targetName, providedScopes);
  }

  public actionCategory(
    label: string,
    scopes: readonly FlashcardReviewScope[],
    action: "detect" | "apply",
  ): IMenu {
    return buildActionCategory(this, label, scopes, action);
  }

  public reviewCategory(
    context: { documentId: string; documentName: string } | undefined,
    groups: readonly FlashcardGroup[],
    notebookIds?: readonly string[],
    includeGlobal = true,
    includeGroups = true,
  ): IMenu {
    return buildReviewCategory(this, context, groups, notebookIds, includeGlobal, includeGroups);
  }

  public cancelCategory(
    targetIds: readonly string[],
    label: string,
    notebook = false,
  ): IMenu {
    return buildCancelCategory(this, targetIds, label, notebook);
  }

  public scopeActionLabel(scope: FlashcardReviewScope): string {
    return flashcardScopeActionLabel(scope);
  }

  public documentUnregisterMenuItem(targetIds: readonly string[], label: string): IMenu {
    return buildDocumentUnregisterMenuItem(this, targetIds, label);
  }

  public async reviewContainerSelection(ids: readonly string[], label: string): Promise<void> {
    await reviewContainerSelectionFlow(this, ids, label);
  }

  public async reviewDocumentTree(ids: readonly string[], notebook: boolean, label: string): Promise<void> {
    await reviewDocumentTreeFlow(this, ids, notebook, label);
  }

  public makeScope(type: "document" | "notebook", targetId: string, targetName: string, group?: FlashcardGroup): FlashcardReviewScope {
    return buildFlashcardScope(type, targetId, targetName, group);
  }

  public currentReviewContext(protyle?: IProtyle): { documentId: string; documentName: string; notebookId?: string; notebookName?: string } | undefined {
    return readCurrentReviewContext(protyle);
  }

  public async listOpenDocuments(): Promise<OpenFlashcardDocument[]> {
    return listOpenFlashcardDocuments();
  }

  public documentPathHighlights(): string[] {
    return readDocumentPathHighlights();
  }

  public async saveDocumentPathHighlights(value: string[]): Promise<void> {
    await persistDocumentPathHighlights(value);
  }

  private mountSettings(target: HTMLElement): SettingsApp {
    return mountFlashcardSettings(this, target);
  }

  private async optimizeReviewLog(entries: readonly RiffReviewLogEntry[]): Promise<{
    result: FsrsOptimizationResult;
    preview: FsrsWeightPreview;
  }> {
    return optimizeFlashcardReviewLog(this, entries);
  }

  private async confirmAndApplyFsrsWeights(weights: number[]): Promise<boolean> {
    return confirmAndApplyFlashcardFsrsWeights(this, weights);
  }

  private async confirmAndUndoFsrsWeights(entry: FsrsWeightHistoryEntry): Promise<boolean> {
    return confirmAndUndoFlashcardFsrsWeights(this, entry);
  }

  private async importSfpConfig(): Promise<void> {
    await importFlashcardSfpConfig(this);
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

  public async reviewAll(): Promise<void> {
    await reviewAllCards(this);
  }

  /** Manual entry for twin-card due reconciliation (see docs/flashcard-twin-sync-spec.md). */
  public async syncTwinCards(): Promise<void> {
    try {
      const outcome = await this.runtime.reconcileTwinCards();
      if (outcome.status === "disabled") {
        showMessage("孪生卡同步未开启：请在闪卡设置 → 基础与自动化中打开", 5000, "info");
        return;
      }
      const result = outcome.result;
      if (!result) {
        showMessage("孪生卡同步完成", 4000, "info");
        return;
      }
      if (result.aligned === 0 && result.twinGroups === 0) {
        showMessage(`孪生卡同步完成：无需要对齐的副本（已对齐 ${result.alreadyAligned} 张，未制卡跳过 ${result.unregistered} 张）`, 5000, "info");
        return;
      }
      showMessage(`孪生卡同步完成：对齐 ${result.aligned} 张 / ${result.twinGroups} 组（未制卡跳过 ${result.unregistered} 张${result.unreadable ? `，无法读取 ${result.unreadable} 张` : ""}）`, 6000, "info");
    } catch (error) {
      showMessage(`孪生卡同步失败：${error instanceof Error ? error.message : String(error)}`, 7000, "error");
    }
  }

  public async reviewGroup(group: FlashcardGroup): Promise<void> {
    await reviewGroupCards(this, group);
  }

  public async reviewScopeCards(scope: FlashcardReviewScope, retryAfterRegistration = false): Promise<void> {
    await reviewScopeCardsFlow(this, scope, retryAfterRegistration);
  }

  public async openScopeRegistration(scope: FlashcardReviewScope, label: string, due: DueCardsData): Promise<void> {
    await openScopeRegistrationFlow(this, scope, label, due);
  }

  public async openMakeScope(scope: FlashcardReviewScope): Promise<void> {
    await openMakeScopeFlow(this, scope);
  }

  public async openRegistrationResults(options: RegistrationResultsOptions): Promise<void> {
    await openRegistrationResultsDialog(this, options);
  }

  public async viewResults(group: FlashcardGroup, filtered: boolean): Promise<void> {
    await viewResultsDialog(this, group, filtered);
  }

  public openRawFlow(group: FlashcardGroup): void {
    openRawSqlFlow(group);
  }

  public async openFilteredFlow(group: FlashcardGroup): Promise<void> {
    await openFilteredFlowCards(this, group);
  }

  public async batchPriority(group: FlashcardGroup): Promise<void> {
    await batchPriorityFlow(this, group);
  }

  public async openNativeReview(_title: string, due: DueCardsData, scope?: FlashcardReviewScope): Promise<void> {
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

  public async locateCard(card: RiffCardRecord): Promise<void> {
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

  public async unregisterCard(card: RiffCardRecord): Promise<boolean> {
    return unregisterFlashcardCard(this, card);
  }

  public async unregisterContainers(containerIds: readonly string[], label: string): Promise<void> {
    await unregisterFlashcardContainers(this, containerIds, label);
  }

  public openDocumentUnregisterDialog(targetIds: readonly string[], label: string): void {
    openFlashcardDocumentUnregisterDialog(this, targetIds, label);
  }

  public async unregisterDocumentScope(
    ids: readonly string[],
    includeSubdocuments: boolean,
    label: string,
    audit?: FlashcardUnregisterAudit,
  ): Promise<void> {
    await unregisterFlashcardDocumentScope(this, ids, includeSubdocuments, label, audit);
  }

  public async unregisterDocumentTree(
    ids: readonly string[],
    notebook: boolean,
    audit?: FlashcardUnregisterAudit,
  ): Promise<void> {
    await unregisterFlashcardDocumentTree(this, ids, notebook, audit);
  }

  public async confirmAndUnregister(
    cards: readonly RiffCardRecord[],
    label: string,
    audit?: FlashcardUnregisterAudit,
  ): Promise<void> {
    await confirmAndUnregisterFlashcardCards(this, cards, label, audit);
  }

  public async confirmUnregister(
    title: string,
    message: string,
  ): Promise<boolean> {
    return confirmFlashcardUnregister(title, message);
  }

  public createUnregisterAudit(scope: FlashcardUnregisterScope): FlashcardUnregisterAudit {
    return createFlashcardUnregisterAudit(this, scope);
  }

  public openUnregisterProgressDialog(total: number): UnregisterProgressDialog {
    return openFlashcardUnregisterProgressDialog(this, total);
  }

  public reportError(message: string, error: unknown): void {
    log.error(message, error);
    showMessage(`${message}：${error instanceof Error ? error.message : String(error)}`, 7000, "error");
  }
}

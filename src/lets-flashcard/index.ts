import { Dialog, Menu, confirm, getActiveTab, getAllEditor, openMobileFileById, openTab, showMessage, type IEventBusMap, type IMenu } from "siyuan";
import { mount, unmount } from "svelte";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { getLogger } from "@/libs/logger";
import { isMobile, plugin } from "@/utils";
import FlashcardSettings from "./FlashcardSettings.svelte";
import FlashcardResults from "./FlashcardResults.svelte";
import { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import { FlashcardRuntime } from "@/flashcard/runtime";
import { openDocumentFlow } from "@/flashcard/document-flow";
import type { FlashcardGroup, FlashcardReviewScope } from "@/flashcard/types";
import { convertSfpConfig, fetchSfpConfig } from "@/flashcard/sfp-migration";
import { priorityTag } from "@/flashcard/priority-tags";
import { NativePriorityControls } from "@/flashcard/native-priority-controls";
import type { DueCardsData, RiffCardRecord } from "@/flashcard/siyuan-adapter";
import { orderCardsByPriority } from "@/flashcard/priority-queue";

const log = getLogger("lets-flashcard");
const SETTINGS_TAB_TYPE = "damophus-flashcard-settings";

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
  private reviewScope?: { scope: FlashcardReviewScope; ids: Set<string> };
  private readonly reviewCards = new Map<string, RiffCardRecord>();
  private currentReviewCard?: RiffCardRecord;
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
        renderer: true,
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
  });

  private readonly handleCardRender = (blockId: string): void => {
    const card = this.reviewCards.get(blockId);
    if (!card) return;
    this.currentReviewCard = card;
    this.priorityControls.refresh();
  };

  private readonly handleFlashcardAction = (
    event: CustomEvent<IEventBusMap["click-flashcard-action"]>,
  ): void => {
    const card = event.detail?.card as unknown as RiffCardRecord | undefined;
    if (!card?.blockID) return;
    this.reviewCards.set(card.blockID, card);
    this.currentReviewCard = card;
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
    this.priorityControls.install();
    this.runtime.load();
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
    this.priorityControls.refresh();
  }

  /** Shared settings surface used by the central DAMO settings page. */
  getSettingsRuntime(): FlashcardRuntime {
    return this.runtime;
  }

  reviewAllFromSettings(): void {
    void this.reviewAll();
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
    return orderCardsByPriority(cards, roots, {
      randomInterleave: this.runtime.getSettings().randomInterleaveEnabled,
    });
  }

  override onunload(): void {
    plugin.eventBus.off("click-flashcard-action", this.handleFlashcardAction);
    this.priorityControls.uninstall();
    this.compat.onCardRender = undefined;
    this.entry?.setEnabled(false);
    this.entry?.destroyDockContent();
    this.runtime.stopAutomation();
    this.compat.uninstall();
    this.reviewScope = undefined;
    this.currentReviewCard = undefined;
    this.reviewCards.clear();
    for (const app of this.mounted.values()) void unmount(app);
    this.mounted.clear();
  }

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
      if (context.notebookId) {
        submenu.push(this.scopeMenuItem("当前笔记本专项复习", "notebook", context.notebookId, context.notebookName ?? context.notebookId));
      }
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
      click: () => this.openSettings(),
      submenu,
    });
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

  private currentReviewContext(): { documentId: string; documentName: string; notebookId?: string; notebookName?: string } | undefined {
    const activeId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    const activeModel = getActiveTab()?.model as { editor?: { protyle?: { block?: { rootID?: string } } } } | undefined;
    const editors = getAllEditor();
    const documentId = activeId ?? activeModel?.editor?.protyle?.block?.rootID ?? editors[0]?.protyle.block.rootID;
    if (!documentId) return undefined;
    const documentName = document.querySelector<HTMLInputElement>(
      `.protyle-background[data-node-id="${CSS.escape(documentId)}"] + .protyle-title input`,
    )?.value || documentId;
    const notebookId = editors.find((editor) => editor.protyle.block.rootID === documentId)?.protyle.notebookId;
    const notebook = window.siyuan?.notebooks?.find((item) => item.id === notebookId);
    return { documentId, documentName, notebookId, notebookName: notebook?.name };
  }

  private mountSettings(target: HTMLElement): ReturnType<typeof mount> {
    target.classList.add("damophus-theme-root", "h-full", "min-h-0");
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
            const status = this.compat.install();
            if (!status.installed) log.warn("renderer-compat-unavailable", status.reason);
          } else {
            this.compat.uninstall();
          }
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
    void openTab({
      app: plugin.app,
      custom: {
        title: this.t("lets-flashcard.openSettings"),
        icon: "iconRiffCard",
        id: settingsTabId(),
      },
    });
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
    const approved = await new Promise<boolean>((resolve) => {
      confirm(
        "取消闪卡登记",
        "只从当前牌组移除这张闪卡，保留原笔记块和 DAMO 元数据。确认继续？",
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!approved) return false;
    await this.runtime.adapter.removeCards(this.runtime.getSettings().deckId, [card.blockID]);
    this.reviewCards.delete(card.blockID);
    showMessage("已取消闪卡登记，原笔记块保持不变", 4000, "info");
    return true;
  }

  private reportError(message: string, error: unknown): void {
    log.error(message, error);
    showMessage(`${message}：${error instanceof Error ? error.message : String(error)}`, 7000, "error");
  }
}

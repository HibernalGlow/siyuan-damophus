import { Dialog, Menu, confirm, openTab, showMessage, type IEventBusMap, type IMenu } from "siyuan";
import { mount, unmount } from "svelte";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { getLogger } from "@/libs/logger";
import { plugin } from "@/utils";
import FlashcardSettings from "./FlashcardSettings.svelte";
import FlashcardResults from "./FlashcardResults.svelte";
import { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import { FlashcardRuntime } from "@/flashcard/runtime";
import { openDocumentFlow } from "@/flashcard/document-flow";
import type { FlashcardGroup } from "@/flashcard/types";
import { convertSfpConfig, fetchSfpConfig } from "@/flashcard/sfp-migration";
import { priorityTag } from "@/flashcard/priority-tags";
import { NativePriorityControls } from "@/flashcard/native-priority-controls";
import type { DueCardsData, RiffCardRecord } from "@/flashcard/siyuan-adapter";

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
  private reviewScope?: { group: FlashcardGroup; ids: Set<string> };
  private readonly reviewCards = new Map<string, RiffCardRecord>();
  private currentReviewCard?: RiffCardRecord;
  private readonly priorityControls = new NativePriorityControls({
    documentRef: document,
    getCurrentCard: () => this.currentReviewCard,
    setPriority: (card, priority) => this.runtime.adapter.setPriority([card], priority),
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
    const scope = this.reviewScope;
    if (!scope || !Array.isArray(cardsData?.cards)) return cardsData;
    // Native Siyuan invokes updateCards again after a review round. The next
    // round may contain only newly-due cards, so none of their IDs need to be
    // present in the initial snapshot. Refresh the SQL boundary before
    // deciding whether this is a continuation; an unrelated native review
    // with no matching candidate releases the scope instead of showing blank.
    try {
      const roots = await this.runtime.provideGroupBlockIds(scope.group, true);
      const allowed = new Set(roots);
      const cards = cardsData.cards.filter((card) => allowed.has(card.blockID));
      const overlapsInitial = cardsData.cards.some((card) => scope.ids.has(card.blockID));
      if (!overlapsInitial && cards.length === 0) {
        this.reviewScope = undefined;
        return cardsData;
      }
      const renderers = await this.runtime.adapter.inspectRoots(cards.map((card) => card.blockID), this.runtime.getSettings());
      this.compat.preloadMany(renderers);
      return {
        cards,
        unreviewedCount: cards.length,
        unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
        unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
      };
    } catch (error) {
      // A failed dynamic query must fail closed. Returning the native input
      // here would silently widen a scoped review to the whole deck.
      log.error("dynamic-review-query-failed", error);
      return { cards: [], unreviewedCount: 0, unreviewedNewCardCount: 0, unreviewedOldCardCount: 0 };
    }
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
    try {
      // A tag group is user-edited content; always refresh it at the moment of
      // review so restoring a Markdown document cannot be hidden by stale cache.
      const due = await this.runtime.buildGroupDueCards(group, true);
      if (due.cards.length === 0 && (due.candidateCount ?? 0) > 0) {
        const registered = due.registeredCount;
        showMessage(
          registered === undefined
            ? `分组“${group.name}”找到 ${due.candidateCount} 个闪卡根块，但无法确认 Riff 登记状态`
            : registered === 0
            ? `分组“${group.name}”找到 ${due.candidateCount} 个闪卡根块，但尚未登记到 Riff，请先在过滤结果中一键制卡并登记`
            : `分组“${group.name}”已登记 ${registered} 张卡，但当前没有到期卡`,
          7000,
          "info",
        );
      }
      if (due.cards.length === 0 && (due.candidateCount ?? 0) === 0) {
        showMessage(`分组“${group.name}”未找到符合条件的闪卡根块`, 5000, "info");
      }
      if (due.cards.length === 0) return;
      await this.openNativeReview(`复习：${group.name}`, due, group);
    } catch (error) {
      this.reportError(`获取分组“${group.name}”失败`, error);
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

  private async openNativeReview(title: string, due: DueCardsData, group?: FlashcardGroup): Promise<void> {
    for (const card of due.cards) this.reviewCards.set(card.blockID, card);
    this.currentReviewCard = due.cards[0];
    this.priorityControls.refresh();
    const roots = await this.runtime.adapter.inspectRoots(due.cards.map((card) => card.blockID), this.runtime.getSettings());
    this.compat.preloadMany(roots as Array<{ blockId: string; renderer: any }>);
    this.reviewScope = group ? { group, ids: new Set(due.cards.map((card) => card.blockID)) } : undefined;
    await openTab({
      app: plugin.app,
      custom: {
        title,
        icon: "iconRiffCard",
        id: "siyuan-card",
        data: {
          cardType: "all",
          id: "",
          title,
          cardsData: due,
        },
      },
    });
  }

  private reportError(message: string, error: unknown): void {
    log.error(message, error);
    showMessage(`${message}：${error instanceof Error ? error.message : String(error)}`, 7000, "error");
  }
}

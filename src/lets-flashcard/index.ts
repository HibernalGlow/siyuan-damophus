import { Dialog, Menu, confirm, openTab, showMessage } from "siyuan";
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
  private reviewScope?: { group: FlashcardGroup; ids: Set<string> };

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
      execute: () => this.openSettings(),
      command: { langKey: "lets-flashcard.open" },
    }, plugin);
    this.entry.setSurfaces({ menu: false, dock: false, command: true });
    this.entry.setEnabled(true);
  }

  onDataChanged(): void {
    this.runtime.stopAutomation();
    this.runtime.startAutomation();
  }

  async updateCards(cardsData: {
    cards: Array<{ blockID: string; state?: number }>;
    unreviewedCount: number;
    unreviewedNewCardCount: number;
    unreviewedOldCardCount: number;
  }): Promise<typeof cardsData> {
    const scope = this.reviewScope;
    if (!scope || !Array.isArray(cardsData?.cards)) return cardsData;
    const hasScopeCard = cardsData.cards.some((card) => scope.ids.has(card.blockID));
    if (!hasScopeCard) {
      this.reviewScope = undefined;
      return cardsData;
    }
    const roots = await this.runtime.provideGroupBlockIds(scope.group, true);
    const allowed = new Set(roots);
    const cards = cardsData.cards.filter((card) => allowed.has(card.blockID));
    const renderers = await this.runtime.adapter.inspectRoots(cards.map((card) => card.blockID), this.runtime.getSettings());
    this.compat.preloadMany(renderers);
    return {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
    };
  }

  override onunload(): void {
    this.entry?.setEnabled(false);
    this.runtime.stopAutomation();
    this.compat.uninstall();
    this.reviewScope = undefined;
    for (const app of this.mounted.values()) void unmount(app);
    this.mounted.clear();
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconRiffCard",
      label: this.t("lets-flashcard.openSettings"),
      click: () => this.openSettings(),
    });
    menu.addItem({
      icon: "iconRiffCard",
      label: this.t("lets-flashcard.reviewAll"),
      click: () => void this.reviewAll(),
    });
    const groups = this.runtime.getEnabledGroups();
    if (groups.length > 0) menu.addSeparator();
    for (const group of groups) {
      menu.addItem({
        icon: "iconRiffCard",
        label: `复习：${group.name}`,
        click: () => void this.reviewGroup(group),
      });
    }
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
      },
    });
  }

  private openSettings(): void {
    void openTab({
      app: plugin.app,
      custom: {
        title: this.t("lets-flashcard.openSettings"),
        icon: "iconRiffCard",
        id: settingsTabId(),
      },
    });
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
      const due = await this.runtime.buildGroupDueCards(group);
      await this.openNativeReview(`复习：${group.name}`, due, group);
    } catch (error) {
      this.reportError(`获取分组“${group.name}”失败`, error);
    }
  }

  private async viewResults(group: FlashcardGroup, filtered: boolean): Promise<void> {
    try {
      const rows = await this.runtime.adapter.paginatedSql(group.sqlQuery);
      const roots = filtered
        ? await this.runtime.adapter.inspectRoots(rows.map((row) => row.id), this.runtime.getSettings())
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
          onReview: () => {
            dialog.destroy();
            if (due) void this.openNativeReview(`复习：${group.name}`, due, group);
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
      const preview = await this.runtime.previewBatchPriority(group);
      if (preview.cards.length === 0) {
        showMessage(`分组 "${group.name}" 未找到对应的闪卡`);
        return;
      }
      const approved = await new Promise<boolean>((resolve) => {
        confirm(
          "批量设置优先级",
          `将对 ${preview.cards.length} 张卡设置优先级 ${preview.priority}。该操作可能影响已有调度，确认继续？`,
          () => resolve(true),
          () => resolve(false),
        );
      });
      if (!approved) return;
      const result = await this.runtime.applyBatchPriority(group);
      showMessage(`已处理 ${result.count} 张卡（${result.status === "pending" ? "待运行时同步" : "已提交"}）`, 5000, result.status === "pending" ? "error" : "info");
    } catch (error) {
      this.reportError("批量设置优先级失败", error);
    }
  }

  private async openNativeReview(title: string, due: { cards: Array<{ blockID: string }>; unreviewedCount: number; unreviewedNewCardCount: number; unreviewedOldCardCount: number }, group?: FlashcardGroup): Promise<void> {
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

import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { isMobile, plugin } from "@/utils";
import { getHPathByID } from "@/api";
import { settings } from "@/settings";
import {
  Dialog,
  getActiveTab,
  getAllTabs,
  getAllEditor,
  openMobileFileById,
  openTab,
  Protyle,
  showMessage,
  type IEventBusMap,
  type Menu,
} from "siyuan";
import { mount, unmount } from "svelte";
import { getLogger } from "@/libs/logger";
import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import { launchBlockIdFromElements, validLaunchBlockId } from "./launch-target";
import { BroadcastPracticeSessionLeaseCoordinator } from "./session-host";
import { questionBankTabTarget, questionBankTabType } from "./tab-contract";
import { replaceQuestionBankTabs } from "./tab-replacement";
import { loadSourceBlockIdentity } from "./source/source-identity";
import { questionSourceOpenTarget } from "./source/source-navigation";
import { createQuestionBankMenuItem, focusWindow, oppositeWindow, type QuestionBankOpenAction } from "./open-actions";
import {
  ANSWER_MASK_STYLES,
  DEFAULT_ANSWER_MASK_STYLE,
  installSourceAnswerMask,
} from "./source/source-answer-mask";
import { isolateMobileDialogGestures } from "./workspace/mobile-dialog-scroll";
import { PersistentMobileDockPortal } from "./workspace/mobile-dock-portal";
import { isolateFloatingOutlinesFromMobileDock } from "./workspace/mobile-dock-outline-isolation";
import { mountQuestionBank } from "./workspace/question-bank-mount";
import { TinyBaseWarehouse } from "@/question-bank/adapters/tinybase/warehouse";
import { SiyuanPluginStoreFileIO } from "@/question-bank/adapters/tinybase/siyuan-file-io";
import { TinyBaseRuntime } from "./tinybase-runtime";
import { StoreSyncCoordinator, TINYBASE_READ_VIEW_UPDATED_EVENT } from "./sync-coordinator";
import { TinyBaseSiyuanCatalogRuntime } from "./tinybase-catalog-runtime";
import { bindMenuIdentity } from "@/libs/menu-identity";
import { openStatisticsCardPreview, type StatisticsCardPreviewRequest } from "./statistics/statistics-preview";
import type { OpenDocumentTab } from "@/libs/open-document-tabs";
import {
  questionProgressFromAggregate,
  setQuestionProgressLoader,
  type QuestionProgress,
} from "@/lets-topic-relations/topic-relations";
import {
  runQuestionIndexSync,
} from "@/question-bank/application/projection";
import {
  listQuestionIndexTargets,
  markQuestionIndexTarget,
  unmarkQuestionIndexTarget,
} from "@/question-bank/application/index-targets";

type PracticeCommand = "previous" | "next" | "pause";
const log = getLogger("lets-question-bank");
const PROGRESS_BLOCK_CHUNK_SIZE = 256;

function currentDeviceId(): string {
  const id = (window as Window & {
    siyuan?: {config?: {system?: {id?: unknown}}};
  }).siyuan?.config?.system?.id;
  if (typeof id !== "string" || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(id)) {
    throw new Error("SiYuan device identity is unavailable");
  }
  return id;
}

export default class QuestionBankPlugin extends SubPluginBase {
  private tabRegistered = false;
  private registered = false;
  private practiceCommandsRegistered = false;
  private listening = false;
  private dockApp?: ReturnType<typeof mount>;
  private mobileDockPortal?: PersistentMobileDockPortal<ReturnType<typeof mount>>;
  private openEntry?: UnifiedEntryPoint;
  private removeDockGestureIsolation?: () => void;
  private stopMobileDockOutlineIsolation?: () => void;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();
  readonly sessionLeases = new BroadcastPracticeSessionLeaseCoordinator();
  private tinybaseRuntime?: TinyBaseRuntime;
  private tinybaseCatalogRuntime?: TinyBaseSiyuanCatalogRuntime;
  private questionProgressCache = new Map<string, QuestionProgress | null>();
  private questionProgressLoad?: Promise<void>;
  private questionProgressThreshold?: number;
  private progressReadViewReady = false;
  storeSyncCoordinator?: StoreSyncCoordinator;
  private fallbackLute?: ReturnType<typeof window.Lute.New>;
  private stopSourceAnswerMask?: () => void;
  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    this.addLaunchMenuItem(event.detail.menu, launchBlockIdFromElements(event.detail.blockElements));
  };
  private readonly handleDatabaseIndexMenu = (
    event: CustomEvent<IEventBusMap["open-menu-av"]>,
  ): void => {
    const target = event.detail.element;
    const avId = target?.dataset.avId;
    const blockId = target?.dataset.nodeId;
    if (!avId || !blockId) return;
    event.detail.menu.addItem({
      type: "submenu",
      icon: "iconDatabase",
      label: this.t("lets-question-bank.indexMenu"),
      submenu: [
        {
          label: this.t("lets-question-bank.indexMenuSync"),
          click: () => void this.syncIndexDatabase(blockId, avId),
        },
        {
          label: this.t("lets-question-bank.indexMenuMark"),
          click: () => {
            void markQuestionIndexTarget(siyuanKernelClient, blockId, avId, this.projectionOptionsFromSettings())
              .then(() => showMessage(this.t("lets-question-bank.indexMarkedToast"), 3000, "info"))
              .catch((error: unknown) => showMessage(String(error), 5000, "error"));
          },
        },
        {
          label: this.t("lets-question-bank.indexMenuUnmark"),
          click: () => {
            void unmarkQuestionIndexTarget(siyuanKernelClient, blockId)
              .then(() => showMessage(this.t("lets-question-bank.indexUnmarkedToast"), 3000, "info"))
              .catch((error: unknown) => showMessage(String(error), 5000, "error"));
          },
        },
      ],
    });
  };
  private readonly handleDocumentTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    this.addLaunchMenuItem(event.detail.menu, validLaunchBlockId(event.detail.data.id));
  };
  private readonly handleDocumentTreeMenu = (
    event: CustomEvent<IEventBusMap["open-menu-doctree"]>,
  ): void => {
    if (event.detail.type === "notebook") return;
    this.addLaunchMenuItem(event.detail.menu, launchBlockIdFromElements(event.detail.elements));
  };
  private readonly handleSyncEnd = (): void => {
    this.storeSyncCoordinator?.handle({cmd: "sync-end"});
  };
  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === "visible") void this.storeSyncCoordinator?.request();
  };
  private readonly handleProgressReadViewUpdated = (): void => {
    this.questionProgressCache.clear();
    this.questionProgressThreshold = undefined;
    this.progressReadViewReady = false;
  };

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: questionBankTabType,
      init() {
        const element = this.element as HTMLElement;
        element.classList.add("damophus-question-bank-tab-host");
        if (owner.getSetting("autoPinTab")) {
          owner.pinTabInstance((this as unknown as { tab?: unknown }).tab);
        }
        const app = owner.mountQuestionBank(element, this.data?.documentId);
        owner.mountedTabs.set(element, app);
      },
      destroy() {
        const element = this.element as HTMLElement;
        const app = owner.mountedTabs.get(element);
        if (app) void unmount(app);
        owner.mountedTabs.delete(element);
      },
    });
  }

  override onload(): void {
    setQuestionProgressLoader((blockIds) => this.loadQuestionProgress(blockIds));
    this.storeSyncCoordinator ??= new StoreSyncCoordinator(
      {run: () => this.getTinyBaseRuntime().mergeAfterSync()},
      {
        onSuccess: (result) => {
          this.handleProgressReadViewUpdated();
          log.info("tinybase.post-sync-merge-completed", result);
          window.dispatchEvent(new CustomEvent(TINYBASE_READ_VIEW_UPDATED_EVENT, {detail: result}));
        },
        onFailure: (error) => log.warn("tinybase.post-sync-merge-failed", error),
      },
    );
    this.applySourceAnswerMaskSetting();
    if (!this.registered) {
      this.registered = true;
      this.openEntry = this.createOpenEntry();
      this.openEntry.registerCommand();
      this.openEntry.registerDock();
    }
    this.openEntry?.setSurfaces(this.configuredEntrySurfaces());
    this.openEntry?.setEnabled(true);
    if (this.isEntryEnabled("command")) this.registerPracticeCommands();
    else this.unregisterPracticeCommands();
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.on("open-menu-doctree", this.handleDocumentTreeMenu);
    plugin.eventBus.on("open-menu-av", this.handleDatabaseIndexMenu);
    plugin.eventBus.on("sync-end", this.handleSyncEnd);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
    window.addEventListener(TINYBASE_READ_VIEW_UPDATED_EVENT, this.handleProgressReadViewUpdated);
  }

  onDataChanged(): void {
    this.applySourceAnswerMaskSetting();
  }

  addMenuItem(menu: Menu): void {
    this.openEntry?.addMenuItem(menu);
  }

  private async loadQuestionProgress(
    blockIds: readonly string[],
  ): Promise<ReadonlyMap<string, QuestionProgress>> {
    const validBlockIds = [...new Set(blockIds.filter((id) => /^\d{14}-[a-z0-9]{7}$/u.test(id)))];
    if (validBlockIds.length === 0) return new Map();
    const threshold = Number(this.getSetting("reviewThreshold")) || 2;
    if (this.questionProgressThreshold !== undefined && this.questionProgressThreshold !== threshold) {
      this.questionProgressCache.clear();
    }
    this.questionProgressThreshold = threshold;
    await this.ensureQuestionProgress(validBlockIds);
    return new Map(validBlockIds.flatMap((blockId) => {
      const progress = this.questionProgressCache.get(blockId);
      return progress ? [[blockId, progress] as const] : [];
    }));
  }

  private async ensureQuestionProgress(blockIds: readonly string[]): Promise<void> {
    const missing = blockIds.filter((blockId) => !this.questionProgressCache.has(blockId));
    if (missing.length === 0) return;
    if (this.questionProgressLoad) {
      await this.questionProgressLoad;
      return this.ensureQuestionProgress(blockIds);
    }
    const load = (async () => {
      // Merge once before the first badge request, then reuse the in-memory view.
      if (!this.progressReadViewReady) {
        await this.getTinyBaseRuntime().mergeAfterSync().catch(() => undefined);
        this.progressReadViewReady = true;
      }
      const chunks: string[][] = [];
      for (let offset = 0; offset < missing.length; offset += PROGRESS_BLOCK_CHUNK_SIZE) {
        chunks.push(missing.slice(offset, offset + PROGRESS_BLOCK_CHUNK_SIZE));
      }
      const [attributeRows, aggregates] = await Promise.all([
        (await Promise.all(chunks.map((chunk) => siyuanKernelClient.request<Array<{
          block_id: string;
          attribute_value: string;
        }>>("/api/query/sql", {
          stmt: `SELECT block_id, value AS attribute_value FROM attributes WHERE name = 'custom-qb-id' AND block_id IN (${chunk
            .map((id) => `'${id}'`).join(", ")})`,
        })))).flat(),
        this.getTinyBaseRuntime().loadAggregates(),
      ]);
      const questionIdByBlockId = new Map(attributeRows.map((row) => [row.block_id, row.attribute_value]));
      const threshold = this.questionProgressThreshold ?? 2;
      missing.forEach((blockId) => {
        const questionId = questionIdByBlockId.get(blockId);
        const aggregate = questionId ? aggregates.get(questionId) : undefined;
        this.questionProgressCache.set(
          blockId,
          aggregate ? questionProgressFromAggregate(aggregate, threshold) : null,
        );
      });
    })();
    this.questionProgressLoad = load;
    try {
      await load;
    } finally {
      if (this.questionProgressLoad === load) this.questionProgressLoad = undefined;
    }
  }

  private applySourceAnswerMaskSetting(): void {
    this.stopSourceAnswerMask?.();
    this.stopSourceAnswerMask = undefined;
    if (settings.getBySpace("questionBank", "maskSourceAnswers") !== true) return;
    const storedStyle = settings.getBySpace("questionBank", "answerMaskStyle");
    const answerMaskStyle = ANSWER_MASK_STYLES.find((style) => style === storedStyle)
      ?? DEFAULT_ANSWER_MASK_STYLE;
    this.stopSourceAnswerMask = installSourceAnswerMask(answerMaskStyle);
  }

  private createOpenEntry(): UnifiedEntryPoint {
    const owner = this;
    return new UnifiedEntryPoint({
      id: "question-bank.open",
      title: this.t("lets-question-bank.open"),
      icon: "iconDatabase",
      execute: () => this.openConfiguredSurface(),
      menuItem: () => createQuestionBankMenuItem(
        this.t("lets-question-bank.open"),
        {
          current: this.t("lets-question-bank.openInCurrentArea"),
          opposite: this.t("lets-question-bank.openInOppositeArea"),
          sidebar: this.t("lets-question-bank.openInSidebar"),
        },
        (action) => this.openAt(action),
      ),
      command: {
        langKey: "lets-question-bank.commandOpen",
      },
      dock: {
        config: {
          position: "LeftTop",
          size: { width: 420, height: 0 },
          icon: "iconDatabase",
          title: this.t("lets-question-bank.displayName"),
          show: false,
        },
        data: { documentId: this.currentDocumentId() },
        type: "damophus-question-bank-dock",
        init(target) {
          if (isMobile) {
            owner.removeDockGestureIsolation = isolateMobileDialogGestures(target);
            owner.mobileDockPortal ??= new PersistentMobileDockPortal({
              mount: (host) => owner.mountQuestionBank(host, owner.currentDocumentId()),
              unmount: (app) => void unmount(app),
            });
            owner.mobileDockPortal.attach(target);
            owner.stopMobileDockOutlineIsolation?.();
            owner.stopMobileDockOutlineIsolation = isolateFloatingOutlinesFromMobileDock(target);
            return;
          }
          target.replaceChildren();
          owner.dockApp = owner.mountQuestionBank(target, owner.currentDocumentId());
        },
        destroy(target) {
          owner.removeDockGestureIsolation?.();
          owner.removeDockGestureIsolation = undefined;
          if (isMobile) {
            owner.stopMobileDockOutlineIsolation?.();
            owner.stopMobileDockOutlineIsolation = undefined;
            owner.mobileDockPortal?.detach(target);
            return;
          }
          if (owner.dockApp) void unmount(owner.dockApp);
          owner.dockApp = undefined;
        },
      },
    }, plugin);
  }

  override async onunload(): Promise<void> {
    setQuestionProgressLoader(undefined);
    this.openEntry?.setEnabled(false);
    this.unregisterPracticeCommands();
    this.stopSourceAnswerMask?.();
    this.stopSourceAnswerMask = undefined;
    this.removeDockGestureIsolation?.();
    this.removeDockGestureIsolation = undefined;
    this.stopMobileDockOutlineIsolation?.();
    this.stopMobileDockOutlineIsolation = undefined;
    this.openEntry?.destroyDockContent();
    this.mobileDockPortal?.dispose();
    this.mobileDockPortal = undefined;
    if (this.dockApp) void unmount(this.dockApp);
    this.dockApp = undefined;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
    plugin.eventBus.off("open-menu-av", this.handleDatabaseIndexMenu);
    plugin.eventBus.off("sync-end", this.handleSyncEnd);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    window.removeEventListener(TINYBASE_READ_VIEW_UPDATED_EVENT, this.handleProgressReadViewUpdated);
    this.questionProgressCache.clear();
    this.questionProgressLoad = undefined;
    this.questionProgressThreshold = undefined;
    this.progressReadViewReady = false;
    this.listening = false;
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
    await this.sessionLeases.releaseAll();
    this.storeSyncCoordinator?.close();
    this.storeSyncCoordinator = undefined;
  }

  private registerPracticeCommands(): void {
    if (this.practiceCommandsRegistered) return;
    plugin.addCommand({
      langKey: "lets-question-bank.commandPrevious",
      hotkey: "",
      callback: () => this.dispatchPracticeCommand("previous"),
    });
    plugin.addCommand({
      langKey: "lets-question-bank.commandNext",
      hotkey: "",
      callback: () => this.dispatchPracticeCommand("next"),
    });
    plugin.addCommand({
      langKey: "lets-question-bank.commandPause",
      hotkey: "",
      callback: () => this.dispatchPracticeCommand("pause"),
    });
    plugin.addCommand({
      langKey: "lets-question-bank.commandSyncIndex",
      hotkey: "",
      callback: () => void this.syncAllIndexDatabases(),
    });
    this.practiceCommandsRegistered = true;
  }

  private unregisterPracticeCommands(): void {
    if (!this.practiceCommandsRegistered) return;
    const langKeys = new Set([
      "lets-question-bank.commandPrevious",
      "lets-question-bank.commandNext",
      "lets-question-bank.commandPause",
      "lets-question-bank.commandSyncIndex",
    ]);
    for (let index = plugin.commands.length - 1; index >= 0; index -= 1) {
      if (langKeys.has(plugin.commands[index].langKey)) plugin.commands.splice(index, 1);
    }
    this.practiceCommandsRegistered = false;
  }

  private projectionOptionsFromSettings(): { pruneStale: boolean; includeUnanswered: boolean } {
    return {
      pruneStale: this.getSetting("projectionPruneStaleRows") === true,
      includeUnanswered: this.getSetting("projectionIncludeUnanswered") !== false,
    };
  }

  private reviewThresholdFromSettings(): number {
    return Number(this.getSetting("reviewThreshold")) || 2;
  }

  private async syncIndexDatabase(blockId: string, avId?: string): Promise<void> {
    await this.runIndexSync([{ blockId, avId, label: avId || blockId }]);
  }

  private async syncAllIndexDatabases(): Promise<void> {
    const targets: Array<{ blockId: string; avId?: string; label: string }> = [];
    const settingsTarget = String(this.getSetting("questionIndexProjectionBlockId") ?? "").trim();
    if (settingsTarget) targets.push({ blockId: settingsTarget, label: settingsTarget });
    try {
      const records = await listQuestionIndexTargets(siyuanKernelClient);
      for (const record of records) {
        if (targets.some((target) => target.blockId === record.blockId)) continue;
        targets.push({ blockId: record.blockId, avId: record.mark.avId || undefined, label: record.mark.avId || record.blockId });
      }
    } catch (error) {
      log.warn("question-bank.index-target-list-failed", error);
    }
    if (targets.length === 0) {
      showMessage(this.t("lets-question-bank.indexSyncNoTargets"), 4000, "error");
      return;
    }
    await this.runIndexSync(targets);
  }

  private async runIndexSync(targets: ReadonlyArray<{ blockId: string; avId?: string; label: string }>): Promise<void> {
    const outcomes = await runQuestionIndexSync(
      {
        client: siyuanKernelClient,
        loadCatalog: () => this.getTinyBaseCatalogRuntime().loadCatalog(),
        loadAggregates: () => this.getTinyBaseRuntime().loadAggregates(),
        loadBookmarks: () => this.getTinyBaseRuntime().loadBookmarks(),
        reviewThreshold: this.reviewThresholdFromSettings(),
      },
      targets.map((target) => ({ ...target, options: this.projectionOptionsFromSettings() })),
    );
    const okOutcomes = outcomes.filter((outcome) => outcome.ok);
    if (okOutcomes.length > 0) {
      const summary = okOutcomes.map((outcome) => `${outcome.label}: ${outcome.message}`).join("；");
      showMessage(summary, 6000, "info");
    }
    const failures = outcomes.filter((outcome) => !outcome.ok);
    for (const failure of failures) {
      showMessage(`${failure.label}: ${failure.message}`, 6000, "error");
    }
  }

  getTinyBaseRuntime(): TinyBaseRuntime {
    this.tinybaseRuntime ??= new TinyBaseRuntime(new TinyBaseWarehouse(
      new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
      currentDeviceId(),
    ));
    return this.tinybaseRuntime;
  }

  getTinyBaseCatalogRuntime(): TinyBaseSiyuanCatalogRuntime {
    this.tinybaseCatalogRuntime ??= new TinyBaseSiyuanCatalogRuntime(
      this.getTinyBaseRuntime(),
      siyuanKernelClient,
    );
    return this.tinybaseCatalogRuntime;
  }

  private dispatchPracticeCommand(command: PracticeCommand): void {
    const activeHost = document.querySelector<HTMLElement>(
      '.layout__wnd--active .damophus-question-bank-host[data-practice-active="true"]',
    ) ?? document.querySelector<HTMLElement>(
      '.damophus-question-bank-dialog[data-practice-active="true"]',
    );
    activeHost?.dispatchEvent(new CustomEvent("damophus-practice-command", { detail: command }));
  }

  private addLaunchMenuItem(menu: IEventBusMap["click-blockicon"]["menu"], blockId?: string): void {
    if (!blockId || !this.isEntryEnabled("contextMenu")) return;
    menu.addItem(bindMenuIdentity(createQuestionBankMenuItem(
      this.t("lets-question-bank.openFromBlock"),
      {
        current: this.t("lets-question-bank.openInCurrentArea"),
        opposite: this.t("lets-question-bank.openInOppositeArea"),
        sidebar: this.t("lets-question-bank.openInSidebar"),
      },
      (action) => {
        if (action === "sidebar") this.openEntry?.openDock();
        else if (action === "opposite") this.openAt(action, blockId);
        else void this.open(blockId);
      },
    ), { plugin: "siyuan-damophus", module: "questionBank" }));
  }

  private configuredEntrySurfaces() {
    const dock = this.isEntryEnabled("dock");
    const tab = this.isEntryEnabled("tab");
    const hasTarget = dock || tab;
    return {
      menu: hasTarget && this.isEntryEnabled("menu"),
      dock,
      command: hasTarget && this.isEntryEnabled("command"),
    };
  }

  private openConfiguredSurface(blockId = this.currentDocumentId()): void {
    if (this.isEntryEnabled("tab")) {
      this.open(blockId);
      return;
    }
    if (this.isEntryEnabled("dock")) {
      document.querySelector<HTMLElement>('.dock__item[data-type="damophus-question-bank-dock"]')?.click();
    }
  }

  private openAt(action: QuestionBankOpenAction, blockId = this.currentDocumentId()): void {
    if (action === "sidebar") {
      this.openEntry?.openDock();
      return;
    }
    if (action === "opposite") {
      const target = oppositeWindow();
      if (target) {
        focusWindow(target);
        void this.open(blockId);
        return;
      }
      void this.open(blockId, "right");
      return;
    }
    void this.open(blockId);
  }

  currentDocumentId(): string | undefined {
    const activeId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    return activeId ?? getAllEditor()[0]?.protyle?.block?.rootID;
  }

  async openDocumentTabs(): Promise<OpenDocumentTab[]> {
    if (isMobile) return [];
    const seen = new Set<string>();
    const candidates = getAllTabs().flatMap((tab) => {
      const model = tab.model as unknown as { editor?: { protyle?: { block?: { rootID?: string } } } } | undefined;
      let documentId = model?.editor?.protyle?.block?.rootID;
      if (!documentId) {
        try {
          const initData = tab.headElement?.getAttribute("data-initdata");
          const parsed = initData ? JSON.parse(initData) as { instance?: string; rootId?: string; rootID?: string } : undefined;
          if (parsed?.instance === "Editor") documentId = parsed.rootId ?? parsed.rootID;
        } catch { /* ignore malformed restored tab metadata */ }
      }
      if (!documentId || !/^\d{14}-[a-z0-9]{7}$/u.test(documentId) || seen.has(documentId)) return [];
      seen.add(documentId);
      return [{ documentId, title: tab.title || documentId }];
    });
    return Promise.all(candidates.map(async (tab) => ({
      ...tab,
      path: await getHPathByID(tab.documentId).catch(() => undefined),
    })));
  }

  private async open(blockId = this.currentDocumentId(), position?: "right" | "bottom"): Promise<void> {
    if (isMobile) {
      let app: ReturnType<typeof mount> | undefined;
      let removeGestureIsolation: (() => void) | undefined;
      const dialog = new Dialog({
        title: this.t("lets-question-bank.displayName"),
        content: '<div class="b3-dialog__content damophus-question-bank-dialog flex min-h-0 flex-1 overflow-hidden p-0"></div>',
        width: "94vw",
        height: "calc(100dvh - 24px)",
        // The question bank owns vertical scrolling. Prevent Siyuan's mobile
        // dialog gesture from interpreting a content swipe as close/dismiss.
        disableClose: true,
        destroyCallback: () => {
          removeGestureIsolation?.();
          if (app) void unmount(app);
        },
      });
      dialog.element.classList.add("damophus-question-bank-mobile-dialog");
      removeGestureIsolation = isolateMobileDialogGestures(dialog.element);
      const target = dialog.element.querySelector<HTMLElement>(".damophus-question-bank-dialog");
      if (!target) return;
      const closeDialog = () => dialog.destroy();
      app = this.mountQuestionBank(target, blockId, closeDialog, closeDialog);
      return;
    }
    let previousPinned: boolean | undefined;
    if (this.getSetting("replaceExistingTab") === true) {
      previousPinned = replaceQuestionBankTabs(getAllTabs(), questionBankTabType);
    }
    const openedTab = await openTab({
      app: plugin.app,
      position,
      custom: {
        icon: "iconDatabase",
        title: this.t("lets-question-bank.displayName"),
        ...questionBankTabTarget(plugin.name, blockId),
      },
    });
    if (previousPinned === true || (previousPinned === undefined && this.getSetting("autoPinTab"))) {
      this.pinTabInstance(openedTab);
    }
  }

  openStatisticsCardPreview(request: StatisticsCardPreviewRequest): void {
    openStatisticsCardPreview(request, Dialog, isMobile);
  }

  private pinTabInstance(target: unknown): void {
    if (!target || typeof target !== "object") return;
    const candidate = ("pin" in target && typeof (target as { pin?: unknown }).pin === "function")
      ? target as { pin: () => void; headElement?: Element }
      : ("tab" in target && (target as { tab?: unknown }).tab && typeof (target as { tab: { pin?: unknown } }).tab.pin === "function")
      ? (target as { tab: { pin: () => void; headElement?: Element } }).tab
      : ("parent" in target && (target as { parent?: unknown }).parent && typeof (target as { parent: { pin?: unknown } }).parent.pin === "function")
      ? (target as { parent: { pin: () => void; headElement?: Element } }).parent
      : undefined;

    if (!candidate || typeof candidate.pin !== "function") return;
    if (candidate.headElement?.classList.contains("item--pin")) return;
    try {
      candidate.pin();
    } catch (error) {
      log.warn("question-bank.pin-tab-failed", error);
    }
  }

  private activeDocumentRootId(): string | undefined {
    try {
      const model = getActiveTab()?.model as { editor?: Protyle } | undefined;
      return model?.editor?.protyle.block.rootID;
    } catch {
      return undefined;
    }
  }

  async openQuestionSource(blockId: string): Promise<void> {
    const navigationMode = this.getSetting("sourceNavigationMode");
    if (isMobile) {
      const target = questionSourceOpenTarget(blockId, undefined, undefined, navigationMode);
      openMobileFileById(plugin.app, blockId, target.doc.action);
      return;
    }
    let sourceRootId: string | undefined;
    try {
      sourceRootId = (await loadSourceBlockIdentity(siyuanKernelClient, blockId)).rootId;
    } catch (error) {
      log.warn("question-source.root-resolution-failed", { blockId, error });
    }
    await openTab({
      app: plugin.app,
      ...questionSourceOpenTarget(blockId, sourceRootId, this.activeDocumentRootId(), navigationMode),
    });
  }

  questionRenderer(markdown: string, inheritSourceStyles: boolean): string | undefined {
    const lute = getAllEditor().find((editor) => editor.protyle.lute)?.protyle.lute
      ?? this.getFallbackLute();
    if (!lute) return undefined;

    const template = document.createElement("template");
    template.innerHTML = lute.Md2BlockDOM(markdown);
    template.content.querySelectorAll(".protyle-attr, .protyle-action, .protyle-icons").forEach((element) => element.remove());
    template.content.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => {
      element.contentEditable = "false";
    });
    if (!inheritSourceStyles) {
      template.content.querySelectorAll<HTMLElement>("[style]").forEach((element) => {
        element.removeAttribute("style");
      });
    }
    return template.innerHTML;
  }

  private getFallbackLute(): ReturnType<typeof window.Lute.New> | undefined {
    if (this.fallbackLute) return this.fallbackLute;
    if (!window.Lute?.New) return undefined;
    const lute = window.Lute.New();
    lute.SetKramdownIAL(true);
    lute.SetTextMark(true);
    lute.SetHTMLTag2TextMark(true);
    lute.SetProtyleWYSIWYG(true);
    lute.SetBlockRef(true);
    lute.SetSuperBlock(true);
    lute.SetSanitize(true);
    this.fallbackLute = lute;
    return lute;
  }


  private mountQuestionBank(
    target: HTMLElement,
    documentId?: string,
    beforeOpenQuestionSource?: () => void,
    onClose?: () => void,
  ): ReturnType<typeof mount> {
    return mountQuestionBank(this, target, documentId, beforeOpenQuestionSource, onClose);
  }
}

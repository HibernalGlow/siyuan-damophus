import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { isMobile, plugin } from "@/utils";
import { appendBlock, deleteBlock, getBlockBreadcrumb, getChildBlocks, setBlockAttrs, sql } from "@/api";
import { settings } from "@/settings";
import {
  Dialog,
  getActiveTab,
  getAllEditor,
  openMobileFileById,
  openTab,
  Protyle,
  type IEventBusMap,
  type Menu,
} from "siyuan";
import { mount, unmount } from "svelte";
import pluginManifest from "../../plugin.json";
import QuestionBank from "./question-bank.svelte";
import { QuestionBankController } from "./controller";
import { getLogger } from "@/libs/logger";
import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import { launchBlockIdFromElements, validLaunchBlockId } from "./launch-target";
import { BroadcastPracticeSessionLeaseCoordinator } from "./session-host";
import { questionBankTabTarget, questionBankTabType } from "./tab-contract";
import { loadSourceBlockIdentity } from "./source-identity";
import { questionSourceOpenTarget } from "./source-navigation";
import { normalizeDurationComparisonPosition } from "./duration-comparison-position";
import {
  ANSWER_MASK_STYLES,
  DEFAULT_ANSWER_MASK_STYLE,
  installSourceAnswerMask,
} from "./source-answer-mask";
import {
  normalizeBreadcrumbPriority,
  normalizeBreadcrumbTextDisplay,
} from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import { isolateMobileDialogGestures } from "./mobile-dialog-scroll";
import { PersistentMobileDockPortal } from "./mobile-dock-portal";
import {
  EMPTY_SOURCE_EMBED_SQL,
  loadSourceEmbedRows,
  sourceEmbedBlockIds,
  sourceEmbedSubtreeIds,
  sourceEmbedSql,
  type SourceEmbedBlockRow,
  type SourceEmbedSection,
} from "./source-embed-query";
import {
  defocusProtyleEditor,
  enforceSourceBlockReadOnly,
  observeFocusedBlock,
  sourceBlockEditorMode,
  sourceBlockProtyleActions,
  sourceEmbedBlockAttributes,
} from "./source-embed-presentation";
import { SiyuanPluginStoreFileIO } from "@/question-bank/adapters/tinybase/siyuan-file-io";
import { TopicDictionaryStore } from "@/question-bank/adapters/siyuan/topic-dictionary";
import { TinyBaseWarehouse } from "@/question-bank/adapters/tinybase/warehouse";
import { TinyBaseRuntime } from "./tinybase-runtime";
import { StoreSyncCoordinator, TINYBASE_READ_VIEW_UPDATED_EVENT } from "./sync-coordinator";
import { TinyBaseSiyuanCatalogRuntime } from "./tinybase-catalog-runtime";
import { bindMenuIdentity } from "@/libs/menu-identity";
import { questionProgressFromAggregate, setQuestionProgressLoader } from "@/lets-topic-relations/topic-relations";

type PracticeCommand = "previous" | "next" | "pause";
const log = getLogger("lets-question-bank");

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
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();
  private readonly sessionLeases = new BroadcastPracticeSessionLeaseCoordinator();
  private tinybaseRuntime?: TinyBaseRuntime;
  private tinybaseCatalogRuntime?: TinyBaseSiyuanCatalogRuntime;
  private storeSyncCoordinator?: StoreSyncCoordinator;
  private fallbackLute?: ReturnType<typeof window.Lute.New>;
  private stopSourceAnswerMask?: () => void;
  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    this.addLaunchMenuItem(event.detail.menu, launchBlockIdFromElements(event.detail.blockElements));
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

  override registerModels(): void {
    if (this.tabRegistered) return;
    this.tabRegistered = true;
    const owner = this;
    plugin.addTab({
      type: questionBankTabType,
      init() {
        const element = this.element as HTMLElement;
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
    setQuestionProgressLoader(async (blockIds) => {
      const requested = new Set(blockIds);
      // Topic relations can be opened before SiYuan emits sync-end. Refresh the
      // read view here so historical events from other device shards are visible.
      await this.getTinyBaseRuntime().mergeAfterSync().catch(() => undefined);
      const [catalog, aggregates, attributeRows] = await Promise.all([
        this.getTinyBaseCatalogRuntime().loadCatalog().catch(() => []),
        this.getTinyBaseRuntime().loadAggregates(),
        blockIds.length === 0 ? Promise.resolve([]) : siyuanKernelClient.request<Array<{
          block_id: string;
          attribute_value: string;
        }>>("/api/query/sql", {
          stmt: `SELECT block_id, value AS attribute_value FROM attributes WHERE name = 'custom-qb-id' AND block_id IN (${blockIds
            .filter((id) => /^\d{14}-[a-z0-9]{7}$/u.test(id))
            .map((id) => `'${id}'`).join(", ")})`,
        }),
      ]);
      const threshold = Number(this.getSetting("reviewThreshold")) || 2;
      const questionIdByBlockId = new Map<string, string>([
        ...catalog
          .filter((question) => requested.has(question.blockId))
          .map((question) => [question.blockId, question.questionId] as const),
        ...attributeRows
          .filter((row) => requested.has(row.block_id) && row.attribute_value)
          .map((row) => [row.block_id, row.attribute_value] as const),
      ]);
      return new Map([...questionIdByBlockId.entries()].flatMap(([blockId, questionId]) => {
        const aggregate = aggregates.get(questionId);
        return aggregate ? [[blockId, questionProgressFromAggregate(aggregate, threshold)] as const] : [];
      }));
    });
    this.storeSyncCoordinator ??= new StoreSyncCoordinator(
      {run: () => this.getTinyBaseRuntime().mergeAfterSync()},
      {
        onSuccess: (result) => {
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
    plugin.eventBus.on("sync-end", this.handleSyncEnd);
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  onDataChanged(): void {
    this.applySourceAnswerMaskSetting();
  }

  addMenuItem(menu: Menu): void {
    this.openEntry?.addMenuItem(menu);
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
            return;
          }
          target.replaceChildren();
          owner.dockApp = owner.mountQuestionBank(target, owner.currentDocumentId());
        },
        destroy(target) {
          owner.removeDockGestureIsolation?.();
          owner.removeDockGestureIsolation = undefined;
          if (isMobile) {
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
    this.openEntry?.destroyDockContent();
    this.mobileDockPortal?.dispose();
    this.mobileDockPortal = undefined;
    if (this.dockApp) void unmount(this.dockApp);
    this.dockApp = undefined;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
    plugin.eventBus.off("sync-end", this.handleSyncEnd);
    document.removeEventListener("visibilitychange", this.handleVisibilityChange);
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
    this.practiceCommandsRegistered = true;
  }

  private unregisterPracticeCommands(): void {
    if (!this.practiceCommandsRegistered) return;
    const langKeys = new Set([
      "lets-question-bank.commandPrevious",
      "lets-question-bank.commandNext",
      "lets-question-bank.commandPause",
    ]);
    for (let index = plugin.commands.length - 1; index >= 0; index -= 1) {
      if (langKeys.has(plugin.commands[index].langKey)) plugin.commands.splice(index, 1);
    }
    this.practiceCommandsRegistered = false;
  }

  private getTinyBaseRuntime(): TinyBaseRuntime {
    this.tinybaseRuntime ??= new TinyBaseRuntime(new TinyBaseWarehouse(
      new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
      currentDeviceId(),
    ));
    return this.tinybaseRuntime;
  }

  private getTinyBaseCatalogRuntime(): TinyBaseSiyuanCatalogRuntime {
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
    menu.addItem(bindMenuIdentity({
      icon: "iconDatabase",
      label: this.t("lets-question-bank.openFromBlock"),
      click: () => this.openConfiguredSurface(blockId),
    }, { plugin: "siyuan-damophus", module: "questionBank" }));
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

  private currentDocumentId(): string | undefined {
    const activeId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    return activeId ?? getAllEditor()[0]?.protyle?.block?.rootID;
  }

  private open(blockId = this.currentDocumentId()): void {
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
    void openTab({
      app: plugin.app,
      custom: {
        icon: "iconDatabase",
        title: this.t("lets-question-bank.displayName"),
        ...questionBankTabTarget(plugin.name, blockId),
      },
    });
  }

  private activeDocumentRootId(): string | undefined {
    try {
      const model = getActiveTab()?.model as { editor?: Protyle } | undefined;
      return model?.editor?.protyle.block.rootID;
    } catch {
      return undefined;
    }
  }

  private async openQuestionSource(blockId: string): Promise<void> {
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

  private questionRenderer(markdown: string, inheritSourceStyles: boolean): string | undefined {
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
    target.classList.add(
      "damophus-question-bank-host",
      "flex",
      "h-full",
      "min-h-0",
      "flex-col",
      "overflow-hidden",
    );
    const controller = new QuestionBankController({
      getSetting: (key) => this.getSetting(key),
      setSetting: (key, value) => this.setSetting(key, value),
      pluginVersion: pluginManifest.version,
      sessionLeases: this.sessionLeases,
      tinybaseRuntime: this.getTinyBaseRuntime(),
      tinybaseCatalogRuntime: this.getTinyBaseCatalogRuntime(),
    });
    const topicDictionaryStore = new TopicDictionaryStore(
      new SiyuanPluginStoreFileIO(plugin, siyuanKernelClient),
      siyuanKernelClient,
    );
    const sourceRowsCache = new Map<string, Promise<SourceEmbedBlockRow[]>>();
    const sourceQueryCache = new Map<string, Promise<string>>();
    const loadRowsByIds = async (blockIds: readonly string[]): Promise<SourceEmbedBlockRow[]> => {
      const rows: SourceEmbedBlockRow[] = [];
      for (let offset = 0; offset < blockIds.length; offset += 48) {
        const chunk = blockIds.slice(offset, offset + 48);
        const quotedIds = chunk.map((id) => `'${id.replace(/'/gu, "''")}'`).join(", ");
        rows.push(...await sql(
          `SELECT id, root_id, parent_id, sort, path, type, subtype, content, markdown, ial FROM blocks WHERE id IN (${quotedIds}) LIMIT ${chunk.length}`,
        ) as SourceEmbedBlockRow[]);
      }
      return rows;
    };
    const loadSourceRows = (blockId: string): Promise<SourceEmbedBlockRow[]> => {
      const cached = sourceRowsCache.get(blockId);
      if (cached) return cached;
      const loading = loadSourceEmbedRows(blockId, {
        loadChildren: (id) => getChildBlocks(id),
        loadRows: loadRowsByIds,
      }).catch((error) => {
        sourceRowsCache.delete(blockId);
        throw error;
      });
      sourceRowsCache.set(blockId, loading);
      return loading;
    };
    const loadSourceQuery = (blockId: string, section: SourceEmbedSection): Promise<string> => {
      const key = `${blockId}:${section}`;
      const cached = sourceQueryCache.get(key);
      if (cached) return cached;
      const loading = loadSourceRows(blockId)
        .then((rows) => sourceEmbedSql(rows, blockId, section, {
          hideEmptySolutionBlocks: section === "solution" && this.getSetting("hideEmptyAnswerBlocks") !== false,
        }))
        .catch((error) => {
          sourceQueryCache.delete(key);
          throw error;
        });
      sourceQueryCache.set(key, loading);
      return loading;
    };
    const app = mount(QuestionBank, {
      target,
      props: {
        controller,
        initialDocumentId: documentId,
        getCurrentDocumentId: () => this.currentDocumentId(),
        translations: plugin.i18n,
        loadTopicDictionary: () => topicDictionaryStore.load(),
        reviewThreshold: Number(this.getSetting("reviewThreshold")) || 2,
        inheritSourceStyles: this.getSetting("inheritSourceStyles") !== false,
        questionRenderMode: this.getSetting("questionRenderMode") ?? "native",
        durationComparisonPosition: normalizeDurationComparisonPosition(this.getSetting("durationComparisonPosition")),
        autoSyncIndex: this.getSetting("autoSyncIndex") === true,
        autoScanDocument: this.getSetting("autoScanDocument") === true,
        showPracticeTitle: this.getSetting("showPracticeTitle") === true,
        showPracticeBreadcrumb: this.getSetting("showPracticeBreadcrumb") !== false,
        indefinitePracticeMode: this.getSetting("indefinitePracticeMode") === true,
        timingEnabled: this.getSetting("timingEnabled") !== false,
        pauseOnAnswerReveal: this.getSetting("pauseOnAnswerReveal") !== false,
        pauseOnBlur: this.getSetting("pauseOnBlur") === true,
        mobileBreadcrumb: isMobile,
        breadcrumbPriority: normalizeBreadcrumbPriority(
          settings.getBySpace("mobileBreadcrumb", "overflowPriority"),
        ),
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay(
          settings.getBySpace("mobileBreadcrumb", "textDisplayMode"),
          settings.getBySpace("mobileBreadcrumb", "maxCharacters"),
          settings.getBySpace("mobileBreadcrumb", "maxTextWidth"),
        ),
        loadBreadcrumb: (blockId: string) => getBlockBreadcrumb(blockId),
        onClose,
        renderQuestionMarkdown: (markdown: string, inheritSourceStyles: boolean) => (
          this.questionRenderer(markdown, inheritSourceStyles)
        ),
        prepareSourceBlock: async (blockId: string) => {
          await Promise.all([
            loadSourceRows(blockId),
            loadSourceQuery(blockId, "stem"),
            loadSourceQuery(blockId, "solution"),
          ]);
        },
        mountSourceBlock: async (
          target: HTMLElement,
          blockId: string,
          editable: boolean,
          section: SourceEmbedSection = "stem",
          renderMode: "native" | "embed" = "embed",
        ) => {
          const binding = controller.getBinding();
          let temporaryEmbedId: string | undefined;
          if (renderMode === "embed" && binding?.systemDocumentId) {
            let embedQuery = `SELECT * FROM blocks WHERE id = '${blockId.replace(/'/gu, "''")}'`;
            try {
              embedQuery = await loadSourceQuery(blockId, section);
            } catch (error) {
              console.warn("[Damophus] failed to resolve question embed range", error);
              embedQuery = EMPTY_SOURCE_EMBED_SQL;
            }
            if (embedQuery !== EMPTY_SOURCE_EMBED_SQL) {
              const operations = await appendBlock(
                "markdown",
                `{{${embedQuery}}}`,
                binding.systemDocumentId,
              );
              temporaryEmbedId = operations[0]?.doOperations?.[0]?.id;
            }
            if (temporaryEmbedId) {
              await setBlockAttrs(temporaryEmbedId, sourceEmbedBlockAttributes({
                breadcrumb: this.getSetting("embedBreadcrumb") === true,
                headingMode: this.getSetting("embedHeadingMode"),
              }));
            }
          }
          const sourceRows = renderMode === "native" ? await loadSourceRows(blockId) : undefined;
          const mountedBlockIds = sourceRows
            ? sourceEmbedBlockIds(sourceRows, blockId, section, {
                hideEmptySolutionBlocks: section === "solution" && this.getSetting("hideEmptyAnswerBlocks") !== false,
              })
            : temporaryEmbedId ? [temporaryEmbedId] : [];
          const editors = await Promise.all(mountedBlockIds.map(async (mountedBlockId) => {
            const host = document.createElement("div");
            host.className = "damophus-native-source-block";
            target.append(host);
            let stopBlockIsolation = () => {};
            let stopReadOnlyEnforcement = () => {};
            let defocusTimer: ReturnType<typeof setTimeout> | undefined;
            const editor = new Protyle(plugin.app, host, {
              mode: sourceBlockEditorMode,
              action: [...sourceBlockProtyleActions],
              blockId: mountedBlockId,
              after: (mountedEditor) => {
                stopReadOnlyEnforcement();
                if (!editable) {
                  mountedEditor.disable();
                  stopReadOnlyEnforcement = enforceSourceBlockReadOnly(
                    mountedEditor.protyle.wysiwyg.element,
                  );
                }
                stopBlockIsolation();
                stopBlockIsolation = observeFocusedBlock(
                  mountedEditor.protyle.wysiwyg.element,
                  mountedBlockId,
                  sourceRows ? sourceEmbedSubtreeIds(sourceRows, mountedBlockId) : [mountedBlockId],
                );
                if (isMobile) {
                  defocusProtyleEditor(mountedEditor.protyle.wysiwyg.element);
                  defocusTimer = setTimeout(
                    () => defocusProtyleEditor(mountedEditor.protyle.wysiwyg.element),
                    0,
                  );
                }
              },
              render: {
                background: false,
                title: false,
                gutter: true,
                scroll: false,
                breadcrumb: false,
              },
            });
            if (binding?.notebookId) editor.protyle.notebookId = binding.notebookId;
            return {
              editor,
              stopBlockIsolation: () => stopBlockIsolation(),
              stopReadOnlyEnforcement: () => stopReadOnlyEnforcement(),
              cancelDefocus: () => {
                if (defocusTimer !== undefined) clearTimeout(defocusTimer);
              },
            };
          }));
          return async () => {
            for (const mounted of editors) {
              mounted.cancelDefocus();
              mounted.stopBlockIsolation();
              mounted.stopReadOnlyEnforcement();
              mounted.editor.destroy();
            }
            target.replaceChildren();
            if (temporaryEmbedId) await deleteBlock(temporaryEmbedId);
          };
        },
        onAutoSyncIndexChange: (value: boolean) => this.setSetting("autoSyncIndex", value),
        onAutoScanDocumentChange: (value: boolean) => this.setSetting("autoScanDocument", value),
        onIndefinitePracticeModeChange: (value: boolean) => this.setSetting("indefinitePracticeMode", value),
        onPauseOnBlurChange: (value: boolean) => this.setSetting("pauseOnBlur", value),
        openQuestionSource: (blockId: string) => {
          beforeOpenQuestionSource?.();
          void this.openQuestionSource(blockId);
        },
      },
    });
    void this.storeSyncCoordinator?.request();
    return app;
  }
}

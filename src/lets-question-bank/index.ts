import { SubPluginBase } from "@/libs/sub-plugin-base";
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
import { QUESTION_SOURCE_ACTIONS, questionSourceOpenTarget } from "./source-navigation";
import { normalizeDurationComparisonPosition } from "./duration-comparison-position";
import { installSourceAnswerMask } from "./source-answer-mask";
import { isolateMobileDialogGestures } from "./mobile-dialog-scroll";
import {
  EMPTY_SOURCE_EMBED_SQL,
  loadSourceEmbedRows,
  sourceEmbedBlockIds,
  sourceEmbedSql,
  type SourceEmbedBlockRow,
  type SourceEmbedSection,
} from "./source-embed-query";
import {
  defocusProtyleEditor,
  observeFocusedBlock,
  sourceBlockProtyleActions,
  sourceEmbedBlockAttributes,
} from "./source-embed-presentation";
import { SiyuanPluginStoreFileIO } from "@/question-bank/adapters/tinybase/siyuan-file-io";
import { TinyBaseWarehouse } from "@/question-bank/adapters/tinybase/warehouse";
import { TinyBaseRuntime } from "./tinybase-runtime";
import { StoreSyncCoordinator, TINYBASE_READ_VIEW_UPDATED_EVENT } from "./sync-coordinator";
import { TinyBaseSiyuanCatalogRuntime } from "./tinybase-catalog-runtime";

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
  private listening = false;
  private dockApp?: ReturnType<typeof mount>;
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
    this.stopSourceAnswerMask?.();
    this.stopSourceAnswerMask = undefined;
    if (settings.getBySpace("questionBank", "maskSourceAnswers") === true) {
      this.stopSourceAnswerMask = installSourceAnswerMask(
        settings.getBySpace("questionBank", "answerMaskStyle") ?? "blur",
      );
    }
    if (!this.registered) {
      this.registered = true;
      plugin.addCommand({
        langKey: "lets-question-bank.commandOpen",
        callback: () => this.open(),
      });
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
      this.registerDock();
    }
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.on("open-menu-doctree", this.handleDocumentTreeMenu);
    plugin.eventBus.on("sync-end", this.handleSyncEnd);
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconDatabase",
      label: this.t("lets-question-bank.open"),
      click: () => this.open(),
    });
  }

  private registerDock(): void {
    const owner = this;
    plugin.addDock({
      config: {
        position: "LeftTop",
        size: { width: 420, height: 0 },
        icon: "iconDatabase",
        title: this.t("lets-question-bank.displayName"),
        show: false,
      },
      data: { documentId: this.currentDocumentId() },
      type: "damophus-question-bank-dock",
      init() {
        const target = this.element as HTMLElement;
        target.innerHTML = "";
        if (isMobile) owner.removeDockGestureIsolation = isolateMobileDialogGestures(target);
        owner.dockApp = owner.mountQuestionBank(target, owner.currentDocumentId());
      },
      destroy() {
        owner.removeDockGestureIsolation?.();
        owner.removeDockGestureIsolation = undefined;
        if (owner.dockApp) void unmount(owner.dockApp);
        owner.dockApp = undefined;
      },
    });
  }

  override async onunload(): Promise<void> {
    this.stopSourceAnswerMask?.();
    this.stopSourceAnswerMask = undefined;
    this.removeDockGestureIsolation?.();
    this.removeDockGestureIsolation = undefined;
    if (this.dockApp) void unmount(this.dockApp);
    this.dockApp = undefined;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
    plugin.eventBus.off("sync-end", this.handleSyncEnd);
    this.listening = false;
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
    await this.sessionLeases.releaseAll();
    this.storeSyncCoordinator?.close();
    this.storeSyncCoordinator = undefined;
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
    if (!blockId) return;
    menu.addItem({
      icon: "iconDatabase",
      label: this.t("lets-question-bank.openFromBlock"),
      click: () => this.open(blockId),
    });
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
    if (isMobile) {
      openMobileFileById(plugin.app, blockId, [...QUESTION_SOURCE_ACTIONS]);
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
      ...questionSourceOpenTarget(blockId, sourceRootId, this.activeDocumentRootId()),
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
        translations: plugin.i18n,
        reviewThreshold: Number(this.getSetting("reviewThreshold")) || 2,
        inheritSourceStyles: this.getSetting("inheritSourceStyles") !== false,
        questionRenderMode: this.getSetting("questionRenderMode") ?? "native",
        durationComparisonPosition: normalizeDurationComparisonPosition(this.getSetting("durationComparisonPosition")),
        autoSyncIndex: this.getSetting("autoSyncIndex") === true,
        autoScanDocument: this.getSetting("autoScanDocument") === true,
        showPracticeTitle: this.getSetting("showPracticeTitle") === true,
        showPracticeBreadcrumb: this.getSetting("showPracticeBreadcrumb") !== false,
        timingEnabled: this.getSetting("timingEnabled") !== false,
        pauseOnAnswerReveal: this.getSetting("pauseOnAnswerReveal") !== false,
        mobileBreadcrumb: isMobile,
        breadcrumbPriority: settings.getBySpace("mobileBreadcrumb", "overflowPriority") ?? "tail",
        breadcrumbTextDisplay: {
          mode: settings.getBySpace("mobileBreadcrumb", "textDisplayMode") ?? "full",
          maxCharacters: Number(settings.getBySpace("mobileBreadcrumb", "maxCharacters")) || 16,
          maxWidth: Number(settings.getBySpace("mobileBreadcrumb", "maxTextWidth")) || 160,
        },
        loadBreadcrumb: (blockId: string) => getBlockBreadcrumb(blockId),
        onClose,
        renderQuestionMarkdown: (markdown: string, inheritSourceStyles: boolean) => (
          this.questionRenderer(markdown, inheritSourceStyles)
        ),
        prepareSourceBlock: async (blockId: string) => {
          await Promise.all([
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
          const mountedBlockIds = renderMode === "native"
            ? sourceEmbedBlockIds(await loadSourceRows(blockId), blockId, section, {
                hideEmptySolutionBlocks: section === "solution" && this.getSetting("hideEmptyAnswerBlocks") !== false,
              })
            : temporaryEmbedId ? [temporaryEmbedId] : [];
          const editors = await Promise.all(mountedBlockIds.map(async (mountedBlockId) => {
            const host = document.createElement("div");
            host.className = "damophus-native-source-block";
            target.append(host);
            let stopBlockIsolation = () => {};
            let defocusTimer: ReturnType<typeof setTimeout> | undefined;
            const editor = new Protyle(plugin.app, host, {
              mode: editable ? "wysiwyg" : "preview",
              action: [...sourceBlockProtyleActions],
              blockId: mountedBlockId,
              after: (mountedEditor) => {
                stopBlockIsolation();
                stopBlockIsolation = observeFocusedBlock(
                  mountedEditor.protyle.wysiwyg.element,
                  mountedBlockId,
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
              cancelDefocus: () => {
                if (defocusTimer !== undefined) clearTimeout(defocusTimer);
              },
            };
          }));
          return async () => {
            for (const mounted of editors) {
              mounted.cancelDefocus();
              mounted.stopBlockIsolation();
              mounted.editor.destroy();
            }
            target.replaceChildren();
            if (temporaryEmbedId) await deleteBlock(temporaryEmbedId);
          };
        },
        onAutoSyncIndexChange: (value: boolean) => this.setSetting("autoSyncIndex", value),
        onAutoScanDocumentChange: (value: boolean) => this.setSetting("autoScanDocument", value),
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

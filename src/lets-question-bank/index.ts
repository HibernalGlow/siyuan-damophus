import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import { appendBlock, deleteBlock, getBlockBreadcrumb, getChildBlocks, sql } from "@/api";
import { settings } from "@/settings";
import {
  Dialog,
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
import { launchBlockIdFromElements, validLaunchBlockId } from "./launch-target";
import {
  BroadcastPracticeSessionLeaseCoordinator,
  SiyuanPracticeSessionRepository,
} from "./session-host";
import { questionBankTabTarget, questionBankTabType } from "./tab-contract";
import { installSourceAnswerMask } from "./source-answer-mask";
import {
  sourceEmbedSql,
  type SourceEmbedBlockRow,
  type SourceEmbedSection,
} from "./source-embed-query";

type PracticeCommand = "previous" | "next" | "pause";

export default class QuestionBankPlugin extends SubPluginBase {
  private tabRegistered = false;
  private registered = false;
  private listening = false;
  private dockApp?: ReturnType<typeof mount>;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();
  private readonly sessionRepository = new SiyuanPracticeSessionRepository(plugin);
  private readonly sessionLeases = new BroadcastPracticeSessionLeaseCoordinator();
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
        owner.dockApp = owner.mountQuestionBank(target, owner.currentDocumentId());
      },
      destroy() {
        if (owner.dockApp) void unmount(owner.dockApp);
        owner.dockApp = undefined;
      },
    });
  }

  override async onunload(): Promise<void> {
    this.stopSourceAnswerMask?.();
    this.stopSourceAnswerMask = undefined;
    if (this.dockApp) void unmount(this.dockApp);
    this.dockApp = undefined;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
    this.listening = false;
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
    await this.sessionLeases.releaseAll();
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
      const dialog = new Dialog({
        title: this.t("lets-question-bank.displayName"),
      content: '<div class="b3-dialog__content damophus-question-bank-dialog flex min-h-0 flex-1 overflow-hidden p-0"></div>',
        width: "94vw",
        height: "calc(100dvh - 24px)",
        destroyCallback: () => {
          if (app) void unmount(app);
        },
      });
      dialog.element.classList.add("damophus-question-bank-mobile-dialog");
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

  private openQuestionSource(blockId: string): void {
    if (isMobile) {
      openMobileFileById(plugin.app, blockId);
      return;
    }
    void openTab({
      app: plugin.app,
      doc: {
        id: blockId,
        zoomIn: true,
        action: ["cb-get-focus", "cb-get-scroll"],
      },
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
      sessionRepository: this.sessionRepository,
      sessionLeases: this.sessionLeases,
    });
    const sourceRootRowsCache = new Map<string, Promise<SourceEmbedBlockRow[]>>();
    const sourceRowsCache = new Map<string, Promise<SourceEmbedBlockRow[]>>();
    const sourceQueryCache = new Map<string, Promise<string>>();
    const loadSourceRows = (blockId: string): Promise<SourceEmbedBlockRow[]> => {
      const cached = sourceRowsCache.get(blockId);
      if (cached) return cached;
      const loading = (async () => {
        const escapedBlockId = blockId.replace(/'/gu, "''");
        const roots = await sql(
          `SELECT root_id FROM blocks WHERE id = '${escapedBlockId}' LIMIT 1`,
        ) as Array<{ root_id?: string }>;
        const rootId = roots[0]?.root_id;
        if (!rootId) return [];
        let rootRows = sourceRootRowsCache.get(rootId);
        if (!rootRows) {
          rootRows = sql(
            `SELECT id, root_id, parent_id, sort, path, type, subtype, content, ial FROM blocks WHERE root_id = '${rootId.replace(/'/gu, "''")}'`,
          ) as Promise<SourceEmbedBlockRow[]>;
          sourceRootRowsCache.set(rootId, rootRows);
        }
        const rows = (await rootRows).map((row) => ({ ...row, order: undefined }));
        const rowsById = new Map(rows.map((row) => [row.id, row]));
        let order = 0;
        const visitStemBranch = async (id: string): Promise<void> => {
          const children = await getChildBlocks(id);
          for (const child of children) {
            const row = rowsById.get(child.id);
            if (row) row.order = order++;
            await visitStemBranch(child.id);
          }
        };
        let solutionReached = false;
        for (const child of await getChildBlocks(blockId)) {
          const row = rowsById.get(child.id);
          if (row) row.order = order++;
          if (row?.ial?.includes('custom-qb-section="solution"')) solutionReached = true;
          if (!solutionReached) await visitStemBranch(child.id);
        }
        return rows;
      })();
      sourceRowsCache.set(blockId, loading);
      return loading;
    };
    const loadSourceQuery = (blockId: string, section: SourceEmbedSection): Promise<string> => {
      const key = `${blockId}:${section}`;
      const cached = sourceQueryCache.get(key);
      if (cached) return cached;
      const loading = loadSourceRows(blockId).then((rows) => sourceEmbedSql(rows, blockId, section));
      sourceQueryCache.set(key, loading);
      return loading;
    };
    return mount(QuestionBank, {
      target,
      props: {
        controller,
        initialDocumentId: documentId,
        translations: plugin.i18n,
        reviewThreshold: Number(this.getSetting("reviewThreshold")) || 2,
        inheritSourceStyles: this.getSetting("inheritSourceStyles") !== false,
        questionRenderMode: this.getSetting("questionRenderMode") ?? "native",
        autoSyncIndex: this.getSetting("autoSyncIndex") === true,
        autoScanDocument: this.getSetting("autoScanDocument") === true,
        timingEnabled: this.getSetting("timingEnabled") !== false,
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
        ) => {
          const binding = controller.getBinding();
          let mountedBlockId = blockId;
          let temporaryEmbedId: string | undefined;
          if (editable && binding?.systemDocumentId) {
            let embedQuery = `SELECT * FROM blocks WHERE id = '${blockId.replace(/'/gu, "''")}'`;
            try {
              embedQuery = await loadSourceQuery(blockId, section);
            } catch (error) {
              console.warn("[Damophus] failed to resolve question embed range; using the heading block", error);
            }
            const operations = await appendBlock(
              "markdown",
              `{{${embedQuery}}}`,
              binding.systemDocumentId,
            );
            temporaryEmbedId = operations[0]?.doOperations?.[0]?.id;
            if (temporaryEmbedId) mountedBlockId = temporaryEmbedId;
          }
          const editor = new Protyle(plugin.app, target, {
            mode: editable ? "wysiwyg" : "preview",
            action: ["cb-get-all"],
            blockId: mountedBlockId,
            render: {
              background: false,
              title: false,
              gutter: true,
              scroll: false,
              breadcrumb: false,
            },
          });
          if (binding?.notebookId) editor.protyle.notebookId = binding.notebookId;
          return async () => {
            editor.destroy();
            if (temporaryEmbedId) await deleteBlock(temporaryEmbedId);
          };
        },
        onAutoSyncIndexChange: (value: boolean) => this.setSetting("autoSyncIndex", value),
        onAutoScanDocumentChange: (value: boolean) => this.setSetting("autoScanDocument", value),
        openQuestionSource: (blockId: string) => {
          beforeOpenQuestionSource?.();
          this.openQuestionSource(blockId);
        },
      },
    });
  }
}

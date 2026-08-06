import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import {
  Dialog,
  getAllEditor,
  openMobileFileById,
  openTab,
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

type PracticeCommand = "previous" | "next" | "pause";

export default class QuestionBankPlugin extends SubPluginBase {
  private registered = false;
  private listening = false;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();
  private readonly sessionRepository = new SiyuanPracticeSessionRepository(plugin);
  private readonly sessionLeases = new BroadcastPracticeSessionLeaseCoordinator();
  private fallbackLute?: ReturnType<typeof window.Lute.New>;
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

  override onload(): void {
    if (!this.registered) {
      this.registered = true;
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

  override async onunload(): Promise<void> {
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
      const target = dialog.element.querySelector<HTMLElement>(".damophus-question-bank-dialog");
      if (!target) return;
      app = this.mountQuestionBank(target, blockId, () => dialog.destroy());
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
    return mount(QuestionBank, {
      target,
      props: {
        controller,
        initialDocumentId: documentId,
        translations: plugin.i18n,
        reviewThreshold: Number(this.getSetting("reviewThreshold")) || 2,
        inheritSourceStyles: this.getSetting("inheritSourceStyles") !== false,
        autoSyncIndex: this.getSetting("autoSyncIndex") === true,
        timingEnabled: this.getSetting("timingEnabled") !== false,
        renderQuestionMarkdown: (markdown: string, inheritSourceStyles: boolean) => (
          this.questionRenderer(markdown, inheritSourceStyles)
        ),
        onInheritSourceStylesChange: (value: boolean) => this.setSetting("inheritSourceStyles", value),
        onAutoSyncIndexChange: (value: boolean) => this.setSetting("autoSyncIndex", value),
        openQuestionSource: (blockId: string) => {
          beforeOpenQuestionSource?.();
          this.openQuestionSource(blockId);
        },
      },
    });
  }
}

import { SubPluginBase } from "@/libs/sub-plugin-base";
import { isMobile, plugin } from "@/utils";
import { Dialog, getAllEditor, openTab, type Menu } from "siyuan";
import { mount, unmount } from "svelte";
import pluginManifest from "../../plugin.json";
import QuestionBank from "./question-bank.svelte";
import { QuestionBankController } from "./controller";

const tabType = "question-bank";

export default class QuestionBankPlugin extends SubPluginBase {
  private registered = false;
  private readonly mountedTabs = new Map<HTMLElement, ReturnType<typeof mount>>();

  override onload(): void {
    if (this.registered) return;
    this.registered = true;
    const owner = this;
    plugin.addTab({
      type: tabType,
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
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconDatabase",
      label: this.t("lets-question-bank.open"),
      click: () => this.open(),
    });
  }

  override onunload(): void {
    for (const app of this.mountedTabs.values()) void unmount(app);
    this.mountedTabs.clear();
  }

  private currentDocumentId(): string | undefined {
    return getAllEditor()[0]?.protyle?.block?.rootID;
  }

  private open(): void {
    const documentId = this.currentDocumentId();
    if (isMobile) {
      let app: ReturnType<typeof mount> | undefined;
      const dialog = new Dialog({
        title: this.t("lets-question-bank.displayName"),
        content: '<div class="damophus-question-bank-dialog"></div>',
        width: "94vw",
        destroyCallback: () => {
          if (app) void unmount(app);
        },
      });
      const target = dialog.element.querySelector<HTMLElement>(".damophus-question-bank-dialog");
      if (!target) return;
      app = this.mountQuestionBank(target, documentId);
      return;
    }
    void openTab({
      app: plugin.app,
      custom: {
        icon: "iconDatabase",
        title: this.t("lets-question-bank.displayName"),
        data: { documentId },
        id: `${plugin.name}-${tabType}`,
      },
    });
  }

  private mountQuestionBank(target: HTMLElement, documentId?: string): ReturnType<typeof mount> {
    const controller = new QuestionBankController({
      getSetting: (key) => this.getSetting(key),
      setSetting: (key, value) => this.setSetting(key, value),
      pluginVersion: pluginManifest.version,
    });
    return mount(QuestionBank, {
      target,
      props: {
        controller,
        initialDocumentId: documentId,
        translations: plugin.i18n,
        reviewThreshold: Number(this.getSetting("reviewThreshold")) || 2,
      },
    });
  }
}

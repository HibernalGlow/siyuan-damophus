import { SubPluginBase } from "@/libs/sub-plugin-base";
import { UnifiedEntryPoint } from "@/libs/unified-entry-point";
import { isMobile, plugin } from "@/utils";
import { Dialog, getAllEditor, showMessage, type IEventBusMap, type Menu } from "siyuan";
import { mount, unmount } from "svelte";
import DocumentHistoryDiff from "./document-history-diff.svelte";
import { DocumentHistoryService } from "./history-service";

type HistoryTranslationKey = `lets-document-history-diff.${string}`;

interface EditorContext {
  documentId: string;
  title: string;
  lute: { BlockDOM2StdMd(html: string): string };
}

export default class DocumentHistoryDiffPlugin extends SubPluginBase {
  private entry?: UnifiedEntryPoint;
  private listening = false;

  private translate(key: HistoryTranslationKey): string {
    return plugin.i18n[key] ?? key;
  }

  private readonly handleDocumentTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    if (!this.isEntryEnabled("menu")) return;
    const lute = event.detail.protyle.lute;
    if (!event.detail.data.id || typeof lute?.BlockDOM2StdMd !== "function") return;
    event.detail.menu.addItem({
      icon: "iconHistory",
      label: this.translate("lets-document-history-diff.open"),
      click: () => this.open({
        documentId: event.detail.data.id,
        title: event.detail.data.name || event.detail.data.id,
        lute,
      }),
    });
  };

  override onload(): void {
    this.entry ??= new UnifiedEntryPoint({
      id: "document-history-diff.open",
      title: this.translate("lets-document-history-diff.open"),
      icon: "iconHistory",
      execute: () => this.openCurrentDocument(),
      command: { langKey: "lets-document-history-diff.commandOpen" },
    }, plugin);
    this.entry.setSurfaces({
      menu: this.isEntryEnabled("menu"),
      command: this.isEntryEnabled("command"),
      dock: false,
    });
    this.entry.setEnabled(true);
    this.entry.registerCommand();
    if (this.listening) return;
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    this.listening = true;
  }

  override onunload(): void {
    this.entry?.setEnabled(false);
    if (!this.listening) return;
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    this.listening = false;
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu")) return;
    this.entry?.addMenuItem(menu);
  }

  private currentContext(): EditorContext | undefined {
    const activeDocumentId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    const editors = getAllEditor();
    const editor = editors.find((candidate) => candidate.protyle.block.rootID === activeDocumentId) ?? editors[0];
    if (!editor || typeof editor.protyle.lute?.BlockDOM2StdMd !== "function") return undefined;
    const documentId = activeDocumentId ?? editor.protyle.block.rootID;
    const title = document.querySelector<HTMLInputElement>(
      `.protyle[data-loading="finished"] .protyle-background[data-node-id="${CSS.escape(documentId)}"] + .protyle-title input`,
    )?.value || documentId;
    return { documentId, title, lute: editor.protyle.lute };
  }

  private openCurrentDocument(): void {
    const context = this.currentContext();
    if (!context) {
      showMessage(this.translate("lets-document-history-diff.noDocument"), 5000, "error");
      return;
    }
    this.open(context);
  }

  private open(context: EditorContext): void {
    let app: ReturnType<typeof mount> | undefined;
    const dialog = new Dialog({
      title: this.translate("lets-document-history-diff.dialogTitle"),
      content: '<div class="damophus-document-history-host"></div>',
      width: isMobile ? "100vw" : "min(96vw, 1540px)",
      height: isMobile ? "100dvh" : "min(90dvh, 980px)",
      destroyCallback: () => {
        if (app) void unmount(app);
      },
    });
    dialog.element.classList.add("damophus-document-history-dialog");
    const target = dialog.element.querySelector<HTMLElement>(".damophus-document-history-host");
    if (!target) {
      dialog.destroy();
      return;
    }
    target.style.width = "100%";
    target.style.height = "100%";
    app = mount(DocumentHistoryDiff, {
      target,
      props: {
        service: new DocumentHistoryService(context.documentId, context.lute),
        documentTitle: context.title,
        translations: plugin.i18n,
      },
    });
  }
}

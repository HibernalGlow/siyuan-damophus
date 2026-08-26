import { getBlockDOMsStrict, sqlStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { confirm, getAllEditor, showMessage, type ICommand, type IEventBusMap, type IProtyle, type Menu } from "siyuan";
import {
  createEmptyParagraphCleanupPlan,
  isEmptyParagraphDom,
  isEmptyText,
  type DocumentFormatBlock,
} from "./empty-paragraphs";

const log = getLogger("lets-document-format");

export default class DocumentFormatPlugin extends SubPluginBase {
  private command?: ICommand;
  private listening = false;

  private readonly handleDocumentTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu") || !event.detail.data.id) return;
    event.detail.menu.addItem({
      icon: "iconSparkles",
      label: this.t("lets-document-format.removeEmptyParagraphs"),
      click: () => void this.removeEmptyParagraphs(event.detail.protyle),
    });
  };

  override onload(): void {
    this.syncCommand();
    if (this.listening) return;
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    this.listening = true;
  }

  onDataChanged(): void {
    this.syncCommand();
  }

  override onunload(): void {
    this.removeCommand();
    if (!this.listening) return;
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    this.listening = false;
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu")) return;
    menu.addItem({
      icon: "iconSparkles",
      label: this.t("lets-document-format.removeEmptyParagraphs"),
      click: () => {
        const protyle = this.currentProtyle();
        if (!protyle) {
          showMessage(this.t("lets-document-format.noDocument"), 5000, "error");
          return;
        }
        void this.removeEmptyParagraphs(protyle);
      },
    });
  }

  private syncCommand(): void {
    if (this.isEntryEnabled("command")) {
      if (this.command) return;
      this.command = {
        langKey: "lets-document-format.commandRemoveEmptyParagraphs",
        hotkey: "",
        editorCallback: (protyle) => {
          if (this.enabled) void this.removeEmptyParagraphs(protyle);
        },
      };
      plugin.addCommand(this.command);
      return;
    }
    this.removeCommand();
  }

  private removeCommand(): void {
    if (!this.command) return;
    const index = plugin.commands.indexOf(this.command);
    if (index >= 0) plugin.commands.splice(index, 1);
    this.command = undefined;
  }

  private currentProtyle(): IProtyle | undefined {
    const activeDocumentId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    const editors = getAllEditor();
    return editors.find((editor) => editor.protyle.block.rootID === activeDocumentId)?.protyle
      ?? editors[0]?.protyle;
  }

  private async removeEmptyParagraphs(protyle: IProtyle): Promise<void> {
    const documentId = protyle.block.rootID;
    if (!documentId) {
      showMessage(this.t("lets-document-format.noDocument"), 5000, "error");
      return;
    }

    try {
      const blocks = await this.loadDocumentBlocks(documentId);
      const candidates = blocks.filter((block) => block.type === "p" && isEmptyText(block.content));
      const domById = candidates.length > 0 ? await getBlockDOMsStrict(candidates.map((block) => block.id)) : {};
      const verifiedDomById = Object.fromEntries(Object.entries(domById)
        .filter(([, dom]) => isEmptyParagraphDom(dom))) as Record<string, string>;
      const plan = createEmptyParagraphCleanupPlan(
        documentId,
        blocks,
        verifiedDomById,
        this.getSetting("removeContainerParagraphs") !== false,
      );
      if (plan.count === 0) {
        showMessage(this.t("lets-document-format.noEmptyParagraphs"), 3500, "info");
        return;
      }

      const approved = await this.confirmRemoval(plan.count);
      if (!approved) return;
      protyle.getInstance().transaction(plan.doOperations, plan.undoOperations);
      showMessage(this.t("lets-document-format.removed").replace("{count}", String(plan.count)), 3500, "info");
    } catch (error) {
      log.error("remove-empty-paragraphs.failed", error);
      showMessage(this.t("lets-document-format.failed"), 7000, "error");
    }
  }

  private async loadDocumentBlocks(documentId: string): Promise<DocumentFormatBlock[]> {
    const escapedDocumentId = documentId.replace(/'/gu, "''");
    return sqlStrict<DocumentFormatBlock[]>(
      `SELECT id, parent_id, root_id, type, content, sort FROM blocks WHERE root_id = '${escapedDocumentId}'`,
    );
  }

  private confirmRemoval(count: number): Promise<boolean> {
    return new Promise((resolve) => {
      confirm(
        this.t("lets-document-format.confirmTitle"),
        this.t("lets-document-format.confirmDescription").replace("{count}", String(count)),
        () => resolve(true),
        () => resolve(false),
      );
    });
  }
}

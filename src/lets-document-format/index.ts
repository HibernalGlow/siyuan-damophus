import { getBlockDOMsStrict, sqlStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { Dialog, getAllEditor, showMessage, type ICommand, type IEventBusMap, type IProtyle, type Menu } from "siyuan";
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
        true,
      );
      if (plan.count === 0) {
        showMessage(this.t("lets-document-format.noEmptyParagraphs"), 3500, "info");
        return;
      }
      this.openRemovalDialog(protyle, documentId, blocks, verifiedDomById, plan.count);
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

  private openRemovalDialog(
    protyle: IProtyle,
    documentId: string,
    blocks: readonly DocumentFormatBlock[],
    domById: Readonly<Record<string, string>>,
    totalCount: number,
  ): void {
    const containerCount = createEmptyParagraphCleanupPlan(documentId, blocks, domById, true).count
      - createEmptyParagraphCleanupPlan(documentId, blocks, domById, false).count;
    const dialog = new Dialog({
      title: this.t("lets-document-format.confirmTitle"),
      width: "min(460px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <div>${this.t("lets-document-format.confirmDescription").replace("{count}", String(totalCount))}</div>
          <label class="b3-label fn__flex fn__space--top">
            <input class="b3-switch fn__flex-center" type="checkbox" data-field="include-containers" checked>
            <span class="fn__flex-1">${this.t("lets-document-format.includeContainers").replace("{count}", String(containerCount))}</span>
          </label>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${this.t("lets-document-format.cancel")}</button>
          <button class="b3-button b3-button--text" data-action="remove">${this.t("lets-document-format.remove")}</button>
        </div>
      `,
    });
    const checkbox = dialog.element.querySelector<HTMLInputElement>('[data-field="include-containers"]');
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector<HTMLButtonElement>('[data-action="remove"]')?.addEventListener("click", () => {
      const plan = createEmptyParagraphCleanupPlan(documentId, blocks, domById, checkbox?.checked ?? true);
      dialog.destroy();
      if (plan.count === 0) {
        showMessage(this.t("lets-document-format.noEmptyParagraphs"), 3500, "info");
        return;
      }
      protyle.getInstance().transaction(plan.doOperations, plan.undoOperations);
      showMessage(this.t("lets-document-format.removed").replace("{count}", String(plan.count)), 3500, "info");
    });
  }
}

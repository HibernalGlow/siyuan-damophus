import { getBlockDOMsStrict, sqlStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { confirm, Dialog, getAllEditor, showMessage, type ICommand, type IEventBusMap, type IProtyle, type Menu } from "siyuan";
import {
  createEmptyParagraphCleanupPlan,
  isEmptyParagraphDom,
  isEmptyTextBlockType,
  type DocumentFormatBlock,
} from "./empty-paragraphs";
import { createSelfReferenceCleanupPlan } from "./self-references";

const log = getLogger("lets-document-format");

export default class DocumentFormatPlugin extends SubPluginBase {
  private commands: ICommand[] = [];
  private listening = false;

  private readonly handleDocumentTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu") || !event.detail.data.id) return;
    this.addDocumentContextMenuItems(event.detail.menu, event.detail.protyle);
  };

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu") || !event.detail.protyle.block.rootID) return;
    this.addDocumentContextMenuItems(event.detail.menu, event.detail.protyle);
  };

  private readonly handleDocumentTreeMenu = (
    event: CustomEvent<IEventBusMap["open-menu-doctree"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu") || event.detail.type !== "doc") return;
    const documentId = event.detail.elements[0]?.dataset.nodeId;
    if (!documentId) return;
    this.addDocumentTreeMenuItems(event.detail.menu, documentId);
  };

  override onload(): void {
    this.syncCommand();
    if (this.listening) return;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.on("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.on("open-menu-doctree", this.handleDocumentTreeMenu);
    this.listening = true;
  }

  onDataChanged(): void {
    this.syncCommand();
  }

  override onunload(): void {
    this.removeCommand();
    if (!this.listening) return;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    plugin.eventBus.off("click-editortitleicon", this.handleDocumentTitleMenu);
    plugin.eventBus.off("open-menu-doctree", this.handleDocumentTreeMenu);
    this.listening = false;
  }

  addMenuItem(menu: Menu): void {
    if (!this.isEntryEnabled("menu")) return;
    if (this.isEmptyParagraphCleanupEnabled()) {
      menu.addItem({
        icon: "iconSparkles",
        label: this.t("lets-document-format.removeEmptyParagraphs"),
        click: () => void this.runInCurrentDocument((protyle) => this.removeEmptyParagraphs(protyle)),
      });
    }
    if (this.isSelfReferenceCleanupEnabled()) {
      menu.addItem({
        icon: "iconSparkles",
        label: this.t("lets-document-format.removeSelfReferences"),
        click: () => void this.runInCurrentDocument((protyle) => this.removeSelfReferences(protyle)),
      });
    }
  }

  private syncCommand(): void {
    this.removeCommand();
    if (!this.isEntryEnabled("command")) return;
    this.commands = [
      ...(this.isEmptyParagraphCleanupEnabled() ? [
        {
          langKey: "lets-document-format.commandRemoveEmptyParagraphs",
          hotkey: "",
          editorCallback: (protyle) => {
            if (this.enabled) void this.removeEmptyParagraphs(protyle);
          },
        },
      ] : []),
      ...(this.isSelfReferenceCleanupEnabled() ? [
        {
          langKey: "lets-document-format.commandRemoveSelfReferences",
          hotkey: "",
          editorCallback: (protyle) => {
            if (this.enabled) void this.removeSelfReferences(protyle);
          },
        },
      ] : []),
    ];
    this.commands.forEach((command) => plugin.addCommand(command));
  }

  private removeCommand(): void {
    this.commands.forEach((command) => {
      const index = plugin.commands.indexOf(command);
      if (index >= 0) plugin.commands.splice(index, 1);
    });
    this.commands = [];
  }

  private currentProtyle(): IProtyle | undefined {
    const activeDocumentId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    const editors = getAllEditor();
    return editors.find((editor) => editor.protyle.block.rootID === activeDocumentId)?.protyle
      ?? editors[0]?.protyle;
  }

  private isEmptyParagraphCleanupEnabled(): boolean {
    return this.getSetting("enableEmptyParagraphCleanup") !== false;
  }

  private isSelfReferenceCleanupEnabled(): boolean {
    return this.getSetting("enableSelfReferenceCleanup") !== false;
  }

  private addDocumentContextMenuItems(menu: Menu, protyle: IProtyle): void {
    if (this.isEmptyParagraphCleanupEnabled()) {
      menu.addItem({
        icon: "iconSparkles",
        label: this.t("lets-document-format.removeEmptyParagraphs"),
        click: () => void this.removeEmptyParagraphs(protyle),
      });
    }
    if (this.isSelfReferenceCleanupEnabled()) {
      menu.addItem({
        icon: "iconSparkles",
        label: this.t("lets-document-format.removeSelfReferences"),
        click: () => void this.removeSelfReferences(protyle),
      });
    }
  }

  private addDocumentTreeMenuItems(
    menu: IEventBusMap["open-menu-doctree"]["menu"],
    documentId: string,
  ): void {
    if (this.isEmptyParagraphCleanupEnabled()) {
      menu.addItem({
        icon: "iconSparkles",
        label: this.t("lets-document-format.removeEmptyParagraphs"),
        click: () => void this.runInDocumentTree(documentId, (protyle) => this.removeEmptyParagraphs(protyle)),
      });
    }
    if (this.isSelfReferenceCleanupEnabled()) {
      menu.addItem({
        icon: "iconSparkles",
        label: this.t("lets-document-format.removeSelfReferences"),
        click: () => void this.runInDocumentTree(documentId, (protyle) => this.removeSelfReferences(protyle)),
      });
    }
  }

  private async runInCurrentDocument(action: (protyle: IProtyle) => Promise<void>): Promise<void> {
    const protyle = this.currentProtyle();
    if (!protyle) {
      showMessage(this.t("lets-document-format.noDocument"), 5000, "error");
      return;
    }
    await action(protyle);
  }

  private async runInDocumentTree(
    documentId: string,
    action: (protyle: IProtyle) => Promise<void>,
  ): Promise<void> {
    const protyle = getAllEditor().find((editor) => editor.protyle.block.rootID === documentId)?.protyle;
    if (!protyle) {
      showMessage(this.t("lets-document-format.openSelectedDocument"), 5000, "error");
      return;
    }
    await action(protyle);
  }

  private async removeEmptyParagraphs(protyle: IProtyle): Promise<void> {
    const documentId = protyle.block.rootID;
    if (!documentId) {
      showMessage(this.t("lets-document-format.noDocument"), 5000, "error");
      return;
    }

    try {
      const blocks = await this.loadDocumentBlocks(documentId);
      const candidates = blocks.filter((block) => isEmptyTextBlockType(block.type));
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

  private async removeSelfReferences(protyle: IProtyle): Promise<void> {
    const documentId = protyle.block.rootID;
    if (!documentId) {
      showMessage(this.t("lets-document-format.noDocument"), 5000, "error");
      return;
    }

    try {
      const candidateIds = await this.loadSelfReferenceCandidateIds(documentId);
      const domById = candidateIds.length > 0 ? await getBlockDOMsStrict(candidateIds) : {};
      const plan = createSelfReferenceCleanupPlan(documentId, domById);
      if (plan.referenceCount === 0) {
        showMessage(this.t("lets-document-format.noSelfReferences"), 3500, "info");
        return;
      }
      this.confirmSelfReferenceRemoval(protyle, plan);
    } catch (error) {
      log.error("remove-self-references.failed", error);
      showMessage(this.t("lets-document-format.selfReferencesFailed"), 7000, "error");
    }
  }

  private async loadSelfReferenceCandidateIds(documentId: string): Promise<string[]> {
    const escapedDocumentId = documentId.replace(/'/gu, "''");
    const rows = await sqlStrict<Array<{ id: string }>>(
      `SELECT id FROM blocks WHERE root_id = '${escapedDocumentId}' AND type IN ('p', 'h', 't') AND markdown LIKE '%${escapedDocumentId}%'`,
    );
    return rows.map((row) => row.id);
  }

  private confirmSelfReferenceRemoval(
    protyle: IProtyle,
    plan: ReturnType<typeof createSelfReferenceCleanupPlan>,
  ): void {
    confirm(
      this.t("lets-document-format.confirmSelfReferencesTitle"),
      this.t("lets-document-format.confirmSelfReferencesDescription")
        .replace("{count}", String(plan.referenceCount))
        .replace("{blocks}", String(plan.blockCount)),
      () => {
        protyle.getInstance().transaction(plan.doOperations, plan.undoOperations);
        showMessage(
          this.t("lets-document-format.selfReferencesRemoved").replace("{count}", String(plan.referenceCount)),
          3500,
          "info",
        );
      },
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

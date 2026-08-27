import { getBlockDOMsStrict, sqlStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { confirm, Dialog, getAllEditor, showMessage, type ICommand, type IEventBusMap, type IOperation, type IProtyle, type Menu } from "siyuan";
import {
  createEmptyParagraphCleanupPlan,
  createEmptyContainerCleanupPlan,
  createCodeBlankLineCleanupPlan,
  isEmptyParagraphDom,
  isEmptyContainerBlockType,
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
    if (this.hasDocumentCleanupEnabled()) {
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
      ...(this.hasDocumentCleanupEnabled() ? [
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

  private isEmptyContainerCleanupEnabled(): boolean {
    return this.getSetting("enableEmptyContainerCleanup") !== false;
  }

  private isCodeBlankLineCleanupEnabled(): boolean {
    return this.getSetting("enableCodeBlankLineCleanup") !== false;
  }

  private hasDocumentCleanupEnabled(): boolean {
    return this.isEmptyParagraphCleanupEnabled()
      || this.isEmptyContainerCleanupEnabled()
      || this.isCodeBlankLineCleanupEnabled();
  }

  private addDocumentContextMenuItems(
    menu: IEventBusMap["click-blockicon"]["menu"],
    protyle: IProtyle,
  ): void {
    if (this.hasDocumentCleanupEnabled()) {
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
    if (this.hasDocumentCleanupEnabled()) {
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
      const candidates = blocks.filter((block) => (
        (this.isEmptyParagraphCleanupEnabled() && isEmptyTextBlockType(block.type))
        || (this.isEmptyContainerCleanupEnabled() && isEmptyContainerBlockType(block.type))
        || (this.isCodeBlankLineCleanupEnabled() && block.type === "c")
      ));
      const domById = candidates.length > 0 ? await getBlockDOMsStrict(candidates.map((block) => block.id)) : {};
      const verifiedDomById = domById as Record<string, string>;
      const plan = this.buildCleanupPlan(documentId, blocks, verifiedDomById, true, true, true);
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

  private buildCleanupPlan(
    documentId: string,
    blocks: readonly DocumentFormatBlock[],
    domById: Readonly<Record<string, string>>,
    includeContainerParagraphs: boolean,
    includeEmptyContainers: boolean,
    cleanCodeBlankLines: boolean,
  ): { doOperations: IOperation[]; undoOperations: IOperation[]; count: number } {
    const containerPlan = includeEmptyContainers
      ? createEmptyContainerCleanupPlan(documentId, blocks, domById)
      : { doOperations: [], undoOperations: [], count: 0 };
    const removedContainerIds = new Set(containerPlan.doOperations
      .filter((operation) => operation.action === "delete")
      .map((operation) => operation.id));
    const isDescendantOfRemovedContainer = (block: DocumentFormatBlock): boolean => {
      const byId = new Map(blocks.map((entry) => [entry.id, entry]));
      let parentId = block.parent_id;
      while (parentId) {
        if (removedContainerIds.has(parentId)) return true;
        parentId = byId.get(parentId)?.parent_id;
      }
      return false;
    };
    const textPlan = this.isEmptyParagraphCleanupEnabled()
      ? createEmptyParagraphCleanupPlan(
        documentId,
        blocks,
        Object.fromEntries(Object.entries(domById).filter(([, dom]) => isEmptyParagraphDom(dom))),
        includeContainerParagraphs,
      )
      : { doOperations: [], undoOperations: [], count: 0 };
    const filteredTextIds = new Set(blocks
      .filter((block) => isEmptyTextBlockType(block.type))
      .filter((block) => !isDescendantOfRemovedContainer(block))
      .map((block) => block.id));
    const filteredTextPlan = {
      doOperations: textPlan.doOperations.filter((operation) => filteredTextIds.has(operation.id)),
      undoOperations: textPlan.undoOperations.filter((operation) => filteredTextIds.has(operation.id)),
      count: textPlan.doOperations.filter((operation) => filteredTextIds.has(operation.id)).length,
    };
    const deletedTextIds = new Set(filteredTextPlan.doOperations.map((operation) => operation.id));
    const codePlan = cleanCodeBlankLines && this.isCodeBlankLineCleanupEnabled()
      ? createCodeBlankLineCleanupPlan(
        blocks.filter((block) => !isDescendantOfRemovedContainer(block))
          .filter((block) => !deletedTextIds.has(block.id)),
        domById,
      )
      : { doOperations: [], undoOperations: [], count: 0, removedLineCount: 0 };
    return {
      doOperations: [...containerPlan.doOperations, ...filteredTextPlan.doOperations, ...codePlan.doOperations],
      undoOperations: [...containerPlan.undoOperations, ...filteredTextPlan.undoOperations, ...codePlan.undoOperations],
      count: containerPlan.count + filteredTextPlan.count + codePlan.count,
    };
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
    const emptyTextDomById = Object.fromEntries(Object.entries(domById)
      .filter(([, dom]) => isEmptyParagraphDom(dom)));
    const containerCount = this.isEmptyParagraphCleanupEnabled()
      ? createEmptyParagraphCleanupPlan(documentId, blocks, emptyTextDomById, true).count
        - createEmptyParagraphCleanupPlan(documentId, blocks, emptyTextDomById, false).count
      : 0;
    const emptyContainerCount = this.isEmptyContainerCleanupEnabled()
      ? createEmptyContainerCleanupPlan(documentId, blocks, domById).count
      : 0;
    const codeCount = this.isCodeBlankLineCleanupEnabled()
      ? createCodeBlankLineCleanupPlan(blocks, domById).count
      : 0;
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
          ${this.isEmptyContainerCleanupEnabled() ? `
          <label class="b3-label fn__flex fn__space--top">
            <input class="b3-switch fn__flex-center" type="checkbox" data-field="include-empty-containers" checked>
            <span class="fn__flex-1">${this.t("lets-document-format.includeEmptyContainers").replace("{count}", String(emptyContainerCount))}</span>
          </label>` : ""}
          ${this.isCodeBlankLineCleanupEnabled() ? `
          <label class="b3-label fn__flex fn__space--top">
            <input class="b3-switch fn__flex-center" type="checkbox" data-field="clean-code-blank-lines" checked>
            <span class="fn__flex-1">${this.t("lets-document-format.cleanCodeBlankLines").replace("{count}", String(codeCount))}</span>
          </label>` : ""}
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${this.t("lets-document-format.cancel")}</button>
          <button class="b3-button b3-button--text" data-action="remove">${this.t("lets-document-format.remove")}</button>
        </div>
      `,
    });
    const checkbox = dialog.element.querySelector<HTMLInputElement>('[data-field="include-containers"]');
    const emptyContainersCheckbox = dialog.element.querySelector<HTMLInputElement>('[data-field="include-empty-containers"]');
    const codeBlankLinesCheckbox = dialog.element.querySelector<HTMLInputElement>('[data-field="clean-code-blank-lines"]');
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector<HTMLButtonElement>('[data-action="remove"]')?.addEventListener("click", () => {
      const plan = this.buildCleanupPlan(
        documentId,
        blocks,
        domById,
        checkbox?.checked ?? true,
        emptyContainersCheckbox?.checked ?? false,
        codeBlankLinesCheckbox?.checked ?? false,
      );
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

import { getBlockDOMsStrict, sqlStrict } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { Dialog, getAllEditor, showMessage, type ICommand, type IEventBusMap, type IProtyle } from "siyuan";
import {
  createTagConvertPlan,
  normalizeTagConvertFormat,
  normalizeTagWrap,
  previewTagConversion,
  type TagConvertOptions,
} from "./tag-convert";

const log = getLogger("lets-tag-convert");

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#039;");
}

export default class TagConvertPlugin extends SubPluginBase {
  private commands: ICommand[] = [];
  private listening = false;

  private readonly handleEditorTitleMenu = (
    event: CustomEvent<IEventBusMap["click-editortitleicon"]>,
  ): void => {
    if (!this.isEntryEnabled("contextMenu") || !event.detail.protyle?.block?.rootID) return;
    this.addMenuItem(event.detail.menu, event.detail.protyle);
  };

  override onload(): void {
    this.syncCommand();
    if (this.listening) return;
    plugin.eventBus.on("click-editortitleicon", this.handleEditorTitleMenu);
    this.listening = true;
  }

  onDataChanged(): void {
    this.syncCommand();
  }

  override onunload(): void {
    this.removeCommand();
    if (!this.listening) return;
    plugin.eventBus.off("click-editortitleicon", this.handleEditorTitleMenu);
    this.listening = false;
  }

  addMenuItem(menu: IEventBusMap["click-editortitleicon"]["menu"], protyle: IProtyle): void {
    if (!this.isEntryEnabled("menu")) return;
    menu.addItem({
      icon: "iconTags",
      label: this.t("lets-tag-convert.menu"),
      click: () => void this.convertInDocument(protyle),
    });
  }

  private syncCommand(): void {
    this.removeCommand();
    if (!this.isEntryEnabled("command")) return;
    this.commands = [{
      langKey: "lets-tag-convert.command",
      hotkey: "",
      callback: () => {
        if (!this.enabled) return;
        const protyle = this.currentProtyle();
        if (!protyle) {
          showMessage(this.t("lets-tag-convert.noDocument"), 5000, "error");
          return;
        }
        void this.convertInDocument(protyle);
      },
    }];
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

  private readDialogOptions(): TagConvertOptions {
    return {
      format: normalizeTagConvertFormat(this.getSetting("targetFormat")),
      leftWrap: normalizeTagWrap(this.getSetting("leftWrap")),
      rightWrap: normalizeTagWrap(this.getSetting("rightWrap")),
    };
  }

  private async convertInDocument(protyle: IProtyle): Promise<void> {
    const documentId = protyle.block.rootID;
    if (!documentId) {
      showMessage(this.t("lets-tag-convert.noDocument"), 5000, "error");
      return;
    }
    try {
      const candidateIds = await this.loadCandidateIds(documentId);
      const domById = candidateIds.length > 0 ? await getBlockDOMsStrict(candidateIds) : {};
      const defaultOptions = this.readDialogOptions();
      const defaultPlan = createTagConvertPlan(domById, defaultOptions);
      if (defaultPlan.tagCount === 0) {
        showMessage(this.t("lets-tag-convert.noTags"), 3500, "info");
        return;
      }
      this.openConvertDialog(protyle, domById, defaultPlan.tagCount, defaultOptions);
    } catch (error) {
      log.error("convert-tags.failed", error);
      showMessage(this.t("lets-tag-convert.failed"), 7000, "error");
    }
  }

  private async loadCandidateIds(documentId: string): Promise<string[]> {
    const escapedDocumentId = documentId.replace(/'/gu, "''");
    const rows = await sqlStrict<Array<{ id: string }>>(`
      SELECT id FROM blocks
      WHERE root_id = '${escapedDocumentId}'
        AND type IN ('p', 'h', 't')
        AND markdown LIKE '%#%#'
    `);
    return rows.map((row) => row.id);
  }

  private openConvertDialog(
    protyle: IProtyle,
    domById: Readonly<Record<string, string>>,
    tagCount: number,
    defaults: TagConvertOptions,
  ): void {
    const dialog = new Dialog({
      title: this.t("lets-tag-convert.dialogTitle"),
      width: "min(520px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <div>${this.t("lets-tag-convert.dialogDescription").replace("{count}", String(tagCount))}</div>
          <label class="b3-label fn__flex fn__space--top">
            <span class="fn__flex-center" style="width: 100px">${this.t("lets-tag-convert.formatTitle")}</span>
            <select class="b3-select fn__flex-1" data-field="format">
              <option value="plain">${this.t("lets-tag-convert.formatPlain")}</option>
              <option value="code"${defaults.format === "code" ? " selected" : ""}>${this.t("lets-tag-convert.formatCode")}</option>
            </select>
          </label>
          <label class="b3-label fn__flex fn__space--top">
            <span class="fn__flex-center" style="width: 100px">${this.t("lets-tag-convert.leftWrapTitle")}</span>
            <input class="b3-text-field fn__flex-1" data-field="left-wrap" value="${escapeHtml(defaults.leftWrap)}" placeholder="${this.t("lets-tag-convert.leftWrapPlaceholder")}">
          </label>
          <label class="b3-label fn__flex fn__space--top">
            <span class="fn__flex-center" style="width: 100px">${this.t("lets-tag-convert.rightWrapTitle")}</span>
            <input class="b3-text-field fn__flex-1" data-field="right-wrap" value="${escapeHtml(defaults.rightWrap)}" placeholder="${this.t("lets-tag-convert.rightWrapPlaceholder")}">
          </label>
          <div class="b3-label fn__flex fn__space--top">
            <span class="fn__flex-center" style="width: 100px">${this.t("lets-tag-convert.preview")}</span>
            <span class="fn__flex-1" data-field="preview"></span>
          </div>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${this.t("lets-tag-convert.cancel")}</button>
          <button class="b3-button b3-button--text" data-action="convert">${this.t("lets-tag-convert.convert")}</button>
        </div>
      `,
    });

    const formatSelect = dialog.element.querySelector<HTMLSelectElement>('[data-field="format"]');
    const leftInput = dialog.element.querySelector<HTMLInputElement>('[data-field="left-wrap"]');
    const rightInput = dialog.element.querySelector<HTMLInputElement>('[data-field="right-wrap"]');
    const previewElement = dialog.element.querySelector<HTMLElement>('[data-field="preview"]');

    const readValues = (): TagConvertOptions => ({
      format: normalizeTagConvertFormat(formatSelect?.value),
      leftWrap: normalizeTagWrap(leftInput?.value),
      rightWrap: normalizeTagWrap(rightInput?.value),
    });
    const renderPreview = (): void => {
      if (!previewElement) return;
      const sample = this.t("lets-tag-convert.previewSample");
      previewElement.textContent = `#${sample}# -> ${previewTagConversion(readValues(), sample)}`;
    };
    renderPreview();
    [formatSelect, leftInput, rightInput].forEach((control) =>
      control?.addEventListener("input", renderPreview));
    dialog.element.addEventListener("change", renderPreview);

    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')
      ?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector<HTMLButtonElement>('[data-action="convert"]')
      ?.addEventListener("click", () => {
        const values = readValues();
        dialog.destroy();
        void this.applyConversion(protyle, domById, values);
      });
  }

  private async applyConversion(
    protyle: IProtyle,
    domById: Readonly<Record<string, string>>,
    values: TagConvertOptions,
  ): Promise<void> {
    try {
      const plan = createTagConvertPlan(domById, values);
      if (plan.tagCount === 0) {
        showMessage(this.t("lets-tag-convert.noTags"), 3500, "info");
        return;
      }
      protyle.getInstance().transaction(plan.doOperations, plan.undoOperations);
      this.setSetting("targetFormat", values.format);
      this.setSetting("leftWrap", values.leftWrap);
      this.setSetting("rightWrap", values.rightWrap);
      showMessage(
        this.t("lets-tag-convert.converted")
          .replace("{tags}", String(plan.tagCount))
          .replace("{blocks}", String(plan.blockCount)),
        3500,
        "info",
      );
    } catch (error) {
      log.error("apply-conversion.failed", error);
      showMessage(this.t("lets-tag-convert.failed"), 7000, "error");
    }
  }
}

import { exportBlocksKramdown } from "@/kramdown-export/siyuan";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import type { IalExportMode, IalExportOptions } from "@hibernalglow/damophus-agent-contract";
import { Dialog, getAllEditor, showMessage, type IEventBusMap, type Menu } from "siyuan";
import { copyMarkdown, selectedBlockIds } from "./interaction";

const log = getLogger("lets-kramdown-export");

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function commaSeparated(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

export default class KramdownExportPlugin extends SubPluginBase {
  private listening = false;

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    const blockIds = selectedBlockIds(event.detail.blockElements);
    if (blockIds.length === 0) return;
    event.detail.menu.addItem({
      icon: "iconDownload",
      label: this.t("lets-kramdown-export.menuLabel"),
      click: () => this.openDialog(event.detail.protyle.block.rootID, blockIds),
    });
  };

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
  }

  override onunload(): void {
    if (!this.listening) return;
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    this.listening = false;
  }

  addMenuItem(menu: Menu): void {
    menu.addItem({
      icon: "iconDownload",
      label: this.t("lets-kramdown-export.menuLabel"),
      click: () => {
        const documentId = this.currentDocumentId();
        if (!documentId) {
          showMessage(this.t("lets-kramdown-export.noDocument"), 5000, "error");
          return;
        }
        this.openDialog(documentId, this.currentSelectedBlockIds());
      },
    });
  }

  private currentDocumentId(): string | undefined {
    const activeId = document.querySelector<HTMLElement>(
      ".layout__wnd--active .protyle.fn__flex-1:not(.fn__none) .protyle-background",
    )?.dataset.nodeId;
    return activeId ?? getAllEditor()[0]?.protyle.block.rootID;
  }

  private currentSelectedBlockIds(): string[] {
    return selectedBlockIds(Array.from(document.querySelectorAll<HTMLElement>(
      '.layout__wnd--active .protyle-wysiwyg--select[data-node-id]',
    )));
  }

  private configuredOptions(): IalExportOptions {
    const configuredMode = this.getSetting("ialMode");
    const mode: IalExportMode = configuredMode === "none" || configuredMode === "all"
      ? configuredMode
      : "portable";
    return {
      mode,
      include: commaSeparated(String(this.getSetting("ialInclude") ?? "")),
      exclude: commaSeparated(String(this.getSetting("ialExclude") ?? "")),
    };
  }

  private openDialog(documentId: string, blockIds: string[]): void {
    const options = this.configuredOptions();
    const hasSelection = blockIds.length > 0;
    const dialog = new Dialog({
      title: this.t("lets-kramdown-export.dialogTitle"),
      width: "min(520px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <label class="fn__flex-column">
            <span class="b3-label">${escapeHtml(this.t("lets-kramdown-export.scopeLabel"))}</span>
            <select class="b3-select fn__block" data-field="scope">
              ${hasSelection ? `<option value="selection">${escapeHtml(this.t("lets-kramdown-export.scopeSelection").replace("{count}", String(blockIds.length)))}</option>` : ""}
              <option value="document"${hasSelection ? "" : " selected"}>${escapeHtml(this.t("lets-kramdown-export.scopeDocument"))}</option>
            </select>
          </label>
          <label class="fn__flex-column fn__space--top">
            <span class="b3-label">${escapeHtml(this.t("lets-kramdown-export.ialModeTitle"))}</span>
            <select class="b3-select fn__block" data-field="mode">
              <option value="portable"${options.mode === "portable" ? " selected" : ""}>${escapeHtml(this.t("lets-kramdown-export.ialModePortable"))}</option>
              <option value="all"${options.mode === "all" ? " selected" : ""}>${escapeHtml(this.t("lets-kramdown-export.ialModeAll"))}</option>
              <option value="none"${options.mode === "none" ? " selected" : ""}>${escapeHtml(this.t("lets-kramdown-export.ialModeNone"))}</option>
            </select>
          </label>
          <label class="fn__flex-column fn__space--top">
            <span class="b3-label">${escapeHtml(this.t("lets-kramdown-export.ialIncludeTitle"))}</span>
            <input class="b3-text-field fn__block" data-field="include" value="${escapeHtml(options.include.join(", "))}">
          </label>
          <label class="fn__flex-column fn__space--top">
            <span class="b3-label">${escapeHtml(this.t("lets-kramdown-export.ialExcludeTitle"))}</span>
            <input class="b3-text-field fn__block" data-field="exclude" value="${escapeHtml(options.exclude.join(", "))}">
          </label>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(this.t("lets-kramdown-export.cancel"))}</button>
          <button class="b3-button b3-button--text" data-action="export">${escapeHtml(this.t("lets-kramdown-export.export"))}</button>
        </div>
      `,
    });
    const scope = dialog.element.querySelector<HTMLSelectElement>('[data-field="scope"]');
    const mode = dialog.element.querySelector<HTMLSelectElement>('[data-field="mode"]');
    const include = dialog.element.querySelector<HTMLInputElement>('[data-field="include"]');
    const exclude = dialog.element.querySelector<HTMLInputElement>('[data-field="exclude"]');
    const exportButton = dialog.element.querySelector<HTMLButtonElement>('[data-action="export"]');
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
    exportButton?.addEventListener("click", () => {
      if (!scope || !mode || !include || !exclude || !exportButton) return;
      exportButton.disabled = true;
      void this.exportAndCopy({
        blockIds: scope.value === "selection" ? blockIds : [documentId],
        options: {
          mode: mode.value as IalExportMode,
          include: commaSeparated(include.value),
          exclude: commaSeparated(exclude.value),
        },
      }).then(() => dialog.destroy()).catch((error) => {
        exportButton.disabled = false;
        log.error("export failed", error);
        showMessage(this.t("lets-kramdown-export.failure"), 7000, "error");
      });
    });
  }

  private async exportAndCopy(input: {
    blockIds: string[];
    options: IalExportOptions;
  }): Promise<void> {
    this.setSetting("ialMode", input.options.mode);
    this.setSetting("ialInclude", input.options.include.join(", "));
    this.setSetting("ialExclude", input.options.exclude.join(", "));
    const markdown = await exportBlocksKramdown(input.blockIds, input.options);
    await copyMarkdown(markdown);
    showMessage(
      this.t("lets-kramdown-export.success").replace("{count}", String(input.blockIds.length)),
      5000,
    );
  }
}

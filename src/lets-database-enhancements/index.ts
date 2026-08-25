import { Dialog, getAllEditor, showMessage, type IEventBusMap } from "siyuan";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { AvCoverInheritManager } from "./av-cover-inherit";
import { AvColumnBindingManager } from "./av-column-binding";
import { AvRelationReorderManager } from "./av-relation-reorder";
import {
  DATE_NOW_GENERATOR,
  COLUMN_BINDINGS_ATTR,
  NATIVE_FILTER_OPERATORS,
  parseBindingConfig,
  type AttributeViewKey,
  type ColumnBindingRule,
} from "./av-column-binding";
import { getBlockAttrsStrict, requestStrict } from "@/api";

export default class DatabaseEnhancementsPlugin extends SubPluginBase {
  private readonly coverManager = new AvCoverInheritManager();
  private readonly relationManager = new AvRelationReorderManager();
  private readonly columnBindingManager = new AvColumnBindingManager();
  private listening = false;
  private layoutReady = false;
  private readonly watchedRoots = new Map<HTMLElement, () => void>();
  private documentCleanup: (() => void) | null = null;

  override onload(): void {
    this.columnBindingManager.updateOptions({
      enabled: this.isColumnBindingEnabled(),
    });
    this.relationManager.updateOptions({
      enabled: this.isSmartRelationEnabled(),
      highlightEnabled: this.isHighlightEnabled(),
    });
    plugin.eventBus.on("open-menu-av", this.handleAttributeViewMenu);
    plugin.eventBus.on("click-blockicon", this.handleBlockMenu);
  }

  onLayoutReady(): void {
    this.layoutReady = true;
    this.bindEvents();
    this.startServices();
  }

  onDataChanged(): void {
    this.columnBindingManager.updateOptions({
      enabled: this.isColumnBindingEnabled(),
    });
    this.relationManager.updateOptions({
      enabled: this.isSmartRelationEnabled(),
      highlightEnabled: this.isHighlightEnabled(),
    });

    if (this.layoutReady) {
      this.rescanAllEditors();
    }
  }

  override onunload(): void {
    plugin.eventBus.off("open-menu-av", this.handleAttributeViewMenu);
    plugin.eventBus.off("click-blockicon", this.handleBlockMenu);
    this.unbindEvents();
    this.stopServices();
    this.layoutReady = false;
  }

  private isCoverInheritEnabled(): boolean {
    return this.getSetting("inheritCardCover") !== false;
  }

  private isSmartRelationEnabled(): boolean {
    return this.getSetting("smartRelationSorting") !== false;
  }

  private isHighlightEnabled(): boolean {
    return this.getSetting("highlightRelevantItem") !== false;
  }

  private isColumnBindingEnabled(): boolean {
    return this.getSetting("columnBindingEnabled") === true;
  }

  private startServices(): void {
    this.columnBindingManager.start();
    this.relationManager.start();
    this.documentCleanup = this.coverManager.observeDocument();
    this.rescanAllEditors();
  }

  private stopServices(): void {
    this.columnBindingManager.stop();
    for (const [, cleanup] of this.watchedRoots) {
      cleanup();
    }
    this.watchedRoots.clear();
    this.documentCleanup?.();
    this.documentCleanup = null;
    this.coverManager.clearCache();
    this.relationManager.destroy();
  }

  private bindEvents(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.on("switch-protyle", this.handleProtyle);
    plugin.eventBus.on("destroy-protyle", this.handleProtyleDestroyed);
    plugin.eventBus.on("ws-main", this.handleWsMain);
  }

  private unbindEvents(): void {
    if (!this.listening) return;
    this.listening = false;
    plugin.eventBus.off("loaded-protyle-static", this.handleProtyle);
    plugin.eventBus.off("switch-protyle", this.handleProtyle);
    plugin.eventBus.off("destroy-protyle", this.handleProtyleDestroyed);
    plugin.eventBus.off("ws-main", this.handleWsMain);
  }

  private readonly handleProtyle = (
    event: CustomEvent<
      | IEventBusMap["loaded-protyle-static"]
      | IEventBusMap["switch-protyle"]
    >,
  ): void => {
    const el = event.detail?.protyle?.element;
    if (el) {
      this.scanEditorRoot(el);
    }
  };

  private readonly handleProtyleDestroyed = (
    event: CustomEvent<IEventBusMap["destroy-protyle"]>,
  ): void => {
    const el = event.detail?.protyle?.element;
    if (el) {
      this.disposeEditorRoot(el);
    }
  };

  private readonly handleWsMain = (event: CustomEvent<import("siyuan").IEventBusMap["ws-main"]>): void => {
    this.columnBindingManager.handleWsMain(event.detail);
  };

  private readonly handleAttributeViewMenu = (
    event: CustomEvent<IEventBusMap["open-menu-av"]>,
  ): void => {
    if (!this.isColumnBindingEnabled()) return;
    const target = event.detail.element;
    const databaseId = target?.dataset.avId;
    const blockId = target?.dataset.nodeId;
    if (!databaseId || !blockId) return;
    event.detail.menu.addItem({
      icon: "iconDatabase",
      label: this.t("lets-database-enhancements.configureColumnBindings"),
      click: () => { void this.openColumnBindingDialog(databaseId, blockId); },
    });
  };

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.isColumnBindingEnabled() || event.detail.blockElements.length !== 1) return;
    const block = event.detail.blockElements[0];
    const target = this.databaseElementFromBlock(block);
    const databaseId = target?.dataset.avId;
    const blockId = target?.dataset.nodeId;
    if (!databaseId || !blockId) return;
    event.detail.menu.addItem({
      icon: "iconDatabase",
      label: this.t("lets-database-enhancements.configureColumnBindings"),
      click: () => { void this.openColumnBindingDialog(databaseId, blockId); },
    });
  };

  private databaseElementFromBlock(block: HTMLElement): HTMLElement | undefined {
    return block.matches(".av[data-av-id]")
      ? block
      : block.querySelector<HTMLElement>(".av[data-av-id], [data-type=NodeAttributeView][data-av-id]");
  }

  private async openColumnBindingDialog(databaseId: string, blockId: string): Promise<void> {
    try {
      const response = await requestStrict<{ av: { id: string; name?: string; keyValues: Array<{ key: AttributeViewKey }> } }>(
        "/api/av/getAttributeView",
        { id: databaseId },
      );
      const columns = response.av.keyValues.map(({ key }) => key).filter((column) => !["lineNumber", "created", "updated"].includes(column.type));
      const attrs = await getBlockAttrsStrict(blockId);
      const rules = parseBindingConfig(attrs[COLUMN_BINDINGS_ATTR] || "").rules;
      const dialog = new Dialog({
        title: `${this.t("lets-database-enhancements.configureColumnBindings")}: ${response.av.name || databaseId}`,
        width: "min(720px, 94vw)",
        content: this.renderColumnBindingDialog(columns, rules),
      });
      this.bindColumnBindingDialog(dialog, blockId, databaseId, columns);
    } catch {
      showMessage(this.t("lets-database-enhancements.columnBindingReadFailed"), 5000, "error");
    }
  }

  private renderColumnBindingDialog(columns: AttributeViewKey[], rules: ColumnBindingRule[]): string {
    const optionHtml = (selected: string, target = false): string => columns
      .filter((column) => !target || column.type === "date")
      .map((column) => `<option value="${this.escapeHtml(column.id)}"${column.id === selected ? " selected" : ""}>${this.escapeHtml(column.name)}</option>`)
      .join("");
    const rows = rules.map((rule, index) => `<div class="damophus-column-binding-row" data-rule-index="${index}" style="display:flex;align-items:center;gap:8px;margin:8px 0">
      <select class="b3-select" data-field="source">${optionHtml(rule.sourceColumn)}</select>
      <select class="b3-select" data-field="operator">${NATIVE_FILTER_OPERATORS.map((operator) => `<option value="${operator}"${operator === rule.operator ? " selected" : ""}>${operator}</option>`).join("")}</select>
      <select class="b3-select" data-field="target">${optionHtml(rule.targetColumn, true)}</select>
      <span class="b3-label">${this.escapeHtml(this.t("lets-database-enhancements.generatorDateNow"))}</span>
      <button class="b3-button b3-button--cancel" data-action="remove" type="button">${this.escapeHtml(this.t("lets-database-enhancements.removeRule"))}</button>
    </div>`).join("");
    return `<div class="b3-dialog__content">
      <p>${this.escapeHtml(this.t("lets-database-enhancements.columnBindingRulesDescription"))}</p>
      <div data-rules>${rows || `<div class="b3-label">${this.escapeHtml(this.t("lets-database-enhancements.noRules"))}</div>`}</div>
      <button class="b3-button b3-button--outline" data-action="add" type="button">${this.escapeHtml(this.t("lets-database-enhancements.addRule"))}</button>
    </div>
    <div class="b3-dialog__action">
      <button class="b3-button b3-button--cancel" data-action="cancel" type="button">${this.escapeHtml(this.t("lets-database-enhancements.cancel"))}</button>
      <button class="b3-button b3-button--text" data-action="save" type="button">${this.escapeHtml(this.t("lets-database-enhancements.save"))}</button>
    </div>`;
  }

  private bindColumnBindingDialog(dialog: Dialog, blockId: string, _databaseId: string, columns: AttributeViewKey[]): void {
    const rulesRoot = dialog.element.querySelector<HTMLElement>("[data-rules]");
    const addButton = dialog.element.querySelector<HTMLButtonElement>('[data-action="add"]');
    addButton?.addEventListener("click", () => {
      if (!rulesRoot) return;
      const index = rulesRoot.querySelectorAll("[data-rule-index]").length;
      const sourceOptions = columns.map((column) => `<option value="${this.escapeHtml(column.id)}">${this.escapeHtml(column.name)}</option>`).join("");
      const targetOptions = columns.filter((column) => column.type === "date").map((column) => `<option value="${this.escapeHtml(column.id)}">${this.escapeHtml(column.name)}</option>`).join("");
      const empty = rulesRoot.querySelector(".b3-label");
      empty?.remove();
      const row = document.createElement("div");
      row.className = "damophus-column-binding-row";
      row.style.cssText = "display:flex;align-items:center;gap:8px;margin:8px 0";
      row.dataset.ruleIndex = String(index);
      row.innerHTML = `<select class="b3-select" data-field="source">${sourceOptions}</select><select class="b3-select" data-field="operator">${NATIVE_FILTER_OPERATORS.map((operator) => `<option value="${operator}">${operator}</option>`).join("")}</select><select class="b3-select" data-field="target">${targetOptions}</select><span class="b3-label">${this.escapeHtml(this.t("lets-database-enhancements.generatorDateNow"))}</span><button class="b3-button b3-button--cancel" data-action="remove" type="button">${this.escapeHtml(this.t("lets-database-enhancements.removeRule"))}</button>`;
      row.querySelector<HTMLButtonElement>('[data-action="remove"]')?.addEventListener("click", () => row.remove());
      rulesRoot.append(row);
    });
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelector<HTMLButtonElement>('[data-action="save"]')?.addEventListener("click", () => {
      const currentRules: ColumnBindingRule[] = [...dialog.element.querySelectorAll<HTMLElement>("[data-rule-index]")].flatMap((row) => {
        const sourceColumn = row.querySelector<HTMLSelectElement>('[data-field="source"]')?.value || "";
        const operator = row.querySelector<HTMLSelectElement>('[data-field="operator"]')?.value || "Is true";
        const targetColumn = row.querySelector<HTMLSelectElement>('[data-field="target"]')?.value || "";
        return sourceColumn && targetColumn && sourceColumn !== targetColumn ? [{ sourceColumn, operator: operator as ColumnBindingRule["operator"], targetColumn, generator: DATE_NOW_GENERATOR }] : [];
      });
      void this.columnBindingManager.saveConfig(blockId, currentRules).then(() => dialog.destroy()).catch(() => showMessage(this.t("lets-database-enhancements.columnBindingSaveFailed"), 5000, "error"));
    });
    dialog.element.querySelectorAll<HTMLButtonElement>('[data-action="remove"]').forEach((button) => button.addEventListener("click", () => { button.closest("[data-rule-index]")?.remove(); }));
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
  }

  private scanEditorRoot(root: HTMLElement): void {
    this.disposeEditorRoot(root);
    if (!this.isCoverInheritEnabled()) return;

    const wysiwyg = root.querySelector<HTMLElement>(".protyle-wysiwyg");
    if (wysiwyg) {
      const cleanup = this.coverManager.observe(wysiwyg);
      this.watchedRoots.set(root, cleanup);
    }
  }

  private disposeEditorRoot(root: HTMLElement): void {
    const cleanup = this.watchedRoots.get(root);
    if (cleanup) {
      cleanup();
      this.watchedRoots.delete(root);
    }
  }

  private rescanAllEditors(): void {
    for (const [, cleanup] of this.watchedRoots) {
      cleanup();
    }
    this.watchedRoots.clear();

    if (this.isCoverInheritEnabled()) {
      for (const editor of getAllEditor()) {
        if (editor.protyle?.element) {
          this.scanEditorRoot(editor.protyle.element);
        }
      }
      if (typeof document !== "undefined") {
        const protyles = document.querySelectorAll<HTMLElement>(".protyle");
        protyles.forEach((el) => {
          if (!this.watchedRoots.has(el)) {
            this.scanEditorRoot(el);
          }
        });
      }
    }
  }
}

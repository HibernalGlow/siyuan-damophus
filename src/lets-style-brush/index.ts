import { getBlockBreadcrumb, getHeadingChildrenIDs } from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import type { ProtyleToolbarItem } from "@/types/plugin";
import { Dialog, showMessage, type IEventBusMap, type IMenu, type IProtyle, type Protyle } from "siyuan";
import {
  applyWithFormatPainter,
  captureFormatPainterData,
  findFormatPainter,
  findSameTextMatches,
  nearestHeadingId,
  normalizeSelectedText,
  selectedRangeBlockId,
  type FormatPainterData,
  type FormatPainterRuntime,
  type StyleBrushScope,
} from "./style-brush";

const log = getLogger("lets-style-brush");

interface CapturedBrush {
  runtime: FormatPainterRuntime;
  data: FormatPainterData | null;
  editor: HTMLElement;
  protyle: IProtyle;
  sourceRange: Range;
  sourceText: string;
  sourceBlockId: string;
  sourceIsHeading: boolean;
}

function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;").replace(/'/gu, "&#39;");
}

export default class StyleBrushPlugin extends SubPluginBase {
  private listening = false;

  private readonly handleContentMenu = (
    event: CustomEvent<IEventBusMap["open-menu-content"]>,
  ): void => {
    if (!this.isEntryEnabled("menu") || !normalizeSelectedText(event.detail.range.toString())) return;
    const range = event.detail.range.cloneRange();
    event.detail.menu.addItem({
      icon: "iconFormat",
      label: this.t("lets-style-brush.menuLabel"),
      submenu: this.scopeMenu(event.detail.protyle, range),
    });
  };

  override onload(): void {
    if (this.listening) return;
    this.listening = true;
    plugin.eventBus.on("open-menu-content", this.handleContentMenu);
  }

  override onunload(): void {
    if (!this.listening) return;
    plugin.eventBus.off("open-menu-content", this.handleContentMenu);
    this.listening = false;
  }

  updateProtyleToolbar(
    toolbar: Array<string | ProtyleToolbarItem>,
  ): Array<string | ProtyleToolbarItem> {
    if (toolbar.some((item) => typeof item !== "string" && item.name === "damophus-same-text-painter")) {
      return toolbar;
    }
    return [...toolbar, {
      name: "damophus-same-text-painter",
      icon: "iconFormat",
      tipPosition: "n",
      tip: this.t("lets-style-brush.toolbarTip"),
      click: (instance: Protyle) => this.openScopeDialog(instance.protyle),
    }];
  }

  private scopeMenu(protyle: IProtyle, range: Range): IMenu[] {
    return [
      { icon: "iconFile", label: this.t("lets-style-brush.scopeDocument"), click: () => void this.start(protyle, range, "document") },
      { icon: "iconHeading", label: this.t("lets-style-brush.scopeHeading"), click: () => void this.start(protyle, range, "heading") },
    ];
  }

  private capture(protyle: IProtyle, range: Range): CapturedBrush | undefined {
    const sourceText = normalizeSelectedText(range.toString());
    const sourceBlockId = selectedRangeBlockId(range);
    if (!sourceText || !sourceBlockId) {
      showMessage(this.t("lets-style-brush.noSelection"), 5000, "error");
      return undefined;
    }
    const runtime = findFormatPainter(protyle);
    if (!runtime) {
      showMessage(this.t("lets-style-brush.missingPainter"), 7000, "error");
      return undefined;
    }
    const sourceRange = range.cloneRange();
    const data = captureFormatPainterData(runtime, protyle, sourceRange);
    const sourceElement = (range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement)?.closest<HTMLElement>("[data-node-id]");
    return {
      runtime,
      data,
      editor: protyle.wysiwyg.element,
      protyle,
      sourceRange,
      sourceText,
      sourceBlockId,
      sourceIsHeading: sourceElement?.dataset.type === "NodeHeading",
    };
  }

  private openScopeDialog(protyle: IProtyle): void {
    const range = protyle.toolbar.range?.cloneRange();
    if (!range) {
      showMessage(this.t("lets-style-brush.noSelection"), 5000, "error");
      return;
    }
    const captured = this.capture(protyle, range);
    if (!captured) return;
    const dialog = new Dialog({
      title: this.t("lets-style-brush.confirmTitle"),
      width: "min(460px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <p>${escapeHtml(this.t("lets-style-brush.confirmDescription").replace("{text}", captured.sourceText))}</p>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(this.t("lets-style-brush.cancel"))}</button>
          <button class="b3-button b3-button--outline" data-scope="heading">${escapeHtml(this.t("lets-style-brush.scopeHeading"))}</button>
          <button class="b3-button b3-button--text" data-scope="document">${escapeHtml(this.t("lets-style-brush.scopeDocument"))}</button>
        </div>
      `,
    });
    dialog.element.querySelector('[data-action="cancel"]')?.addEventListener("click", () => dialog.destroy());
    dialog.element.querySelectorAll<HTMLElement>("[data-scope]").forEach((button) => {
      button.addEventListener("click", () => {
        dialog.destroy();
        void this.executeCaptured(captured, button.dataset.scope as StyleBrushScope);
      });
    });
  }

  private async start(protyle: IProtyle, range: Range, scope: StyleBrushScope): Promise<void> {
    const captured = this.capture(protyle, range);
    if (captured) await this.executeCaptured(captured, scope);
  }

  private async executeCaptured(captured: CapturedBrush, scope: StyleBrushScope): Promise<void> {
    try {
      let allowedIds: Set<string> | undefined;
      if (scope === "heading") {
        const breadcrumbs = await getBlockBreadcrumb(captured.sourceBlockId);
        const headingId = nearestHeadingId(captured.sourceBlockId, captured.sourceIsHeading, breadcrumbs);
        if (!headingId) {
          showMessage(this.t("lets-style-brush.noHeading"), 5000, "error");
          return;
        }
        allowedIds = new Set(await getHeadingChildrenIDs(headingId));
        allowedIds.add(headingId);
      }
      const matches = findSameTextMatches(
        captured.editor,
        captured.sourceText,
        allowedIds,
        captured.sourceRange,
      );
      if (matches.length === 0) {
        showMessage(this.t("lets-style-brush.noTargets"), 5000);
        return;
      }
      const applied = applyWithFormatPainter(captured.runtime, captured.protyle, captured.data, matches);
      showMessage(this.t("lets-style-brush.success").replace("{count}", String(applied)), 5000);
    } catch (error) {
      log.error("Same-text format painter failed", error);
      showMessage(this.t("lets-style-brush.writeFailed"), 7000, "error");
    }
  }
}

import {
  batchSetBlockAttrsStrict,
  getBlockAttrsStrict,
  getBlockBreadcrumb,
  getHeadingChildrenIDs,
  sqlStrict,
} from "@/api";
import { getLogger } from "@/libs/logger";
import { SubPluginBase } from "@/libs/sub-plugin-base";
import { plugin } from "@/utils";
import { Dialog, showMessage, type IEventBusMap, type IMenu } from "siyuan";
import {
  isValidStyleBrushBlockId,
  matchingStyleBrushTargetIds,
  nearestHeadingId,
  sourceBlockId,
  styleBrushBlockAttrs,
  type StyleBrushBlock,
  type StyleBrushScope,
} from "./style-brush";

const log = getLogger("lets-style-brush");

function escapeHtml(value: string): string {
  return value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&#39;");
}

function asStyleBrushBlock(value: StyleBrushBlock | undefined): StyleBrushBlock | undefined {
  if (!value || !isValidStyleBrushBlockId(value.id)) return undefined;
  if (typeof value.type !== "string") return undefined;
  return {
    id: value.id,
    type: value.type,
    subtype: typeof value.subtype === "string" ? value.subtype : "",
  };
}

export default class StyleBrushPlugin extends SubPluginBase {
  private listening = false;

  private readonly handleBlockMenu = (
    event: CustomEvent<IEventBusMap["click-blockicon"]>,
  ): void => {
    if (!this.isEntryEnabled("menu")) return;
    const sourceId = sourceBlockId(event.detail.blockElements);
    const rootId = event.detail.protyle.block.rootID;
    if (!sourceId || !isValidStyleBrushBlockId(rootId)) return;

    event.detail.menu.addItem({
      icon: "iconPaintBucket",
      label: this.t("lets-style-brush.menuLabel"),
      submenu: this.scopeMenu(sourceId, rootId, event.detail.protyle.wysiwyg.element),
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

  private scopeMenu(sourceId: string, rootId: string, editor: HTMLElement): IMenu[] {
    return [
      {
        icon: "iconFile",
        label: this.t("lets-style-brush.scopeDocument"),
        click: () => void this.prepare("document", sourceId, rootId, editor),
      },
      {
        icon: "iconHeading",
        label: this.t("lets-style-brush.scopeHeading"),
        click: () => void this.prepare("heading", sourceId, rootId, editor),
      },
    ];
  }

  private async prepare(
    scope: StyleBrushScope,
    sourceId: string,
    rootId: string,
    editor: HTMLElement,
  ): Promise<void> {
    try {
      const rows = await sqlStrict<StyleBrushBlock[]>(
        `SELECT id, type, subtype FROM blocks WHERE root_id = '${rootId}' ORDER BY sort ASC`,
      );
      const source = asStyleBrushBlock(rows.find((row) => row.id === sourceId));
      if (!source || source.id === rootId) {
        showMessage(this.t("lets-style-brush.unsupportedSource"), 5000, "error");
        return;
      }

      let allowedIds: Set<string> | undefined;
      if (scope === "heading") {
        const breadcrumbs = await getBlockBreadcrumb(sourceId);
        const headingId = nearestHeadingId(source, breadcrumbs);
        if (!headingId) {
          showMessage(this.t("lets-style-brush.noHeading"), 5000, "error");
          return;
        }
        allowedIds = new Set(await getHeadingChildrenIDs(headingId));
        allowedIds.add(headingId);
      }

      const targetIds = matchingStyleBrushTargetIds(source, rows, allowedIds);
      if (targetIds.length === 0) {
        showMessage(this.t("lets-style-brush.noTargets"), 5000);
        return;
      }
      const attrs = await getBlockAttrsStrict(sourceId);
      this.openConfirmation(scope, targetIds, attrs.style ?? "", editor);
    } catch (error) {
      log.error("Failed to prepare style brush", error);
      showMessage(this.t("lets-style-brush.prepareFailed"), 7000, "error");
    }
  }

  private openConfirmation(
    scope: StyleBrushScope,
    targetIds: string[],
    style: string,
    editor: HTMLElement,
  ): void {
    const count = String(targetIds.length);
    const dialog = new Dialog({
      title: this.t("lets-style-brush.confirmTitle"),
      width: "min(560px, 92vw)",
      content: `
        <div class="b3-dialog__content">
          <p>${escapeHtml(this.t("lets-style-brush.confirmDescription").replace("{count}", count))}</p>
          <p class="b3-label fn__space--top">${escapeHtml(
            scope === "document"
              ? this.t("lets-style-brush.scopeDocument")
              : this.t("lets-style-brush.scopeHeading"),
          )}</p>
          <pre class="fn__space--top" style="max-height: 180px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere;">${escapeHtml(
            style || this.t("lets-style-brush.emptyStyle"),
          )}</pre>
        </div>
        <div class="b3-dialog__action">
          <button class="b3-button b3-button--cancel" data-action="cancel">${escapeHtml(this.t("lets-style-brush.cancel"))}</button>
          <button class="b3-button b3-button--text" data-action="apply">${escapeHtml(this.t("lets-style-brush.apply"))}</button>
        </div>
      `,
    });
    dialog.element.querySelector<HTMLButtonElement>('[data-action="cancel"]')
      ?.addEventListener("click", () => dialog.destroy());
    const applyButton = dialog.element.querySelector<HTMLButtonElement>('[data-action="apply"]');
    applyButton?.addEventListener("click", () => {
      applyButton.disabled = true;
      void this.execute(targetIds, style, editor).finally(() => dialog.destroy());
    });
  }

  private async execute(targetIds: string[], style: string, editor: HTMLElement): Promise<void> {
    try {
      await batchSetBlockAttrsStrict(styleBrushBlockAttrs(targetIds, style));
    } catch (error) {
      log.error("Style brush write failed", error);
      showMessage(
        this.t("lets-style-brush.writeFailed"),
        7000,
        "error",
      );
      return;
    }

    for (const id of targetIds) {
      editor.querySelectorAll<HTMLElement>(`[data-node-id="${id}"]`).forEach((element) => {
        if (style) element.setAttribute("style", style);
        else element.removeAttribute("style");
      });
    }

    showMessage(
      this.t("lets-style-brush.success").replace("{count}", String(targetIds.length)),
      5000,
    );
  }
}

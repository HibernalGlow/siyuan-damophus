import { getAllEditor } from "siyuan";
import {
  mergeSlashMenuItems,
  parseSlashMenuConfig,
  parseSlashMenuItems,
  serializeSlashMenuConfig,
  serializeSlashMenuItems,
  type SlashMenuItem,
} from "./slash-menu-settings";

interface SlashHintData {
  id?: string;
  html: string;
  value: string;
}

interface SlashHintProvider {
  key: string;
  hint?: (value: string, protyle: SlashProtyle, source: "hint") => SlashHintData[];
}

interface SlashHint {
  element?: HTMLElement;
  enableExtend?: boolean;
  enableSlash?: boolean;
  lastIndex?: number;
  splitChar?: string;
  timeId?: number;
  genHTML?: (data: SlashHintData[], protyle: SlashProtyle, escape: boolean, source: "hint") => void;
  render: (protyle: SlashProtyle) => void;
}

interface SlashProtyle {
  hint?: SlashHint;
  options?: { hint?: { extend?: SlashHintProvider[] } };
  toolbar?: { range?: Range };
  wysiwyg?: { element: HTMLElement };
}

interface SlashEditor {
  protyle: SlashProtyle;
}

interface PatchedHint {
  original: SlashHint["render"];
  wrapped: SlashHint["render"];
  originalGenHTML?: NonNullable<SlashHint["genHTML"]>;
  wrappedGenHTML?: NonNullable<SlashHint["genHTML"]>;
}

interface SlashContext {
  index: number;
  key: string;
  range: Range;
}

export interface MobileSlashMenuRuntime {
  getEditors: () => SlashEditor[];
}

export interface SlashMenuOptions {
  enableDirectSlash: boolean;
  getConfig?: () => string;
  onDiscovered?: (value: string) => void;
  getCatalog?: () => string;
  onCatalog?: (value: string) => void;
}

const defaultRuntime: MobileSlashMenuRuntime = {
  getEditors: () => getAllEditor() as unknown as SlashEditor[],
};

const mobileSlashMenuStyleId = "damophus-mobile-slash-menu-style";
const mobileSlashMenuStyle = `
.protyle-hint[data-damophus-mobile-slash-menu="true"]:not(.fn__none) {
  display: block !important;
  container-type: inline-size;
  box-sizing: border-box;
  width: min(calc(100vw - 16px), 720px) !important;
  max-height: min(64vh, 560px);
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 4px;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"]:not(.fn__none) > div {
  display: grid !important;
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  grid-template-columns: repeat(auto-fill, minmax(48px, 1fr));
  gap: 2px;
  align-content: start;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .b3-list-item {
  min-width: 0;
  max-width: 100%;
  width: auto !important;
  overflow: hidden;
  min-height: 48px;
  box-sizing: border-box;
  margin: 0 !important;
  padding: 6px;
  align-items: center;
  justify-content: center;
  border-radius: 6px;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .b3-list-item > .b3-list-item__first {
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  justify-content: center;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--icon .b3-list-item__text,
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--icon .b3-menu__accelerator,
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--icon .b3-list-item__meta {
  display: none;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--full .b3-list-item__text {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--icon.damophus-slash-item--full .b3-list-item__text {
  display: -webkit-box;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--text {
  grid-column: span 3;
  justify-content: flex-start;
  padding-inline: 10px;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--text > .b3-list-item__first {
  justify-content: flex-start;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--text .b3-list-item__text {
  min-width: 0;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  line-height: 1.35;
  white-space: normal;
  overflow-wrap: anywhere;
}
.protyle-hint[data-damophus-mobile-slash-menu="true"] .b3-menu__separator,
.protyle-hint[data-damophus-mobile-slash-menu="true"] hr {
  grid-column: 1 / -1;
}
@container (min-width: 520px) {
  .protyle-hint[data-damophus-mobile-slash-menu="true"]:not(.fn__none) > div {
    grid-template-columns: repeat(auto-fit, minmax(156px, 1fr));
  }
  .protyle-hint[data-damophus-mobile-slash-menu="true"] .b3-list-item,
  .protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--text {
    grid-column: auto;
    min-height: 44px;
    justify-content: flex-start;
    padding: 7px 8px;
  }
  .protyle-hint[data-damophus-mobile-slash-menu="true"] .b3-list-item > .b3-list-item__first {
    justify-content: flex-start;
  }
  .protyle-hint[data-damophus-mobile-slash-menu="true"] .damophus-slash-item--icon .b3-list-item__text {
    min-width: 0;
    overflow: hidden;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-height: 1.35;
    white-space: normal;
    overflow-wrap: anywhere;
  }
}
`;

const findContainingElement = (node: Node): Element | null =>
  node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;

/**
 * Browser-mobile Protyle already ships the complete native slash provider, but
 * Hint.render() intentionally blocks that provider whenever #sidebar exists.
 * Invoke only that synchronous provider on mobile and leave every other hint
 * path, command definition, rendering behavior, and selection action native.
 */
export class MobileSlashMenuShortcut {
  private readonly patchedHints = new Map<SlashHint, PatchedHint>();
  private readonly attachedProtyles = new Set<SlashProtyle>();

  constructor(
    private readonly targetDocument: Document = document,
    private readonly runtime: MobileSlashMenuRuntime = defaultRuntime,
    private readonly options: SlashMenuOptions = { enableDirectSlash: true },
  ) {}

  start(_label?: string): void {
    this.patchEditors();
    this.mountStyle();
    this.targetDocument.addEventListener("input", this.handleInput, true);
  }

  stop(): void {
    this.targetDocument.removeEventListener("input", this.handleInput, true);
    this.targetDocument.getElementById(mobileSlashMenuStyleId)?.remove();
    for (const protyle of this.attachedProtyles) {
      protyle.wysiwyg?.element.removeAttribute("data-damophus-mobile-slash-menu");
    }
    this.attachedProtyles.clear();
    for (const [hint, patch] of this.patchedHints) {
      if (hint.render === patch.wrapped) hint.render = patch.original;
      if (patch.originalGenHTML && hint.genHTML === patch.wrappedGenHTML) {
        hint.genHTML = patch.originalGenHTML;
      }
    }
    this.patchedHints.clear();
  }

  private patchEditors(): void {
    for (const editor of this.runtime.getEditors()) this.attach(editor.protyle);
  }

  scanEditors(): string | undefined {
    let catalog = this.options.getCatalog?.();
    for (const editor of this.runtime.getEditors()) {
      catalog = this.scan(editor.protyle) ?? catalog;
    }
    return catalog;
  }

  scan(protyle: SlashProtyle): string | undefined {
    const provider = protyle.options?.hint?.extend?.find((item) => item.key === "/");
    if (!provider?.hint) return;
    try {
      const data = provider.hint("", protyle, "hint");
      if (!Array.isArray(data) || data.length === 0) return;
      return this.persistDiscovered(this.toMenuItems(data));
    } catch {
      return;
    }
  }

  attach(protyle: SlashProtyle): void {
    this.scan(protyle);
    const hint = protyle.hint;
    if (!hint) return;
    this.attachedProtyles.add(protyle);
    protyle.wysiwyg?.element.setAttribute("data-damophus-mobile-slash-menu", "true");
    this.patchHint(hint);
  }

  private mountStyle(): void {
    const head = this.targetDocument.head;
    if (!head || this.targetDocument.getElementById(mobileSlashMenuStyleId)) return;
    const style = this.targetDocument.createElement("style");
    style.id = mobileSlashMenuStyleId;
    style.textContent = mobileSlashMenuStyle;
    head.append(style);
  }

  detach(protyle: SlashProtyle): void {
    protyle.wysiwyg?.element.removeAttribute("data-damophus-mobile-slash-menu");
    this.attachedProtyles.delete(protyle);
  }

  private readonly handleInput = (event: Event): void => {
    const inputEvent = event as InputEvent;
    if (inputEvent.data !== "/") return;
    const target = event.target as Node | null;
    const protyle = [...this.attachedProtyles]
      .find((item) => target && item.wysiwyg?.element.contains(target));
    const hint = protyle?.hint;
    if (!hint) return;
    hint.enableExtend = true;
    hint.enableSlash = true;
    hint.splitChar = "";
    hint.lastIndex = -1;
    if (typeof hint.timeId === "number") this.targetDocument.defaultView?.clearTimeout(hint.timeId);
    hint.element?.querySelectorAll(".fn__loading").forEach((element) => element.remove());
  };

  private patchHint(hint: SlashHint): void {
    if (this.patchedHints.has(hint)) return;
    const original = hint.render;
    const shortcut = this;
    const originalGenHTML = hint.genHTML;
    const wrappedGenHTML = !this.options.enableDirectSlash && originalGenHTML
      ? function (
          this: SlashHint,
          data: SlashHintData[],
          protyle: SlashProtyle,
          escape: boolean,
          source: "hint",
        ): void {
          const context = shortcut.getSlashContext(protyle);
          if (!context) {
            originalGenHTML.call(this, data, protyle, escape, source);
            return;
          }
          const configured = shortcut.applyMenuConfig(data, context.key);
          originalGenHTML.call(this, configured.data, protyle, escape, source);
          shortcut.enhanceMenu(this.element, configured.displayById);
        }
      : undefined;
    if (wrappedGenHTML) hint.genHTML = wrappedGenHTML;
    const wrapped: SlashHint["render"] = function (this: SlashHint, protyle): void {
      const context = shortcut.getSlashContext(protyle);
      const provider = protyle.options?.hint?.extend?.find((item) => item.key === "/");
      if (!context) {
        this.element?.removeAttribute("data-damophus-mobile-slash-menu");
        original.call(this, protyle);
        return;
      }

      if (!shortcut.options.enableDirectSlash) {
        original.call(this, protyle);
        return;
      }

      if (!provider?.hint || !this.genHTML || this.enableSlash === false) {
        original.call(this, protyle);
        return;
      }

      if (typeof this.timeId === "number") shortcut.targetDocument.defaultView?.clearTimeout(this.timeId);
      this.element?.querySelectorAll(".fn__loading").forEach((element) => element.remove());
      this.enableExtend = true;
      this.splitChar = "/";
      this.lastIndex = context.index;
      if (protyle.toolbar) protyle.toolbar.range = context.range;
      const nativeData = provider.hint(context.key, protyle, "hint");
      const configured = shortcut.applyMenuConfig(nativeData, context.key);
      this.genHTML(configured.data, protyle, false, "hint");
      shortcut.enhanceMenu(this.element, configured.displayById);
    };
    hint.render = wrapped;
    this.patchedHints.set(hint, { original, wrapped, originalGenHTML, wrappedGenHTML });
  }

  private applyMenuConfig(data: SlashHintData[], query = ""): { data: SlashHintData[]; displayById: Map<string, "icon" | "full"> } {
    const discovered = this.toMenuItems(data);
    if (!query) this.persistDiscovered(discovered);
    const catalog = parseSlashMenuItems(this.options.getCatalog?.());
    const config = mergeSlashMenuItems(catalog.length > 0 ? catalog : discovered, parseSlashMenuConfig(this.options.getConfig?.()));
    const discoveredById = new Map(discovered.map((item, index) => [item.id, { item, index }]));
    const nextData: SlashHintData[] = [];
    const displayById = new Map<string, "icon" | "full">();
    for (const entry of config) {
      const found = discoveredById.get(entry.id);
      if (!found || !entry.visible) continue;
      nextData.push(data[found.index]);
      displayById.set(entry.id, found.item.hasIcon && entry.display === "icon" ? "icon" : "full");
    }
    const serialized = serializeSlashMenuConfig(config);
    if (serialized !== this.options.getConfig?.()) this.options.onDiscovered?.(serialized);
    return { data: nextData, displayById };
  }

  private toMenuItems(data: SlashHintData[]): SlashMenuItem[] {
    return data.map((item, index) => {
      const icon = this.dataIcon(item.html);
      return {
        id: this.dataId(item, index),
        label: this.dataLabel(item.html),
        hasIcon: icon.hasIcon,
        iconId: icon.iconId,
        iconText: icon.iconText,
        separator: item.html === "separator",
      };
    });
  }

  private persistDiscovered(discovered: SlashMenuItem[]): string {
    const previous = parseSlashMenuItems(this.options.getCatalog?.());
    const discoveredById = new Map(discovered.map((item) => [item.id, item]));
    const next = previous.map((item) => discoveredById.get(item.id) ?? item);
    const known = new Set(previous.map((item) => item.id));
    next.push(...discovered.filter((item) => !known.has(item.id)));
    const catalog = serializeSlashMenuItems(next);
    if (catalog !== this.options.getCatalog?.()) this.options.onCatalog?.(catalog);
    const config = serializeSlashMenuConfig(mergeSlashMenuItems(next, parseSlashMenuConfig(this.options.getConfig?.())));
    if (config !== this.options.getConfig?.()) this.options.onDiscovered?.(config);
    return catalog;
  }

  private dataId(item: SlashHintData, index: number): string {
    return item.id || item.value || `slash-${index}`;
  }

  private dataLabel(html: string): string {
    if (html === "separator") return "separator";
    return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  }

  private dataIcon(html: string): Pick<SlashMenuItem, "hasIcon" | "iconId" | "iconText"> {
    if (html === "separator") return { hasIcon: false };
    const template = this.targetDocument.createElement("template");
    template.innerHTML = html;
    const graphic = template.content.querySelector<HTMLElement>(".b3-list-item__graphic")
      ?? template.content.querySelector<SVGElement>("svg");
    if (!graphic) return { hasIcon: false };

    const use = graphic.matches("use") ? graphic : graphic.querySelector("use");
    const href = use?.getAttribute("href") ?? use?.getAttribute("xlink:href");
    const iconId = href?.match(/^#([A-Za-z][\w:.-]{0,127})$/u)?.[1];
    if (iconId) return { hasIcon: true, iconId };

    const iconText = graphic.textContent?.replace(/\s+/gu, " ").trim();
    if (iconText && [...iconText].length <= 8) return { hasIcon: true, iconText };
    return { hasIcon: true };
  }

  private enhanceMenu(element?: HTMLElement, displayById = new Map<string, "icon" | "full">()): void {
    if (!element?.querySelector(".b3-list-item")) return;
    element.setAttribute("data-damophus-mobile-slash-menu", "true");
    element.querySelectorAll<HTMLElement>(".b3-list-item").forEach((item) => {
      const hasIcon = item.querySelector(".b3-list-item__graphic") !== null;
      const id = item.dataset.id || "";
      const display = displayById.get(id) ?? (hasIcon ? "icon" : "full");
      item.classList.toggle("damophus-slash-item--icon", hasIcon);
      item.classList.toggle("damophus-slash-item--full", display === "full" || !hasIcon);
      item.classList.toggle("damophus-slash-item--text", !hasIcon);
      const label = item.querySelector<HTMLElement>(".b3-list-item__text")?.textContent?.trim();
      if (hasIcon && label) item.title = label;
    });
  }

  private getSlashContext(protyle: SlashProtyle): SlashContext | undefined {
    const wysiwyg = protyle.wysiwyg?.element;
    const selection = this.targetDocument.defaultView?.getSelection();
    if (!wysiwyg || !selection?.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0).cloneRange();
    if (!wysiwyg.contains(range.startContainer)) return;

    const containingElement = findContainingElement(range.startContainer);
    if (containingElement?.closest('[data-type="code"], [data-type="NodeCodeBlock"]')) return;
    const block = containingElement?.closest<HTMLElement>("[data-node-id]");
    if (!block || !wysiwyg.contains(block)) return;

    const beforeCaret = range.cloneRange();
    beforeCaret.selectNodeContents(block);
    beforeCaret.setEnd(range.startContainer, range.startOffset);
    const currentLineValue = beforeCaret.toString();
    const index = currentLineValue.lastIndexOf("/");
    if (index < 0) return;
    const key = currentLineValue.slice(index + 1);
    if (key.trimStart() !== key || key.includes("\n") || key.length >= 512) return;
    return { index, key, range };
  }
}

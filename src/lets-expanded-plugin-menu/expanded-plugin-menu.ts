export const EXPANDED_PLUGIN_MENU_STYLE_ID = "damophus-expanded-plugin-menu-style";
export const EXPANDED_PLUGIN_MENU_ATTRIBUTE = "data-damophus-expanded-plugin-menu";
export const EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE = "data-damophus-expanded-plugin-menu-root";
export const EXPANDED_PLUGIN_MENU_PANEL_CLASS = "damophus-expanded-plugin-menu__panel";

const MENU_SELECTOR = ".b3-menu";
const ITEM_SELECTOR = ".b3-menu__item";
const SUBMENU_SELECTOR = ".b3-menu__submenu";
const ITEMS_SELECTOR = ".b3-menu__items";
const LABEL_SELECTOR = ".b3-menu__label";

export const EXPANDED_PLUGIN_MENU_CSS = `
@media (hover: hover) and (pointer: fine) {
  .b3-menu[${EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE}] {
    overflow: visible !important;
  }

  .b3-menu__item[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}] > .b3-menu__submenu {
    display: block !important;
    position: fixed !important;
    box-sizing: border-box;
    width: var(--damophus-plugin-menu-width, 880px) !important;
    height: auto !important;
    max-width: calc(100vw - 24px) !important;
    max-height: calc(100vh - 24px) !important;
    padding: 8px !important;
    overflow: auto !important;
    overscroll-behavior: contain;
    visibility: visible !important;
    opacity: 1 !important;
    transform: none !important;
    pointer-events: auto !important;
  }

  .b3-menu__item[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}] > .b3-menu__submenu > .b3-menu__items {
    display: none !important;
  }

  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS} {
    display: grid;
    grid-template-columns: repeat(var(--damophus-plugin-menu-columns, 4), minmax(0, 1fr));
    grid-auto-rows: minmax(30px, auto);
    align-items: stretch;
    gap: 1px 8px;
    min-width: 0;
  }

  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS} > .b3-menu__item {
    min-width: 0;
    width: 100%;
    min-height: 30px;
    height: auto;
    margin: 0;
    padding: 3px 8px;
    line-height: 20px;
    align-items: center;
  }

  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS} > .b3-menu__item > .b3-menu__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS} > .b3-menu__item > .b3-menu__submenu,
  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS} > .b3-menu__item > .b3-menu__icon--small {
    display: none !important;
  }
}
`;

interface MovedCommand {
  item: HTMLElement;
  placeholder: Comment;
  label: HTMLElement;
  originalLabel: string;
  originalTitle: string | null;
}

interface EnhancedMenu {
  rootItem: HTMLElement;
  rootMenu: HTMLElement;
  submenu: HTMLElement;
  panel: HTMLElement;
  movedCommands: MovedCommand[];
}

function directChild<T extends Element>(element: Element, selector: string): T | undefined {
  return Array.from(element.children).find((child) => child.matches(selector)) as T | undefined;
}

function directSubmenu(item: HTMLElement): HTMLElement | undefined {
  return directChild<HTMLElement>(item, SUBMENU_SELECTOR);
}

function submenuItems(submenu: HTMLElement): HTMLElement {
  return directChild<HTMLElement>(submenu, ITEMS_SELECTOR) ?? submenu;
}

function directLabel(item: HTMLElement): HTMLElement | undefined {
  return directChild<HTMLElement>(item, LABEL_SELECTOR);
}

function normalizedLabel(item: HTMLElement): string {
  return directLabel(item)?.textContent?.trim() ?? "";
}

function isPluginBranch(item: HTMLElement): boolean {
  if (!directSubmenu(item)) return false;
  const label = normalizedLabel(item).toLocaleLowerCase();
  return label === "插件" || label === "plugins" || label === "plugin";
}

function collectLeafCommands(
  submenu: HTMLElement,
  path: string[] = [],
): Array<{ item: HTMLElement; path: string[] }> {
  const commands: Array<{ item: HTMLElement; path: string[] }> = [];
  for (const child of submenuItems(submenu).children) {
    if (!(child instanceof HTMLElement) || !child.matches(ITEM_SELECTOR)) continue;
    const label = normalizedLabel(child);
    if (!label) continue;
    const childSubmenu = directSubmenu(child);
    if (childSubmenu) commands.push(...collectLeafCommands(childSubmenu, [...path, label]));
    else commands.push({ item: child, path: [...path, label] });
  }
  return commands;
}

function readablePath(path: string[]): string {
  return path.join(" / ");
}

function flattenCommands(submenu: HTMLElement): Pick<EnhancedMenu, "panel" | "movedCommands"> {
  const targetDocument = submenu.ownerDocument;
  const panel = targetDocument.createElement("div");
  panel.className = EXPANDED_PLUGIN_MENU_PANEL_CLASS;
  const movedCommands: MovedCommand[] = [];

  for (const command of collectLeafCommands(submenu)) {
    const label = directLabel(command.item);
    if (!label || !command.item.parentNode) continue;
    const placeholder = targetDocument.createComment("damophus-plugin-menu-command");
    command.item.before(placeholder);
    const originalLabel = label.textContent ?? "";
    const originalTitle = command.item.getAttribute("title");
    const fullLabel = readablePath(command.path);
    label.textContent = fullLabel;
    command.item.title = fullLabel;
    panel.append(command.item);
    movedCommands.push({ item: command.item, placeholder, label, originalLabel, originalTitle });
  }

  submenu.append(panel);
  return { panel, movedCommands };
}

function restoreCommands(enhanced: EnhancedMenu): void {
  for (const command of enhanced.movedCommands) {
    if (command.placeholder.isConnected) command.placeholder.replaceWith(command.item);
    command.label.textContent = command.originalLabel;
    if (command.originalTitle === null) command.item.removeAttribute("title");
    else command.item.title = command.originalTitle;
  }
  enhanced.panel.remove();
}

function positionPanel(enhanced: EnhancedMenu): void {
  const { rootItem, submenu, panel } = enhanced;
  const view = rootItem.ownerDocument.defaultView;
  const viewportWidth = view?.innerWidth ?? 1280;
  const viewportHeight = view?.innerHeight ?? 720;
  const itemRect = rootItem.getBoundingClientRect();
  const gap = 6;
  const margin = 12;
  const availableRight = viewportWidth - itemRect.right - gap - margin;
  const availableLeft = itemRect.left - gap - margin;
  const direction = availableRight >= 420 || availableRight >= availableLeft ? "right" : "left";
  const availableWidth = Math.max(320, direction === "right" ? availableRight : availableLeft);
  const width = Math.min(920, availableWidth);
  const columns = Math.max(2, Math.min(4, Math.floor(width / 210)));

  rootItem.setAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE, direction);
  rootItem.style.setProperty("--damophus-plugin-menu-width", `${Math.floor(width)}px`);
  rootItem.style.setProperty("--damophus-plugin-menu-columns", String(columns));
  submenu.style.left = `${Math.round(direction === "right" ? itemRect.right + gap : itemRect.left - gap - width)}px`;
  submenu.style.right = "auto";
  submenu.style.top = `${margin}px`;
  submenu.style.bottom = "auto";

  const height = Math.min(panel.scrollHeight + 16, viewportHeight - margin * 2);
  const preferredTop = itemRect.top - Math.min(96, height * 0.2);
  const top = Math.max(margin, Math.min(preferredTop, viewportHeight - height - margin));
  submenu.style.top = `${Math.round(top)}px`;
}

export class ExpandedPluginMenuController {
  private observer?: MutationObserver;
  private running = false;
  private readonly enhancedMenus = new Map<HTMLElement, EnhancedMenu>();

  constructor(private readonly targetDocument: Document = document) {}

  start(): void {
    this.running = true;
    this.mountStyle();
    this.enhanceMenus(this.targetDocument);
    if (this.observer) return;
    const MutationObserverConstructor = this.targetDocument.defaultView?.MutationObserver;
    if (!MutationObserverConstructor) return;
    this.observer = new MutationObserverConstructor((records) => {
      if (!this.running) return;
      this.pruneDisconnectedMenus();
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof Element) this.enhanceMenus(node);
        }
      }
    });
    this.observer.observe(this.targetDocument.body, { childList: true, subtree: true });
  }

  refresh(): void {
    this.pruneDisconnectedMenus();
    for (const enhanced of this.enhancedMenus.values()) positionPanel(enhanced);
  }

  destroy(): void {
    this.running = false;
    this.observer?.takeRecords();
    this.observer?.disconnect();
    this.observer = undefined;
    for (const enhanced of this.enhancedMenus.values()) this.restoreMenu(enhanced);
    this.enhancedMenus.clear();
    this.targetDocument.getElementById(EXPANDED_PLUGIN_MENU_STYLE_ID)?.remove();
  }

  private mountStyle(): void {
    const existing = this.targetDocument.getElementById(EXPANDED_PLUGIN_MENU_STYLE_ID);
    if (existing) {
      if (existing.textContent !== EXPANDED_PLUGIN_MENU_CSS) existing.textContent = EXPANDED_PLUGIN_MENU_CSS;
      return;
    }
    const style = this.targetDocument.createElement("style");
    style.id = EXPANDED_PLUGIN_MENU_STYLE_ID;
    style.textContent = EXPANDED_PLUGIN_MENU_CSS;
    this.targetDocument.head.append(style);
  }

  private pruneDisconnectedMenus(): void {
    for (const [item, enhanced] of this.enhancedMenus) {
      if (!item.isConnected) {
        enhanced.panel.remove();
        this.enhancedMenus.delete(item);
      }
    }
  }

  private enhanceMenus(root: ParentNode): void {
    if (!this.running) return;
    const candidates: HTMLElement[] = [];
    if (root instanceof HTMLElement && root.matches(ITEM_SELECTOR)) candidates.push(root);
    root.querySelectorAll<HTMLElement>(ITEM_SELECTOR).forEach((item) => candidates.push(item));
    for (const rootItem of candidates) {
      if (!isPluginBranch(rootItem) || this.enhancedMenus.has(rootItem)) continue;
      const rootMenu = rootItem.closest<HTMLElement>(MENU_SELECTOR);
      const submenu = directSubmenu(rootItem);
      if (!rootMenu || !submenu || rootMenu.closest(".protyle-hint")) continue;
      const flattened = flattenCommands(submenu);
      if (flattened.movedCommands.length === 0) {
        flattened.panel.remove();
        continue;
      }
      const enhanced: EnhancedMenu = { rootItem, rootMenu, submenu, ...flattened };
      rootMenu.setAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE, "");
      this.enhancedMenus.set(rootItem, enhanced);
      positionPanel(enhanced);
    }
  }

  private restoreMenu(enhanced: EnhancedMenu): void {
    restoreCommands(enhanced);
    enhanced.rootItem.removeAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE);
    enhanced.rootItem.style.removeProperty("--damophus-plugin-menu-width");
    enhanced.rootItem.style.removeProperty("--damophus-plugin-menu-columns");
    enhanced.submenu.style.removeProperty("left");
    enhanced.submenu.style.removeProperty("right");
    enhanced.submenu.style.removeProperty("top");
    enhanced.submenu.style.removeProperty("bottom");
    if (!enhanced.rootMenu.querySelector(`[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}]`)) {
      enhanced.rootMenu.removeAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE);
    }
  }
}

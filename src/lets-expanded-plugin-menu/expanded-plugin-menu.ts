import {
  MENU_DECLARATION_ATTRIBUTE,
  MENU_MODULE_ATTRIBUTE,
  MENU_PLUGIN_ATTRIBUTE,
} from "@/libs/menu-identity";

export const EXPANDED_PLUGIN_MENU_STYLE_ID = "damophus-expanded-plugin-menu-style";
export const EXPANDED_PLUGIN_MENU_ATTRIBUTE = "data-damophus-expanded-plugin-menu";
export const EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE = "data-damophus-expanded-plugin-menu-root";
export const EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE = "data-damophus-expanded-plugin-menu-visible";
export const EXPANDED_PLUGIN_MENU_PANEL_CLASS = "damophus-expanded-plugin-menu__panel";
export const EXPANDED_PLUGIN_MENU_GROUP_CLASS = "damophus-expanded-plugin-menu__group";
export const EXPANDED_PLUGIN_MENU_GROUP_TITLE_CLASS = "damophus-expanded-plugin-menu__group-title";
export const EXPANDED_PLUGIN_MENU_PRIMARY_CLASS = "damophus-expanded-plugin-menu__primary";
export const EXPANDED_PLUGIN_MENU_OTHER_CLASS = "damophus-expanded-plugin-menu__other";
export const DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES = [
  "module:calloutTools",
  "module:questionBank",
  "module:documentHistoryDiff",
].join("\n");

const MENU_SELECTOR = ".b3-menu";
const ITEM_SELECTOR = ".b3-menu__item";
const SUBMENU_SELECTOR = ".b3-menu__submenu";
const ITEMS_SELECTOR = ".b3-menu__items";
const LABEL_SELECTOR = ".b3-menu__label";
const IDENTITY_SELECTOR_PREFIXES = ["plugin", "module", "declaration"] as const;

type MenuIdentityKind = typeof IDENTITY_SELECTOR_PREFIXES[number];

export interface ExpandedPluginMenuAllowedEntries {
  labels: ReadonlySet<string>;
  identities: ReadonlyMap<MenuIdentityKind, ReadonlySet<string>>;
}

export const EXPANDED_PLUGIN_MENU_CSS = `
@media (hover: hover) and (pointer: fine) {
  .b3-menu[${EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE}] {
    overflow: visible !important;
  }

  .b3-menu__item[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}] > .b3-menu__submenu {
    display: block !important;
    position: fixed !important;
    box-sizing: border-box;
    width: max-content !important;
    height: auto !important;
    max-width: calc(100vw - 24px) !important;
    max-height: calc(100vh - 24px) !important;
    padding: 8px !important;
    overflow: auto !important;
    overscroll-behavior: contain;
    visibility: hidden !important;
    opacity: 0 !important;
    transform: none !important;
    pointer-events: none !important;
  }

  .b3-menu__item[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}][${EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE}] > .b3-menu__submenu {
    visibility: visible !important;
    opacity: 1 !important;
    pointer-events: auto !important;
  }

  .b3-menu__item[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}] > .b3-menu__submenu > .b3-menu__items {
    display: none !important;
  }

  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS} {
    display: grid;
    grid-template-columns: repeat(var(--damophus-plugin-menu-sections, 1), minmax(176px, max-content));
    align-items: start;
    gap: 8px 0;
    width: max-content;
    max-width: 100%;
    min-width: 0;
  }

  .${EXPANDED_PLUGIN_MENU_PRIMARY_CLASS} {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    min-width: 176px;
  }

  .${EXPANDED_PLUGIN_MENU_PRIMARY_CLASS} > .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} + .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} {
    margin-top: 8px;
  }

  .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} {
    display: flex;
    flex-direction: column;
    box-sizing: border-box;
    min-width: 176px;
    max-width: 280px;
    padding: 0 8px;
    border-left: 1px solid var(--b3-border-color, rgba(127, 127, 127, 0.22));
  }

  .${EXPANDED_PLUGIN_MENU_PRIMARY_CLASS} > .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} {
    border-left: 0;
  }

  .${EXPANDED_PLUGIN_MENU_OTHER_CLASS} {
    display: grid;
    grid-template-columns: repeat(var(--damophus-plugin-menu-other-columns, 1), minmax(176px, max-content));
    align-items: start;
    width: max-content;
    max-width: unset;
  }

  .${EXPANDED_PLUGIN_MENU_OTHER_CLASS} > .${EXPANDED_PLUGIN_MENU_GROUP_TITLE_CLASS} {
    grid-column: 1 / -1;
  }

  .${EXPANDED_PLUGIN_MENU_PANEL_CLASS}[data-layout="below"] > .${EXPANDED_PLUGIN_MENU_OTHER_CLASS} {
    padding-top: 8px;
    border-top: 1px solid var(--b3-border-color, rgba(127, 127, 127, 0.22));
    border-left: 0;
  }

  .${EXPANDED_PLUGIN_MENU_GROUP_TITLE_CLASS} {
    box-sizing: border-box;
    min-height: 28px;
    padding: 3px 8px 5px;
    overflow: hidden;
    color: var(--b3-theme-on-surface, currentColor);
    font-size: 12px;
    font-weight: 600;
    line-height: 20px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} > .b3-menu__item {
    min-width: 0;
    width: 100%;
    min-height: 30px;
    height: auto;
    margin: 0;
    padding: 3px 8px;
    line-height: 20px;
    align-items: center;
  }

  .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} > .b3-menu__item > .b3-menu__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .${EXPANDED_PLUGIN_MENU_GROUP_CLASS} > .b3-menu__item > .b3-menu__icon--small {
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
  removeInteractionListeners: () => void;
}

export function parseExpandedPluginMenuAllowedEntries(value: unknown): ExpandedPluginMenuAllowedEntries {
  const labels = new Set<string>();
  const identities = new Map<MenuIdentityKind, Set<string>>(
    IDENTITY_SELECTOR_PREFIXES.map((kind) => [kind, new Set<string>()]),
  );
  if (typeof value !== "string") return { labels, identities };
  for (const sourceEntry of value.split(/\r?\n/u)) {
    const entry = sourceEntry.trim();
    if (!entry) continue;
    const separator = entry.indexOf(":");
    const kind = entry.slice(0, separator).toLocaleLowerCase() as MenuIdentityKind;
    const identity = entry.slice(separator + 1).trim().toLocaleLowerCase();
    if (separator > 0 && IDENTITY_SELECTOR_PREFIXES.includes(kind) && identity) {
      identities.get(kind)?.add(identity);
    } else {
      labels.add(entry.toLocaleLowerCase());
    }
  }
  return { labels, identities };
}

function allowedEntriesSignature(entries: ExpandedPluginMenuAllowedEntries): string {
  return JSON.stringify({
    labels: [...entries.labels].sort(),
    identities: IDENTITY_SELECTOR_PREFIXES.map((kind) => [kind, [...(entries.identities.get(kind) ?? [])].sort()]),
  });
}

function isAllowedEntry(item: HTMLElement, allowedEntries: ExpandedPluginMenuAllowedEntries): boolean {
  if (allowedEntries.labels.has(normalizedLabel(item).toLocaleLowerCase())) return true;
  const identityAttributes: Record<MenuIdentityKind, string> = {
    plugin: MENU_PLUGIN_ATTRIBUTE,
    module: MENU_MODULE_ATTRIBUTE,
    declaration: MENU_DECLARATION_ATTRIBUTE,
  };
  return IDENTITY_SELECTOR_PREFIXES.some((kind) => {
    const identity = item.getAttribute(identityAttributes[kind])?.trim().toLocaleLowerCase();
    return Boolean(identity && allowedEntries.identities.get(kind)?.has(identity));
  });
}

function hasAllowedEntries(entries: ExpandedPluginMenuAllowedEntries): boolean {
  if (entries.labels.size > 0) return true;
  return IDENTITY_SELECTOR_PREFIXES.some((kind) => (entries.identities.get(kind)?.size ?? 0) > 0);
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

function moveCommand(
  item: HTMLElement,
  panel: HTMLElement,
  path?: string[],
): MovedCommand | undefined {
  const label = directLabel(item);
  if (!label || !item.parentNode) return;
  const placeholder = item.ownerDocument.createComment("damophus-plugin-menu-command");
  item.before(placeholder);
  const originalLabel = label.textContent ?? "";
  const originalTitle = item.getAttribute("title");
  if (path) {
    const fullLabel = readablePath(path);
    label.textContent = fullLabel;
    item.title = fullLabel;
  }
  panel.append(item);
  return { item, placeholder, label, originalLabel, originalTitle };
}

function createGroup(panel: HTMLElement, title: string): HTMLElement {
  const group = panel.ownerDocument.createElement("div");
  group.className = EXPANDED_PLUGIN_MENU_GROUP_CLASS;
  const heading = panel.ownerDocument.createElement("div");
  heading.className = EXPANDED_PLUGIN_MENU_GROUP_TITLE_CLASS;
  heading.textContent = title;
  heading.title = title;
  group.append(heading);
  return group;
}

function localizedGroupTitle(submenu: HTMLElement, chinese: string, english: string): string {
  const pluginItem = submenu.parentElement;
  return pluginItem instanceof HTMLElement && normalizedLabel(pluginItem) === "插件" ? chinese : english;
}

function flattenCommands(
  submenu: HTMLElement,
  allowedEntries: ExpandedPluginMenuAllowedEntries,
): Pick<EnhancedMenu, "panel" | "movedCommands"> {
  const targetDocument = submenu.ownerDocument;
  const panel = targetDocument.createElement("div");
  panel.className = EXPANDED_PLUGIN_MENU_PANEL_CLASS;
  const primary = targetDocument.createElement("div");
  primary.className = EXPANDED_PLUGIN_MENU_PRIMARY_CLASS;
  const movedCommands: MovedCommand[] = [];
  let commandsGroup: HTMLElement | undefined;
  let otherEntriesGroup: HTMLElement | undefined;
  const expandedGroups: HTMLElement[] = [];

  for (const child of Array.from(submenuItems(submenu).children)) {
    if (!(child instanceof HTMLElement) || !child.matches(ITEM_SELECTOR)) continue;
    const label = normalizedLabel(child);
    if (!label) continue;
    if (isAllowedEntry(child, allowedEntries)) {
      const childSubmenu = directSubmenu(child);
      if (!childSubmenu) {
        commandsGroup ??= createGroup(
          panel,
          localizedGroupTitle(submenu, "快捷命令", "Commands"),
        );
        const moved = moveCommand(child, commandsGroup);
        if (moved) movedCommands.push(moved);
        continue;
      }
      const group = createGroup(panel, label);
      expandedGroups.push(group);
      const commands = collectLeafCommands(childSubmenu);
      for (const command of commands) {
        const moved = moveCommand(command.item, group, command.path);
        if (moved) movedCommands.push(moved);
      }
      continue;
    }
    otherEntriesGroup ??= createGroup(
      panel,
      localizedGroupTitle(submenu, "其他插件", "Other plugins"),
    );
    const moved = moveCommand(child, otherEntriesGroup);
    if (moved) movedCommands.push(moved);
  }

  if (commandsGroup) primary.append(commandsGroup);
  primary.append(...expandedGroups);
  if (primary.childElementCount > 0) panel.append(primary);
  if (otherEntriesGroup) {
    otherEntriesGroup.classList.add(EXPANDED_PLUGIN_MENU_OTHER_CLASS);
    panel.append(otherEntriesGroup);
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

function topLevelItemForTarget(target: EventTarget | null, rootItem: HTMLElement): HTMLElement | undefined {
  if (!(target instanceof Element)) return;
  const itemContainer = rootItem.parentElement;
  if (!itemContainer) return;
  let item = target.closest<HTMLElement>(ITEM_SELECTOR) ?? undefined;
  while (item && item.parentElement !== itemContainer) {
    item = item.parentElement?.closest<HTMLElement>(ITEM_SELECTOR) ?? undefined;
  }
  return item;
}

function setPanelVisible(enhanced: EnhancedMenu, visible: boolean): void {
  const wasVisible = enhanced.rootItem.hasAttribute(EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE);
  enhanced.rootItem.toggleAttribute(EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE, visible);
  if (visible && !wasVisible) positionPanel(enhanced);
}

function installInteractionHandling(enhanced: EnhancedMenu): () => void {
  const handleInteraction = (event: Event) => {
    const item = topLevelItemForTarget(event.target, enhanced.rootItem);
    if (item) setPanelVisible(enhanced, item === enhanced.rootItem);
  };
  enhanced.rootMenu.addEventListener("pointerover", handleInteraction, true);
  enhanced.rootMenu.addEventListener("focusin", handleInteraction, true);
  return () => {
    enhanced.rootMenu.removeEventListener("pointerover", handleInteraction, true);
    enhanced.rootMenu.removeEventListener("focusin", handleInteraction, true);
  };
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
  const otherGroup = directChild<HTMLElement>(panel, `.${EXPANDED_PLUGIN_MENU_OTHER_CLASS}`);
  const otherItemCount = otherGroup?.querySelectorAll(":scope > .b3-menu__item").length ?? 0;
  const columnWidth = 176;
  const sideOtherColumns = Math.max(1, Math.min(2, otherItemCount));
  const sideBySideWidth = columnWidth * (1 + sideOtherColumns) + 16;
  const sideBySide = Boolean(otherGroup) && availableWidth >= sideBySideWidth;
  const belowColumnBudget = Math.max(1, Math.floor((availableWidth - 32) / columnWidth));
  const otherColumns = sideBySide
    ? sideOtherColumns
    : Math.max(1, Math.min(3, otherItemCount, belowColumnBudget));

  rootItem.setAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE, direction);
  rootItem.style.setProperty("--damophus-plugin-menu-sections", sideBySide ? "2" : "1");
  rootItem.style.setProperty("--damophus-plugin-menu-other-columns", String(otherColumns));
  panel.dataset.layout = sideBySide ? "side" : "below";
  const measuredWidth = Math.min(submenu.getBoundingClientRect().width, viewportWidth - margin * 2);
  const desiredLeft = direction === "right" ? itemRect.right + gap : itemRect.left - gap - measuredWidth;
  const left = Math.max(margin, Math.min(desiredLeft, viewportWidth - measuredWidth - margin));
  submenu.style.left = `${Math.round(left)}px`;
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
  private allowedEntries = parseExpandedPluginMenuAllowedEntries("");
  private readonly enhancedMenus = new Map<HTMLElement, EnhancedMenu>();

  constructor(private readonly targetDocument: Document = document) {}

  start(allowedEntries: unknown = DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES): void {
    this.running = true;
    this.allowedEntries = parseExpandedPluginMenuAllowedEntries(allowedEntries);
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

  updateAllowedEntries(value: unknown): void {
    const nextEntries = parseExpandedPluginMenuAllowedEntries(value);
    if (allowedEntriesSignature(nextEntries) === allowedEntriesSignature(this.allowedEntries)) return;
    for (const enhanced of this.enhancedMenus.values()) this.restoreMenu(enhanced);
    this.enhancedMenus.clear();
    this.allowedEntries = nextEntries;
    this.enhanceMenus(this.targetDocument);
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
        enhanced.removeInteractionListeners();
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
      if (!rootMenu || !submenu || rootMenu.closest(".protyle-hint") || !hasAllowedEntries(this.allowedEntries)) continue;
      const flattened = flattenCommands(submenu, this.allowedEntries);
      if (flattened.movedCommands.length === 0) {
        flattened.panel.remove();
        continue;
      }
      const enhanced: EnhancedMenu = {
        rootItem,
        rootMenu,
        submenu,
        ...flattened,
        removeInteractionListeners: () => {},
      };
      rootMenu.setAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE, "");
      this.enhancedMenus.set(rootItem, enhanced);
      positionPanel(enhanced);
      enhanced.removeInteractionListeners = installInteractionHandling(enhanced);
      setPanelVisible(enhanced, rootItem.matches(":hover") || rootItem.classList.contains("b3-menu__item--show"));
    }
  }

  private restoreMenu(enhanced: EnhancedMenu): void {
    enhanced.removeInteractionListeners();
    restoreCommands(enhanced);
    enhanced.rootItem.removeAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE);
    enhanced.rootItem.removeAttribute(EXPANDED_PLUGIN_MENU_VISIBLE_ATTRIBUTE);
    enhanced.rootItem.style.removeProperty("--damophus-plugin-menu-sections");
    enhanced.rootItem.style.removeProperty("--damophus-plugin-menu-other-columns");
    enhanced.submenu.style.removeProperty("left");
    enhanced.submenu.style.removeProperty("right");
    enhanced.submenu.style.removeProperty("top");
    enhanced.submenu.style.removeProperty("bottom");
    if (!enhanced.rootMenu.querySelector(`[${EXPANDED_PLUGIN_MENU_ATTRIBUTE}]`)) {
      enhanced.rootMenu.removeAttribute(EXPANDED_PLUGIN_MENU_ROOT_ATTRIBUTE);
    }
  }
}

import {
  MENU_DECLARATION_ATTRIBUTE,
  MENU_MODULE_ATTRIBUTE,
  MENU_PLUGIN_ATTRIBUTE,
} from "@/libs/menu-identity";
import {
  discoverPluginMenuEntry,
  mergeDiscoveredPluginMenuEntries,
  parseDiscoveredPluginMenuEntries,
  type DiscoveredPluginMenuEntry,
} from "./discovered-entries";
import {
  mergeDiscoveredPluginMenuAnchors,
  parseDiscoveredPluginMenuAnchors,
  parsePluginMenuPlacement,
  type DiscoveredPluginMenuAnchor,
  type PluginMenuPlacement,
} from "./settings-model";
import { orderPluginMenuKeys, parsePluginMenuOrder } from "./settings-model";

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

interface PlacedMenuItem {
  item: HTMLElement;
  parent: HTMLElement;
  itemPlaceholder: Comment;
  nextSeparator?: HTMLElement;
  nextSeparatorPlaceholder?: Comment;
}

export interface ExpandedPluginMenuLayoutMeasurement {
  layout: "side" | "below";
  otherColumns: number;
  width: number;
  height: number;
  occupiedArea?: number;
}

export function chooseCompactPanelLayout(
  measurements: readonly ExpandedPluginMenuLayoutMeasurement[],
  maximumWidth: number,
  maximumHeight: number,
): ExpandedPluginMenuLayoutMeasurement | undefined {
  return [...measurements].sort((left, right) => {
    const leftFits = left.width <= maximumWidth && left.height <= maximumHeight;
    const rightFits = right.width <= maximumWidth && right.height <= maximumHeight;
    if (leftFits !== rightFits) return leftFits ? -1 : 1;
    if (leftFits && left.layout !== right.layout) {
      // A complete side layout uses the horizontal space beside the native
      // menu and avoids adding another row to the menu's vertical footprint.
      return left.layout === "side" ? -1 : 1;
    }
    if (!leftFits) {
      const leftOverflow = Math.max(0, left.width - maximumWidth) * Math.max(1, left.height)
        + Math.max(0, left.height - maximumHeight) * Math.max(1, left.width);
      const rightOverflow = Math.max(0, right.width - maximumWidth) * Math.max(1, right.height)
        + Math.max(0, right.height - maximumHeight) * Math.max(1, right.width);
      if (leftOverflow !== rightOverflow) return leftOverflow - rightOverflow;
    }
    const areaDifference = (left.occupiedArea ?? left.width * left.height)
      - (right.occupiedArea ?? right.width * right.height);
    if (areaDifference !== 0) return areaDifference;
    if (left.width !== right.width) return left.width - right.width;
    if (left.layout !== right.layout) return left.layout === "below" ? -1 : 1;
    return left.otherColumns - right.otherColumns;
  })[0];
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
    if (!identity) return false;
    const configured = allowedEntries.identities.get(kind);
    if (configured?.has(identity)) return true;
    return kind === "plugin" && Boolean(configured?.has(`${identity}|${normalizedLabel(item).toLocaleLowerCase()}`));
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
  if (item.dataset.id === "plugin") return true;
  const label = normalizedLabel(item).toLocaleLowerCase();
  return label === "插件" || label === "plugins" || label === "plugin";
}

function directMenuItems(parent: HTMLElement): HTMLElement[] {
  return Array.from(parent.children).filter(
    (child): child is HTMLElement => child instanceof HTMLElement && child.matches(ITEM_SELECTOR),
  );
}

function isMenuSeparator(node: ChildNode | null): node is HTMLElement {
  return node instanceof HTMLElement && node.classList.contains("b3-menu__separator");
}

function placementSignature(placement: PluginMenuPlacement): string {
  return JSON.stringify(placement);
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
  menuOrder: readonly string[],
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

  const directItems = Array.from(submenuItems(submenu).children)
    .filter((child): child is HTMLElement => child instanceof HTMLElement && child.matches(ITEM_SELECTOR));
  const orderedItems = orderPluginMenuKeys(
    directItems.map((child) => discoverPluginMenuEntry(child, normalizedLabel(child)).key),
    menuOrder,
  );
  const itemByKey = new Map(directItems.map((child) => [discoverPluginMenuEntry(child, normalizedLabel(child)).key, child]));
  for (const key of orderedItems) {
    const child = itemByKey.get(key);
    if (!child) continue;
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

function applyPanelLayout(
  rootItem: HTMLElement,
  panel: HTMLElement,
  layout: "side" | "below",
  otherColumns: number,
): void {
  rootItem.style.setProperty("--damophus-plugin-menu-sections", layout === "side" ? "2" : "1");
  rootItem.style.setProperty("--damophus-plugin-menu-other-columns", String(otherColumns));
  panel.dataset.layout = layout;
}

function measurePanelLayouts(
  enhanced: EnhancedMenu,
  otherItemCount: number,
  maximumColumns: number,
): ExpandedPluginMenuLayoutMeasurement[] {
  const { rootItem, submenu, panel } = enhanced;
  const measurements: ExpandedPluginMenuLayoutMeasurement[] = [];
  const layouts: Array<"side" | "below"> = otherItemCount > 0 ? ["below", "side"] : ["below"];
  const previousVisibility = submenu.style.visibility;
  const previousWidth = submenu.style.width;
  submenu.style.visibility = "hidden";
  submenu.style.width = "auto";
  for (const layout of layouts) {
    const columnLimit = layout === "side" ? Math.min(2, maximumColumns) : maximumColumns;
    for (let columns = 1; columns <= columnLimit; columns += 1) {
      applyPanelLayout(rootItem, panel, layout, columns);
      const rect = panel.getBoundingClientRect();
      measurements.push({
        layout,
        otherColumns: columns,
        width: Math.ceil(Math.max(rect.width, panel.scrollWidth) + 16),
        height: Math.ceil(Math.max(rect.height, panel.scrollHeight) + 16),
      });
    }
  }
  submenu.style.visibility = previousVisibility;
  submenu.style.width = previousWidth;
  return measurements;
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
  // Keep the real side budget. A synthetic minimum here makes a narrow
  // viewport appear wide enough for a side panel and causes horizontal
  // overflow instead of selecting the below layout.
  // The fixed panel is clamped back into the viewport after measurement, so
  // it may use the full viewport width even when the space immediately beside
  // the Plugins item is narrower. This lets a compact right-hand column fill
  // otherwise empty panel space instead of forcing another row.
  const availableWidth = Math.max(0, viewportWidth - margin * 2);
  const otherGroup = directChild<HTMLElement>(panel, `.${EXPANDED_PLUGIN_MENU_OTHER_CLASS}`);
  const otherItemCount = otherGroup?.querySelectorAll(":scope > .b3-menu__item").length ?? 0;
  const columnWidth = 176;
  const maximumColumns = Math.max(1, Math.min(3, otherItemCount, Math.floor((availableWidth - 16) / columnWidth)));
  const maximumHeight = viewportHeight - margin * 2;

  rootItem.setAttribute(EXPANDED_PLUGIN_MENU_ATTRIBUTE, direction);
  const layoutMeasurements = measurePanelLayouts(enhanced, otherItemCount, maximumColumns);
  for (const measurement of layoutMeasurements) {
    // The submenu is positioned as one fixed panel in either mode. Its measured
    // box already includes the primary and other-plugin columns, so adding the
    // original host menu here would reject valid side-by-side layouts.
    measurement.occupiedArea = Math.ceil(measurement.width * measurement.height);
  }
  const selectedLayout = chooseCompactPanelLayout(
    layoutMeasurements,
    availableWidth,
    maximumHeight,
  ) ?? { layout: "below" as const, otherColumns: 1 };
  applyPanelLayout(rootItem, panel, selectedLayout.layout, selectedLayout.otherColumns);
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
  private discoveredEntries: DiscoveredPluginMenuEntry[] = [];
  private menuOrder: string[] = [];
  private discoveredAnchors: DiscoveredPluginMenuAnchor[] = [];
  private placement: PluginMenuPlacement = { mode: "native" };
  private readonly enhancedMenus = new Map<HTMLElement, EnhancedMenu>();
  private readonly placedMenus = new Map<HTMLElement, PlacedMenuItem>();

  constructor(
    private readonly targetDocument: Document = document,
    private readonly onEntriesDiscovered?: (entries: readonly DiscoveredPluginMenuEntry[]) => void,
    private readonly onAnchorsDiscovered?: (anchors: readonly DiscoveredPluginMenuAnchor[]) => void,
  ) {}

  start(
    allowedEntries: unknown = DEFAULT_EXPANDED_PLUGIN_MENU_ALLOWED_ENTRIES,
    discoveredEntries: unknown = [],
    placement: unknown = { mode: "native" },
    discoveredAnchors: unknown = [],
    menuOrder: unknown = [],
  ): void {
    this.running = true;
    this.allowedEntries = parseExpandedPluginMenuAllowedEntries(allowedEntries);
    this.discoveredEntries = parseDiscoveredPluginMenuEntries(discoveredEntries);
    this.placement = parsePluginMenuPlacement(placement);
    this.discoveredAnchors = parseDiscoveredPluginMenuAnchors(discoveredAnchors);
    this.menuOrder = parsePluginMenuOrder(menuOrder);
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

  updateDiscoveredEntries(value: unknown): void {
    this.discoveredEntries = parseDiscoveredPluginMenuEntries(value);
  }

  updateDiscoveredAnchors(value: unknown): void {
    this.discoveredAnchors = parseDiscoveredPluginMenuAnchors(value);
  }

  updatePlacement(value: unknown): void {
    const placement = parsePluginMenuPlacement(value);
    if (placementSignature(placement) === placementSignature(this.placement)) return;
    for (const placed of [...this.placedMenus.values()]) this.restorePlacement(placed);
    this.placedMenus.clear();
    this.placement = placement;
    this.enhanceMenus(this.targetDocument);
  }

  updateMenuOrder(value: unknown): void {
    const next = parsePluginMenuOrder(value);
    if (JSON.stringify(next) === JSON.stringify(this.menuOrder)) return;
    for (const enhanced of this.enhancedMenus.values()) this.restoreMenu(enhanced);
    this.enhancedMenus.clear();
    this.menuOrder = next;
    this.enhanceMenus(this.targetDocument);
  }

  refresh(): void {
    this.pruneDisconnectedMenus();
    this.enhanceMenus(this.targetDocument);
    for (const enhanced of this.enhancedMenus.values()) positionPanel(enhanced);
  }

  destroy(): void {
    this.running = false;
    this.observer?.takeRecords();
    this.observer?.disconnect();
    this.observer = undefined;
    for (const enhanced of this.enhancedMenus.values()) this.restoreMenu(enhanced);
    this.enhancedMenus.clear();
    for (const placed of [...this.placedMenus.values()]) this.restorePlacement(placed);
    this.placedMenus.clear();
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
    for (const [item] of this.placedMenus) {
      if (!item.isConnected) this.placedMenus.delete(item);
    }
  }

  private enhanceMenus(root: ParentNode): void {
    if (!this.running) return;
    const candidates: HTMLElement[] = [];
    if (root instanceof HTMLElement && root.matches(ITEM_SELECTOR)) candidates.push(root);
    root.querySelectorAll<HTMLElement>(ITEM_SELECTOR).forEach((item) => candidates.push(item));
    for (const rootItem of candidates) {
      if (!isPluginBranch(rootItem)) continue;
      const rootMenu = rootItem.closest<HTMLElement>(MENU_SELECTOR);
      const submenu = directSubmenu(rootItem);
      if (!rootMenu || !submenu || rootMenu.closest(".protyle-hint")) continue;
      this.discoverAnchors(rootItem);
      this.applyPlacement(rootItem);
      if (this.enhancedMenus.has(rootItem)) continue;
      this.discoverEntries(submenu);
      if (!hasAllowedEntries(this.allowedEntries)) continue;
      const flattened = flattenCommands(submenu, this.allowedEntries, this.menuOrder);
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

  private discoverAnchors(rootItem: HTMLElement): void {
    const parent = rootItem.parentElement;
    if (!parent) return;
    const now = Date.now();
    const observed = directMenuItems(parent).flatMap((item) => {
      const id = item.dataset.id?.trim();
      const label = normalizedLabel(item);
      return id && id !== "plugin" && label ? [{ id, label, lastSeen: now }] : [];
    });
    const merged = mergeDiscoveredPluginMenuAnchors(this.discoveredAnchors, observed);
    if (!merged.changed) return;
    this.discoveredAnchors = merged.anchors;
    this.onAnchorsDiscovered?.(this.discoveredAnchors);
  }

  private applyPlacement(rootItem: HTMLElement): void {
    if (this.placement.mode === "native" || this.placedMenus.has(rootItem)) return;
    const parent = rootItem.parentElement;
    if (!parent) return;
    let reference: HTMLElement | null = null;
    let insertAfter = false;
    if (this.placement.mode === "top") {
      reference = directMenuItems(parent).find((item) => item !== rootItem) ?? null;
    } else if (this.placement.mode === "before" || this.placement.mode === "after") {
      const anchorId = this.placement.anchorId;
      reference = directMenuItems(parent).find(
        (item) => item !== rootItem && item.dataset.id === anchorId,
      ) ?? null;
      insertAfter = this.placement.mode === "after";
    }
    if (!reference) return;
    const referenceBoundary = insertAfter && isMenuSeparator(reference.nextSibling)
      ? reference.nextSibling.nextSibling
      : reference.nextSibling;
    const target = insertAfter ? referenceBoundary : reference;
    if (target === rootItem || (!target && rootItem === parent.lastChild)) return;
    const nextSeparator = isMenuSeparator(rootItem.nextSibling) ? rootItem.nextSibling : undefined;
    const itemPlaceholder = parent.ownerDocument.createComment("damophus-plugin-menu-placement");
    const nextSeparatorPlaceholder = nextSeparator
      ? parent.ownerDocument.createComment("damophus-plugin-menu-placement-separator")
      : undefined;
    rootItem.replaceWith(itemPlaceholder);
    if (nextSeparatorPlaceholder) nextSeparator!.replaceWith(nextSeparatorPlaceholder);
    const placed: PlacedMenuItem = {
      item: rootItem,
      parent,
      itemPlaceholder,
      nextSeparator,
      nextSeparatorPlaceholder,
    };
    const resolvedTarget = target === nextSeparator
        ? nextSeparatorPlaceholder ?? itemPlaceholder
        : target;
    parent.insertBefore(rootItem, resolvedTarget);
    if (nextSeparator) rootItem.after(nextSeparator);
    this.placedMenus.set(rootItem, placed);
  }

  private restorePlacement(placed: PlacedMenuItem): void {
    const {
      item,
      parent,
      itemPlaceholder,
      nextSeparator,
      nextSeparatorPlaceholder,
    } = placed;
    if (!item.isConnected || !parent.isConnected) return;
    if (itemPlaceholder.parentNode === parent) itemPlaceholder.replaceWith(item);
    else parent.append(item);
    if (nextSeparator && nextSeparatorPlaceholder?.parentNode === parent) {
      nextSeparatorPlaceholder.replaceWith(nextSeparator);
    }
  }

  private discoverEntries(submenu: HTMLElement): void {
    const observed: DiscoveredPluginMenuEntry[] = [];
    for (const child of submenuItems(submenu).children) {
      if (!(child instanceof HTMLElement) || !child.matches(ITEM_SELECTOR)) continue;
      const label = normalizedLabel(child);
      if (label) observed.push(discoverPluginMenuEntry(child, label));
    }
    const merged = mergeDiscoveredPluginMenuEntries(this.discoveredEntries, observed);
    if (!merged.changed) return;
    this.discoveredEntries = merged.entries;
    this.onEntriesDiscovered?.(this.discoveredEntries);
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

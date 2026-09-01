import type { DockPlatform } from "./visibility";

export type DockPosition = "Left" | "Right" | "Bottom";

export interface DockItemInfo {
  /** Dock tab type; matches `.dock__item[data-type=...]` in the runtime UI. */
  type: string;
  label: string;
  position: DockPosition;
}

interface UiLayoutDockTab {
  type?: string;
  title?: string;
}

interface DockItemsSource {
  languages?: Record<string, string>;
  config?: {
    uiLayout?: {
      left?: { data?: UiLayoutDockTab[][] } | null;
      right?: { data?: UiLayoutDockTab[][] } | null;
      bottom?: { data?: UiLayoutDockTab[][] } | null;
    };
  };
}

function dockLabel(tab: UiLayoutDockTab, languages: Record<string, string> | undefined): string {
  return tab.title?.trim() || languages?.[tab.type ?? ""]?.trim() || tab.type || "";
}

function collectPosition(
  items: DockItemInfo[],
  seen: Set<string>,
  position: DockPosition,
  groups: UiLayoutDockTab[][] | undefined,
  languages: Record<string, string> | undefined,
): void {
  for (const group of groups ?? []) {
    for (const tab of group) {
      const type = typeof tab?.type === "string" ? tab.type.trim() : "";
      if (!type || seen.has(type)) continue;
      seen.add(type);
      items.push({ type, label: dockLabel(tab, languages) || type, position });
    }
  }
}

/**
 * Lists every dock button known to the workspace layout config. Plugin docks
 * carry a localized `title`; native docks fall back to the language dictionary
 * keyed by their type (e.g. the outline dock).
 */
export function collectDockItems(source: DockItemsSource | undefined): DockItemInfo[] {
  const items: DockItemInfo[] = [];
  const seen = new Set<string>();
  const uiLayout = source?.config?.uiLayout;
  const languages = source?.languages;
  collectPosition(items, seen, "Left", uiLayout?.left?.data, languages);
  collectPosition(items, seen, "Right", uiLayout?.right?.data, languages);
  collectPosition(items, seen, "Bottom", uiLayout?.bottom?.data, languages);
  return items;
}

export function dockPlatformOf(
  map: Record<string, DockPlatform>,
  type: string,
): DockPlatform {
  return map[type] ?? "both";
}

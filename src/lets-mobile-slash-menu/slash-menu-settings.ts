export type SlashMenuSurface = "mobile" | "desktop";
export type SlashMenuDisplayMode = "icon" | "full";

export interface SlashMenuItem {
  id: string;
  label: string;
  hasIcon: boolean;
  iconId?: string;
  iconText?: string;
  separator?: boolean;
}

export interface SlashMenuItemConfig {
  id: string;
  visible: boolean;
  display: SlashMenuDisplayMode;
}

export const DEFAULT_SLASH_MENU_ITEMS = "[]";

const safeIconId = (value: unknown): string | undefined =>
  typeof value === "string" && /^[A-Za-z][\w:.-]{0,127}$/u.test(value) ? value : undefined;

const safeIconText = (value: unknown): string | undefined => {
  if (typeof value !== "string") return;
  const normalized = value.replace(/\s+/gu, " ").trim();
  return normalized && [...normalized].length <= 8 ? normalized : undefined;
};

export function serializeSlashMenuItems(items: SlashMenuItem[]): string {
  return JSON.stringify(items.map(({ id, label, hasIcon, iconId, iconText, separator }) => ({
    id,
    label,
    hasIcon,
    iconId: safeIconId(iconId),
    iconText: safeIconText(iconText),
    separator,
  })));
}

export function parseSlashMenuItems(value: unknown): SlashMenuItem[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string" || typeof record.label !== "string") return [];
      return [{
        id: record.id,
        label: record.label,
        hasIcon: record.hasIcon === true,
        iconId: safeIconId(record.iconId),
        iconText: safeIconText(record.iconText),
        separator: record.separator === true,
      }];
    });
  } catch {
    return [];
  }
}

export function parseSlashMenuConfig(value: unknown): SlashMenuItemConfig[] {
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      if (!item || typeof item !== "object") return [];
      const record = item as Record<string, unknown>;
      if (typeof record.id !== "string") return [];
      return [{
        id: record.id,
        visible: record.visible !== false,
        display: record.display === "full" ? "full" : "icon",
      } as SlashMenuItemConfig];
    });
  } catch {
    return [];
  }
}

export function mergeSlashMenuItems(
  discovered: SlashMenuItem[],
  configured: SlashMenuItemConfig[],
): SlashMenuItemConfig[] {
  const discoveredById = new Map(discovered.map((item) => [item.id, item]));
  const configuredIds = new Set<string>();
  const configuredFirst = configured.flatMap((entry) => {
    const item = discoveredById.get(entry.id);
    if (!item || configuredIds.has(entry.id)) return [];
    configuredIds.add(entry.id);
    return [entry];
  });
  const newlyDiscovered = discovered.filter((item) => !configuredIds.has(item.id)).map((item) => ({
    id: item.id,
    visible: true,
    display: item.hasIcon && !item.separator ? "icon" : "full",
  } as SlashMenuItemConfig));
  return [...configuredFirst, ...newlyDiscovered];
}

export function serializeSlashMenuConfig(config: SlashMenuItemConfig[]): string {
  return JSON.stringify(config.map(({ id, visible, display }) => ({ id, visible, display })));
}

export function reorderSlashMenuConfig(config: SlashMenuItemConfig[], index: number, offset: -1 | 1): SlashMenuItemConfig[] {
  const target = index + offset;
  if (index < 0 || target < 0 || target >= config.length) return config;
  const next = [...config];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

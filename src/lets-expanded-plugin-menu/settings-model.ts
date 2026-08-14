import type { DiscoveredPluginMenuEntry } from "./discovered-entries";
import { selectorForDiscoveredEntry } from "./discovered-entries";

export type PluginMenuPlacement =
  | { mode: "native" }
  | { mode: "top" }
  | { mode: "before" | "after"; anchorId: string };

export interface DiscoveredPluginMenuAnchor {
  id: string;
  label: string;
  lastSeen: number;
}

export const DEFAULT_PLUGIN_MENU_PLACEMENT = JSON.stringify({ mode: "native" });

export function parsePluginMenuOrder(value: unknown): string[] {
  let parsed = value;
  if (typeof value === "string") {
    try { parsed = JSON.parse(value); } catch { return []; }
  }
  return Array.isArray(parsed) && parsed.every((entry) => typeof entry === "string") ? parsed : [];
}

export function serializePluginMenuOrder(order: readonly string[]): string {
  return JSON.stringify(order);
}

export function orderPluginMenuKeys(keys: string[], preference: readonly string[]): string[] {
  if (preference.length === 0) return keys;
  const positions = new Map(preference.map((key, index) => [key.toLocaleLowerCase(), index]));
  return [...keys].sort((left, right) => {
    const a = positions.get(left.toLocaleLowerCase());
    const b = positions.get(right.toLocaleLowerCase());
    if (a === undefined && b === undefined) return 0;
    if (a === undefined) return 1;
    if (b === undefined) return -1;
    return a - b;
  });
}

export function movePluginMenuKey(keys: string[], key: string, direction: "up" | "down"): string[] {
  const index = keys.indexOf(key);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= keys.length) return keys;
  const next = [...keys];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function nonEmptyText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function parsePluginMenuPlacement(value: unknown): PluginMenuPlacement {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { mode: "native" };
    }
  }
  if (!parsed || typeof parsed !== "object") return { mode: "native" };
  const record = parsed as Record<string, unknown>;
  if (record.mode === "top") return { mode: "top" };
  if (record.mode !== "before" && record.mode !== "after") return { mode: "native" };
  const anchorId = nonEmptyText(record.anchorId);
  if (!anchorId || anchorId.toLocaleLowerCase() === "plugin") return { mode: "native" };
  return { mode: record.mode, anchorId };
}

export function serializePluginMenuPlacement(placement: PluginMenuPlacement): string {
  return JSON.stringify(placement);
}

export function parseDiscoveredPluginMenuAnchors(value: unknown): DiscoveredPluginMenuAnchor[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const anchors = new Map<string, DiscoveredPluginMenuAnchor>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const id = nonEmptyText(record.id);
    const label = nonEmptyText(record.label);
    if (!id || !label || id.toLocaleLowerCase() === "plugin") continue;
    anchors.set(id.toLocaleLowerCase(), {
      id,
      label,
      lastSeen: typeof record.lastSeen === "number" && Number.isFinite(record.lastSeen)
        ? record.lastSeen
        : 0,
    });
  }
  return [...anchors.values()];
}

export function mergeDiscoveredPluginMenuAnchors(
  current: readonly DiscoveredPluginMenuAnchor[],
  observed: readonly DiscoveredPluginMenuAnchor[],
): { anchors: DiscoveredPluginMenuAnchor[]; changed: boolean } {
  const merged = new Map(current.map((anchor) => [anchor.id.toLocaleLowerCase(), anchor]));
  let changed = false;
  for (const anchor of observed) {
    const key = anchor.id.toLocaleLowerCase();
    const previous = merged.get(key);
    if (previous?.label === anchor.label) continue;
    merged.set(key, anchor);
    changed = true;
  }
  return { anchors: [...merged.values()], changed };
}

export function serializeDiscoveredPluginMenuAnchors(
  anchors: readonly DiscoveredPluginMenuAnchor[],
): string {
  return JSON.stringify(anchors);
}

function lines(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function selectors(entry: DiscoveredPluginMenuEntry): Set<string> {
  return new Set([
    selectorForDiscoveredEntry(entry),
    entry.label,
    entry.pluginId ? `plugin:${entry.pluginId}` : "",
    entry.moduleId ? `module:${entry.moduleId}` : "",
    entry.declaration ? `declaration:${entry.declaration}` : "",
  ].filter(Boolean).map(normalized));
}

export function selectedDiscoveredEntryKeys(
  value: unknown,
  entries: readonly DiscoveredPluginMenuEntry[],
): Set<string> {
  const configured = new Set(lines(value).map(normalized));
  return new Set(entries
    .filter((entry) => [...selectors(entry)].some((selector) => configured.has(selector)))
    .map((entry) => entry.key));
}

export function extractAdvancedExpandedMenuRules(
  value: unknown,
  entries: readonly DiscoveredPluginMenuEntry[],
): string {
  const known = new Set(entries.flatMap((entry) => [...selectors(entry)]));
  return lines(value).filter((line) => !known.has(normalized(line))).join("\n");
}

export function serializeExpandedMenuSettings(
  entries: readonly DiscoveredPluginMenuEntry[],
  selectedKeys: ReadonlySet<string>,
  advancedRules: string,
): string {
  return [
    ...entries.filter((entry) => selectedKeys.has(entry.key)).map(selectorForDiscoveredEntry),
    ...lines(advancedRules),
  ].join("\n");
}

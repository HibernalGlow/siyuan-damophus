import {
  MENU_DECLARATION_ATTRIBUTE,
  MENU_MODULE_ATTRIBUTE,
  MENU_PLUGIN_ATTRIBUTE,
} from "@/libs/menu-identity";

export interface DiscoveredPluginMenuEntry {
  key: string;
  label: string;
  pluginId?: string;
  moduleId?: string;
  declaration?: string;
  source: "identity" | "label";
  lastSeen: number;
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function entryKey(entry: Pick<DiscoveredPluginMenuEntry, "label" | "pluginId" | "moduleId" | "declaration">): string {
  if (entry.moduleId) return `module:${entry.moduleId}`;
  if (entry.declaration) return `declaration:${entry.declaration}`;
  if (entry.pluginId) return `plugin:${entry.pluginId}|${entry.label}`;
  return `label:${entry.label}`;
}

export function discoverPluginMenuEntry(item: HTMLElement, label: string, now = Date.now()): DiscoveredPluginMenuEntry {
  const entry = {
    label: label.trim(),
    pluginId: text(item.getAttribute(MENU_PLUGIN_ATTRIBUTE)),
    moduleId: text(item.getAttribute(MENU_MODULE_ATTRIBUTE)),
    declaration: text(item.getAttribute(MENU_DECLARATION_ATTRIBUTE)),
  };
  return {
    ...entry,
    key: entryKey(entry),
    source: entry.pluginId || entry.moduleId || entry.declaration ? "identity" : "label",
    lastSeen: now,
  };
}

export function parseDiscoveredPluginMenuEntries(value: unknown): DiscoveredPluginMenuEntry[] {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(parsed)) return [];
  const entries = new Map<string, DiscoveredPluginMenuEntry>();
  for (const candidate of parsed) {
    if (!candidate || typeof candidate !== "object") continue;
    const record = candidate as Record<string, unknown>;
    const label = text(record.label);
    if (!label) continue;
    const entry = {
      label,
      pluginId: text(record.pluginId),
      moduleId: text(record.moduleId),
      declaration: text(record.declaration),
    };
    const key = entryKey(entry);
    entries.set(key.toLocaleLowerCase(), {
      ...entry,
      key,
      source: entry.pluginId || entry.moduleId || entry.declaration ? "identity" : "label",
      lastSeen: typeof record.lastSeen === "number" && Number.isFinite(record.lastSeen) ? record.lastSeen : 0,
    });
  }
  return [...entries.values()];
}

export function mergeDiscoveredPluginMenuEntries(
  current: readonly DiscoveredPluginMenuEntry[],
  observed: readonly DiscoveredPluginMenuEntry[],
): { entries: DiscoveredPluginMenuEntry[]; changed: boolean } {
  const merged = new Map(current.map((entry) => [entry.key.toLocaleLowerCase(), entry]));
  let changed = false;
  for (const entry of observed) {
    const normalizedKey = entry.key.toLocaleLowerCase();
    if (entry.source === "identity") {
      const labelKey = `label:${entry.label}`.toLocaleLowerCase();
      if (merged.delete(labelKey)) changed = true;
    }
    const previous = merged.get(normalizedKey);
    if (previous
      && previous.label === entry.label
      && previous.pluginId === entry.pluginId
      && previous.moduleId === entry.moduleId
      && previous.declaration === entry.declaration) continue;
    merged.set(normalizedKey, entry);
    changed = true;
  }
  return { entries: [...merged.values()], changed };
}

export function selectorForDiscoveredEntry(entry: DiscoveredPluginMenuEntry): string {
  return entry.key.startsWith("label:") ? entry.label : entry.key;
}

export function serializeDiscoveredPluginMenuEntries(entries: readonly DiscoveredPluginMenuEntry[]): string {
  return JSON.stringify(entries);
}

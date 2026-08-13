import type { DiscoveredPluginMenuEntry } from "./discovered-entries";
import { selectorForDiscoveredEntry } from "./discovered-entries";

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase();
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

import type { PracticeOptionOrder, PracticeOrder } from "@/question-bank/application/practice";
import { normalizePracticeFilter, type PracticeFilter } from "@/question-bank/core/scope";

export interface PracticeFilterPreset {
  id: string;
  name: string;
  filter: PracticeFilter;
}

export interface PracticePreferences {
  order: PracticeOrder;
  optionOrder: PracticeOptionOrder;
  filter: PracticeFilter;
  presets?: PracticeFilterPreset[];
  activePresetId?: string;
}

export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  order: "sequential",
  optionOrder: "random",
  filter: "all",
};

function normalizePracticePresets(value: unknown): PracticeFilterPreset[] {
  if (!Array.isArray(value)) return [];
  const used = new Set<string>();
  return value.reduce<PracticeFilterPreset[]>((result, item, index) => {
    if (!item || typeof item !== "object") return result;
    const candidate = item as Partial<PracticeFilterPreset>;
    const name = typeof candidate.name === "string" ? candidate.name.trim() : "";
    if (!name) return result;
    const sourceId = typeof candidate.id === "string" && candidate.id.trim() ? candidate.id.trim() : `preset-${index + 1}`;
    let id = sourceId;
    let suffix = 2;
    while (used.has(id)) id = `${sourceId}-${suffix++}`;
    used.add(id);
    result.push({ id, name, filter: normalizePracticeFilter(candidate.filter, "all") });
    return result;
  }, []);
}

function resolvePresetState(value: unknown, fallbackFilter: PracticeFilter): Pick<PracticePreferences, "filter" | "presets" | "activePresetId"> {
  const candidate = value && typeof value === "object" ? value as Partial<PracticePreferences> : {};
  const hasPresets = Array.isArray(candidate.presets);
  const presets = normalizePracticePresets(candidate.presets);
  const activePresetId = typeof candidate.activePresetId === "string" && presets.some((preset) => preset.id === candidate.activePresetId)
    ? candidate.activePresetId
    : undefined;
  const activePreset = activePresetId ? presets.find((preset) => preset.id === activePresetId) : undefined;
  return {
    filter: activePreset ? activePreset.filter : normalizePracticeFilter(candidate.filter, fallbackFilter),
    ...(hasPresets ? { presets } : {}),
    ...(activePresetId ? { activePresetId } : {}),
  };
}

function valueOrFallback<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizePracticeDefaults(value: unknown): PracticePreferences {
  const candidate = value && typeof value === "object" ? value as Partial<PracticePreferences> : {};
  const presetState = resolvePresetState(value, DEFAULT_PRACTICE_PREFERENCES.filter);
  return {
    order: valueOrFallback(candidate.order, ["sequential", "random"], DEFAULT_PRACTICE_PREFERENCES.order),
    optionOrder: valueOrFallback(candidate.optionOrder, ["source", "random"], DEFAULT_PRACTICE_PREFERENCES.optionOrder),
    ...presetState,
  };
}

export function resolvePracticePreferences(
  remembered: unknown,
  defaults: PracticePreferences,
): PracticePreferences {
  const candidate = remembered && typeof remembered === "object" ? remembered as Partial<PracticePreferences> : {};
  const presetState = resolvePresetState(remembered, defaults.filter);
  return {
    order: valueOrFallback(candidate.order, ["sequential", "random"], defaults.order),
    optionOrder: valueOrFallback(candidate.optionOrder, ["source", "random"], defaults.optionOrder),
    ...presetState,
  };
}

import type { PracticeOptionOrder, PracticeOrder } from "@/question-bank/application/practice";
import {
  normalizePracticeFilter,
  type PracticeFilter,
  type PracticeFilterField,
  type PracticeFilterOperator,
  type PracticeFilterRule,
  type PracticeFilterRuleValue,
  type PracticeFilterValue,
} from "@/question-bank/core/scope";
import type { MasteryRating } from "@/question-bank/core/types";

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
  /** Reference templates: staged starting points, never rendered as launcher chips. */
  referencePresets?: PracticeFilterPreset[];
}

/** A read-only reference template shipped with the plugin; loaded into the editor, then saved as a preset. */
export interface PracticeReferenceTemplate {
  id: string;
  nameKey: string;
  nameFallback: string;
  filter: PracticeFilter;
}

const referenceRule = (
  field: PracticeFilterField,
  filter: PracticeFilterOperator,
  value?: PracticeFilterRuleValue,
  includes?: Array<PracticeFilterValue | MasteryRating>,
): PracticeFilterRule => ({
  field,
  type: "tuple",
  filter,
  ...(value !== undefined ? { value } : {}),
  ...(includes ? { includes } : {}),
});

/** Built-in reference templates: canonical wrong-question redo combos for round two and beyond. */
export const PRACTICE_REFERENCE_TEMPLATES: PracticeReferenceTemplate[] = [
  {
    id: "builtin-wrong-redo",
    nameKey: "lets-question-bank.referenceWrongRedo",
    nameFallback: "Wrong questions, next round",
    filter: {
      glue: "and",
      rules: [
        referenceRule("wrong", "equal", "yes"),
        referenceRule("latest_rating", "equal", undefined, ["again", "hard"]),
      ],
    },
  },
  {
    id: "builtin-stubborn-wrong",
    nameKey: "lets-question-bank.referenceStubbornWrong",
    nameFallback: "Stubborn wrong questions",
    filter: {
      glue: "and",
      rules: [referenceRule("wrong_count", "greaterOrEqual", 2)],
    },
  },
  {
    id: "builtin-weekly-redo",
    nameKey: "lets-question-bank.referenceWeeklyRedo",
    nameFallback: "Weekly wrong redo",
    filter: {
      glue: "and",
      rules: [
        referenceRule("wrong", "equal", "yes"),
        referenceRule("last_answered_days", "greaterOrEqual", 7),
      ],
    },
  },
];

export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  order: "sequential",
  optionOrder: "random",
  filter: "all",
};

export const PRACTICE_HEADER_ACTIONS = ["locate", "lock", "bookmark", "correct", "timer"] as const;
export type PracticeHeaderAction = (typeof PRACTICE_HEADER_ACTIONS)[number];
export type PracticeHeaderActions = Record<PracticeHeaderAction, boolean>;

export const DEFAULT_PRACTICE_HEADER_ACTIONS: PracticeHeaderActions = {
  locate: true,
  lock: true,
  bookmark: true,
  correct: true,
  timer: true,
};

export function normalizePracticeHeaderActions(value: unknown): PracticeHeaderActions {
  const candidate = value && typeof value === "object" ? value as Partial<Record<PracticeHeaderAction, unknown>> : {};
  return Object.fromEntries(PRACTICE_HEADER_ACTIONS.map((action) => {
    const stored = candidate[action];
    return [action, typeof stored === "boolean" ? stored : DEFAULT_PRACTICE_HEADER_ACTIONS[action]];
  })) as PracticeHeaderActions;
}

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

function resolvePresetState(value: unknown, fallbackFilter: PracticeFilter): Pick<PracticePreferences, "filter" | "presets" | "activePresetId" | "referencePresets"> {
  const candidate = value && typeof value === "object" ? value as Partial<PracticePreferences> : {};
  const hasPresets = Array.isArray(candidate.presets);
  const presets = normalizePracticePresets(candidate.presets);
  const activePresetId = typeof candidate.activePresetId === "string" && presets.some((preset) => preset.id === candidate.activePresetId)
    ? candidate.activePresetId
    : undefined;
  const activePreset = activePresetId ? presets.find((preset) => preset.id === activePresetId) : undefined;
  const hasReferencePresets = Array.isArray(candidate.referencePresets);
  const referencePresets = normalizePracticePresets(candidate.referencePresets);
  return {
    filter: activePreset ? activePreset.filter : normalizePracticeFilter(candidate.filter, fallbackFilter),
    ...(hasPresets ? { presets } : {}),
    ...(activePresetId ? { activePresetId } : {}),
    ...(hasReferencePresets ? { referencePresets } : {}),
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

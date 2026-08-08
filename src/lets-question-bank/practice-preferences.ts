import type { PracticeOptionOrder, PracticeOrder } from "@/question-bank/application/practice";
import type { PracticeFilter } from "@/question-bank/core/scope";

export interface PracticePreferences {
  order: PracticeOrder;
  optionOrder: PracticeOptionOrder;
  filter: PracticeFilter;
}

export const DEFAULT_PRACTICE_PREFERENCES: PracticePreferences = {
  order: "sequential",
  optionOrder: "random",
  filter: "all",
};

function valueOrFallback<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;
}

export function normalizePracticeDefaults(value: unknown): PracticePreferences {
  const candidate = value && typeof value === "object" ? value as Partial<PracticePreferences> : {};
  return {
    order: valueOrFallback(candidate.order, ["sequential", "random"], DEFAULT_PRACTICE_PREFERENCES.order),
    optionOrder: valueOrFallback(candidate.optionOrder, ["source", "random"], DEFAULT_PRACTICE_PREFERENCES.optionOrder),
    filter: valueOrFallback(candidate.filter, ["all", "unattempted", "wrong", "review", "due"], DEFAULT_PRACTICE_PREFERENCES.filter),
  };
}

export function resolvePracticePreferences(
  remembered: unknown,
  defaults: PracticePreferences,
): PracticePreferences {
  const candidate = remembered && typeof remembered === "object" ? remembered as Partial<PracticePreferences> : {};
  return {
    order: valueOrFallback(candidate.order, ["sequential", "random"], defaults.order),
    optionOrder: valueOrFallback(candidate.optionOrder, ["source", "random"], defaults.optionOrder),
    filter: valueOrFallback(candidate.filter, ["all", "unattempted", "wrong", "review", "due"], defaults.filter),
  };
}

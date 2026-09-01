export type DurationComparisonPosition = "answer" | "rating" | "header";

export function normalizeDurationComparisonPosition(value: unknown): DurationComparisonPosition {
  return value === "answer" || value === "header" || value === "rating" ? value : "rating";
}

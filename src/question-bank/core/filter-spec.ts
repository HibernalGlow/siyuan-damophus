import { z } from "zod";

/**
 * Practice filter conditions are stored as a nested rule tree matching the
 * SVAR Svelte FilterBuilder value shape (IFilterSet): groups carry a glue
 * ("and"/"or") plus rules, leaves target a practice dimension with the
 * tuple operators "contains" (must match) / "notContains" (must not match)
 * and the single fact token "yes". Keeping our own structural types makes
 * the core independent of the UI library while staying assignable to it.
 */

export const PRACTICE_FILTER_FIELDS = [
  "unattempted",
  "wrong",
  "review",
  "due",
  "bookmarked",
  "again-hard",
] as const;

export type PracticeFilterField = (typeof PRACTICE_FILTER_FIELDS)[number];

/** Fact token stored in rule `includes`; facts resolve each field to yes/no. */
export const PRACTICE_FILTER_FACT_YES = "yes";
export const PRACTICE_FILTER_FACT_NO = "no";

export interface PracticeFilterRule {
  field: string;
  type?: string;
  filter?: string;
  value?: string | number;
  includes?: (string | number)[];
  predicate?: string;
}

export interface PracticeFilterSpec {
  glue?: "and" | "or";
  rules?: (PracticeFilterRule | PracticeFilterSpec)[];
}

export const PracticeFilterRuleSchema = z.object({
  field: z.string(),
  type: z.string().optional(),
  filter: z.string().optional(),
  value: z.union([z.string(), z.number()]).optional(),
  includes: z.array(z.union([z.string(), z.number()])).optional(),
  predicate: z.string().optional(),
});

export const PracticeFilterSpecSchema: z.ZodType<PracticeFilterSpec> = z.lazy(() =>
  z.object({
    glue: z.enum(["and", "or"]).optional(),
    rules: z.array(z.union([PracticeFilterRuleSchema, PracticeFilterSpecSchema])).optional(),
  }),
);

export type PracticeFilterFacts = Record<PracticeFilterField, boolean>;

export const EMPTY_PRACTICE_FILTER_SPEC: PracticeFilterSpec = {};

export function isPracticeFilterGroup(
  rule: PracticeFilterRule | PracticeFilterSpec,
): rule is PracticeFilterSpec {
  return "rules" in rule || "glue" in rule || !("field" in rule);
}

export function singleFieldFilterSpec(
  field: PracticeFilterField,
  filter: "contains" | "notContains" = "contains",
): PracticeFilterSpec {
  return {
    glue: "and",
    rules: [{ field, type: "tuple", filter, includes: [PRACTICE_FILTER_FACT_YES] }],
  };
}

function sanitizeFilterRule(rule: z.infer<typeof PracticeFilterRuleSchema>): PracticeFilterRule | undefined {
  if (!(PRACTICE_FILTER_FIELDS as readonly string[]).includes(rule.field)) return undefined;
  if (rule.filter !== "contains" && rule.filter !== "notContains") return undefined;
  if (!rule.includes?.includes(PRACTICE_FILTER_FACT_YES)) return undefined;
  return { field: rule.field, type: "tuple", filter: rule.filter, includes: [PRACTICE_FILTER_FACT_YES] };
}

function sanitizeFilterSpec(value: unknown): PracticeFilterSpec | undefined {
  const parsed = PracticeFilterSpecSchema.safeParse(value);
  if (!parsed.success) return undefined;
  const rules: (PracticeFilterRule | PracticeFilterSpec)[] = [];
  for (const rule of parsed.data.rules ?? []) {
    if (isPracticeFilterGroup(rule)) {
      const group = sanitizeFilterSpec(rule);
      if (group) rules.push(group);
    } else {
      const leaf = sanitizeFilterRule(rule);
      if (leaf) rules.push(leaf);
    }
  }
  if (rules.length === 0) return undefined;
  return { glue: parsed.data.glue === "or" ? "or" : "and", rules };
}

/**
 * Accepts legacy single-filter strings ("all" -> empty, "wrong" -> one rule),
 * rule-tree objects, or anything else (falls back to the empty "match all"
 * spec) and returns a sanitized spec.
 */
export function normalizePracticeFilterSpec(value: unknown): PracticeFilterSpec {
  if (typeof value === "string") {
    if (value !== "all" && (PRACTICE_FILTER_FIELDS as readonly string[]).includes(value)) {
      return singleFieldFilterSpec(value as PracticeFilterField);
    }
    return EMPTY_PRACTICE_FILTER_SPEC;
  }
  return sanitizeFilterSpec(value) ?? EMPTY_PRACTICE_FILTER_SPEC;
}

export function isPracticeFilterSpecEmpty(spec: PracticeFilterSpec): boolean {
  return (spec.rules ?? []).every((rule) =>
    isPracticeFilterGroup(rule) ? isPracticeFilterSpecEmpty(rule) : false);
}

export function evaluatePracticeFilterSpec(
  spec: PracticeFilterSpec,
  facts: PracticeFilterFacts,
): boolean {
  const rules = spec.rules ?? [];
  if (rules.length === 0) return true;
  const results = rules.map((rule) =>
    isPracticeFilterGroup(rule)
      ? evaluatePracticeFilterSpec(rule, facts)
      : evaluatePracticeFilterRule(rule, facts),
  );
  return spec.glue === "or" ? results.some((result) => result) : results.every((result) => result);
}

function evaluatePracticeFilterRule(rule: PracticeFilterRule, facts: PracticeFilterFacts): boolean {
  const matched = facts[rule.field as PracticeFilterField] === true;
  return rule.filter === "notContains" ? !matched : matched;
}

export function specIncludesFilter(
  spec: PracticeFilterSpec,
  field: PracticeFilterField,
  filter: "contains" | "notContains" = "contains",
): boolean {
  return (spec.rules ?? []).some((rule) =>
    isPracticeFilterGroup(rule)
      ? specIncludesFilter(rule, field, filter)
      : rule.field === field && rule.filter === filter);
}

export interface PracticeFilterSpecLabels {
  field: (field: string) => string;
  notPrefix: string;
  and: string;
  or: string;
}

/** Human-readable one-line summary for the summary chip, e.g. "已收藏 且 非错题". */
export function describePracticeFilterSpec(
  spec: PracticeFilterSpec,
  labels: PracticeFilterSpecLabels,
): string {
  const rules = spec.rules ?? [];
  const parts = rules.map((rule) => {
    if (isPracticeFilterGroup(rule)) {
      const nested = describePracticeFilterSpec(rule, labels);
      return nested && (rule.rules?.length ?? 0) > 1 ? `(${nested})` : nested;
    }
    const field = labels.field(rule.field);
    return rule.filter === "notContains" ? `${labels.notPrefix}${field}` : field;
  }).filter(Boolean);
  if (parts.length === 0) return "";
  return parts.join(spec.glue === "or" ? labels.or : labels.and);
}

// Compiles the persisted cover condition tree into booru fetch queries.
//
// The tree is edited by the shared query builder, so leaves are parameter
// assignments and groups carry real boolean structure: AND merges parameter
// sets, OR splits into multiple fetch variants (union of candidate posts at
// resolve time) and `not` negates a subtree via De Morgan. Leaves whose
// negation has no booru-query equivalent (site, imageQuality) are dropped
// with a warning rather than silently flipping their meaning.
import { getLogger } from "@/libs/logger";
import type { CoverConditionGroup, CoverConditionRule, CoverTemplateItem, TagPool } from "./sources";

const log = getLogger("lets-more-background:condition-compile");

/** Guard against cartesian blow-up from nested OR groups. */
export const COVER_CONDITION_MAX_VARIANTS = 12;

/** One compiled fetch query: the booru URI params for a single OR branch. */
export interface CoverQueryVariant {
  site?: string;
  ratio?: string;
  rating?: string;
  tags?: string;
  minScore?: string;
  maxScore?: string;
  timeRange?: string;
  notTimeRange?: string;
  notRatio?: string;
  notRating?: string;
  quality?: string;
  poolId?: string;
  blacklist: string[];
}

type CoverEntry = CoverConditionRule | CoverConditionGroup;

const emptyVariant = (): CoverQueryVariant => ({ blacklist: [] });

const isIdentityVariant = (variant: CoverQueryVariant): boolean =>
  variant.blacklist.length === 0 &&
  variant.site === undefined && variant.ratio === undefined && variant.rating === undefined &&
  variant.tags === undefined && variant.minScore === undefined && variant.maxScore === undefined &&
  variant.timeRange === undefined && variant.notTimeRange === undefined &&
  variant.notRatio === undefined && variant.notRating === undefined &&
  variant.quality === undefined && variant.poolId === undefined;

const isGroupEntry = (entry: CoverEntry): entry is CoverConditionGroup => "rules" in entry;

/** Tag-list normalization shared with the template editor's pool resolution. */
export function poolItemsToTags(items: Array<string | TagEntryLike>): string[] {
  return items
    .map((item) => (typeof item === "string" ? item.split(/[#,:]/)[0].trim().replace(/\s+/g, "_") : item.tag || ""))
    .filter(Boolean);
}

interface TagEntryLike {
  tag?: string;
}

function mergeVariants(base: CoverQueryVariant, next: CoverQueryVariant): CoverQueryVariant {
  return {
    site: next.site ?? base.site,
    ratio: next.ratio ?? base.ratio,
    rating: next.rating ?? base.rating,
    tags: next.tags ?? base.tags,
    minScore: next.minScore ?? base.minScore,
    maxScore: next.maxScore ?? base.maxScore,
    timeRange: next.timeRange ?? base.timeRange,
    notTimeRange: next.notTimeRange ?? base.notTimeRange,
    notRatio: next.notRatio ?? base.notRatio,
    notRating: next.notRating ?? base.notRating,
    quality: next.quality ?? base.quality,
    poolId: next.poolId ?? base.poolId,
    blacklist: [...base.blacklist, ...next.blacklist],
  };
}

/** AND of child variant lists: cartesian merge, truncated past the cap. */
function crossMerge(lists: CoverQueryVariant[][]): CoverQueryVariant[] {
  let acc: CoverQueryVariant[] = [emptyVariant()];
  for (const list of lists) {
    const next: CoverQueryVariant[] = [];
    for (const base of acc) {
      for (const item of list) next.push(mergeVariants(base, item));
    }
    if (next.length > COVER_CONDITION_MAX_VARIANTS) {
      log.warn(`Condition tree exceeds ${COVER_CONDITION_MAX_VARIANTS} fetch variants; truncating`);
      return next.slice(0, COVER_CONDITION_MAX_VARIANTS);
    }
    acc = next;
  }
  return acc;
}

/** Resolves a tag-pool id to its normalized tag list; unknown pools yield nothing. */
function resolvePoolTags(poolId: string, tagPools: TagPool[]): string[] {
  const pool = tagPools.find((candidate) => candidate.id === poolId);
  return pool && pool.items?.length > 0 ? poolItemsToTags(pool.items) : [];
}

function applyRule(variant: CoverQueryVariant, rule: CoverConditionRule, tagPools: TagPool[]): void {
  if (rule.field === "site" && rule.value) {
    variant.site = rule.value;
  } else if (rule.field === "aspectRatio" && rule.value && rule.value !== "any") {
    variant.ratio = rule.value;
  } else if (rule.field === "rating" && rule.value && rule.value !== "all") {
    variant.rating = rule.value;
  } else if (rule.field === "tags" && rule.value) {
    variant.tags = rule.value;
  } else if (rule.field === "minScore" && Number(rule.value) > 0) {
    variant.minScore = String(rule.value);
  } else if (rule.field === "timeRange" && rule.value && rule.value !== "any" && rule.value !== "all") {
    variant.timeRange = rule.value;
  } else if (rule.field === "imageQuality" && rule.value && rule.value !== "original") {
    variant.quality = rule.value;
  } else if (rule.field === "tagPool" && rule.value) {
    variant.poolId = rule.value;
  } else if (rule.field === "excludeTagPool" && rule.value) {
    // Pools resolve to concrete tags here: the booru query only understands tags.
    const tags = resolvePoolTags(String(rule.value), tagPools);
    if (tags.length > 0) variant.blacklist.push(tags.join(","));
  } else if (rule.field === "blacklist" && rule.value) {
    variant.blacklist.push(String(rule.value));
  }
}

/** Negated leaf: maps to the field's inverse parameter, or is dropped when no inverse exists. */
function compileLeafNegated(rule: CoverConditionRule, tagPools: TagPool[]): CoverQueryVariant[] {
  const variant = emptyVariant();
  switch (rule.field) {
    case "tags":
      // NOT (must contain tag) → exclude the tag.
      if (rule.value) variant.blacklist.push(String(rule.value));
      return [variant];
    case "tagPool": {
      // NOT (random from pool) → exclude every pool entry.
      const tags = resolvePoolTags(String(rule.value), tagPools);
      if (tags.length > 0) variant.blacklist.push(tags.join(","));
      return [variant];
    }
    case "blacklist":
      // NOT (excludes tags) → require the tags.
      if (rule.value) variant.tags = String(rule.value);
      return [variant];
    case "minScore":
      if (Number(rule.value) > 0) variant.maxScore = String(rule.value);
      return [variant];
    case "timeRange":
      if (rule.value && rule.value !== "any" && rule.value !== "all") variant.notTimeRange = String(rule.value);
      return [variant];
    case "aspectRatio":
      if (rule.value && rule.value !== "any") variant.notRatio = String(rule.value);
      return [variant];
    case "rating":
      if (rule.value && rule.value !== "all") variant.notRating = String(rule.value);
      return [variant];
    default:
      // site / imageQuality have no inverse in a single booru query.
      log.warn(`NOT on field "${rule.field}" cannot be expressed as a fetch query; rule ignored`);
      return [];
  }
}

function compileEntry(entry: CoverEntry, negated: boolean, tagPools: TagPool[]): CoverQueryVariant[] {
  if (isGroupEntry(entry)) return compileGroup(entry, negated, tagPools);
  if (entry.disabled) return [];
  if (negated) return compileLeafNegated(entry, tagPools);
  const variant = emptyVariant();
  applyRule(variant, entry, tagPools);
  return [variant];
}

function compileGroup(group: CoverConditionGroup, negated: boolean, tagPools: TagPool[]): CoverQueryVariant[] {
  if (group.disabled) return [];
  // Double negation cancels; NOT flips the group's own combinator (De Morgan).
  const effectiveNot = Boolean(group.not) !== negated;
  const combinator = effectiveNot ? (group.combinator === "and" ? "or" : "and") : group.combinator;
  if (combinator === "and") {
    const lists = group.rules.map((entry) => {
      const part = compileEntry(entry, effectiveNot, tagPools);
      // Skipped children (locked/unsupported negation) must not void the group.
      return part.length > 0 ? part : [emptyVariant()];
    });
    return crossMerge(lists);
  }
  const out: CoverQueryVariant[] = [];
  for (const entry of group.rules) {
    const part = compileEntry(entry, effectiveNot, tagPools);
    if (part.some((variant) => isIdentityVariant(variant))) {
      // An unconstrained OR branch makes the whole disjunction match-all.
      log.warn("OR branch without constraints makes the condition match everything");
      return [emptyVariant()];
    }
    out.push(...part);
    if (out.length > COVER_CONDITION_MAX_VARIANTS) {
      log.warn(`OR group exceeds ${COVER_CONDITION_MAX_VARIANTS} fetch variants; truncating`);
      return out.slice(0, COVER_CONDITION_MAX_VARIANTS);
    }
  }
  return out;
}

/** Compiles a condition tree into fetch variants; an empty result degrades to one unconstrained query. */
export function conditionToVariants(condition: CoverConditionGroup, tagPools: TagPool[] = []): CoverQueryVariant[] {
  const variants = compileGroup(condition, false, tagPools).filter((variant) => !isIdentityVariant(variant));
  return variants.length > 0 ? variants : [emptyVariant()];
}

function serializeVariant(variant: CoverQueryVariant, template: CoverTemplateItem, tagPools: TagPool[]): string {
  const params = new URLSearchParams();
  const site = variant.site ?? template.site ?? "safebooru.org";
  if (variant.ratio && variant.ratio !== "any") params.set("ratio", variant.ratio);
  if (variant.rating && variant.rating !== "all") params.set("rating", variant.rating);
  if (variant.minScore && Number(variant.minScore) > 0) params.set("min_score", String(variant.minScore));
  if (variant.maxScore && Number(variant.maxScore) > 0) params.set("max_score", String(variant.maxScore));
  if (variant.timeRange && variant.timeRange !== "any" && variant.timeRange !== "all") params.set("time_range", variant.timeRange);
  if (variant.notTimeRange) params.set("not_time_range", variant.notTimeRange);
  if (variant.notRatio) params.set("not_ratio", variant.notRatio);
  if (variant.notRating) params.set("not_rating", variant.notRating);
  if (variant.quality && variant.quality !== "original") params.set("quality", variant.quality);

  const blacklist = [...variant.blacklist];
  if (template.blacklist) blacklist.push(template.blacklist);
  if (blacklist.length > 0) params.set("blacklist", blacklist.join(","));

  params.set("site", site);
  if (variant.tags) params.set("tags", variant.tags);

  let candidateItems: string[] = [];
  if (variant.poolId) {
    const matchedPool = tagPools.find((pool) => pool.id === variant.poolId);
    if (matchedPool && matchedPool.items?.length > 0) candidateItems = poolItemsToTags(matchedPool.items);
  }
  if (candidateItems.length === 0 && template.pool && template.pool.length > 0) {
    candidateItems = poolItemsToTags(template.pool);
  }
  if (candidateItems.length > 0) params.set("pool", candidateItems.join(","));

  return `booru:${site}?${params.toString()}`;
}

/** Template-fields fallback for trees predating the condition model (kept verbatim). */
function legacyTemplateUrl(template: CoverTemplateItem, tagPools: TagPool[]): string {
  const params = new URLSearchParams();
  const site = template.site || "safebooru.org";
  params.set("site", site);
  if (template.aspectRatio && template.aspectRatio !== "any") params.set("ratio", template.aspectRatio);
  if (template.rating && template.rating !== "all") params.set("rating", template.rating);
  if (template.tags) params.set("tags", template.tags);
  if (template.minScore !== undefined && template.minScore > 0) params.set("min_score", String(template.minScore));
  if (template.timeRange && template.timeRange !== "any") params.set("time_range", template.timeRange);
  if (template.imageQuality && template.imageQuality !== "original") params.set("quality", template.imageQuality);
  let candidateItems: string[] = [];
  if (template.poolId) {
    const matchedPool = tagPools.find((pool) => pool.id === template.poolId);
    if (matchedPool && matchedPool.items?.length > 0) candidateItems = poolItemsToTags(matchedPool.items);
  }
  if (candidateItems.length === 0 && template.pool && template.pool.length > 0) {
    candidateItems = poolItemsToTags(template.pool);
  }
  if (template.blacklist) params.set("blacklist", template.blacklist);
  if (candidateItems.length > 0) params.set("pool", candidateItems.join(","));
  return `booru:${site}?${params.toString()}`;
}

/** All fetch queries the template's condition tree expands to (single when AND-only). */
export function templateToUrlVariants(template: CoverTemplateItem, tagPools: TagPool[] = []): string[] {
  if (template.type === "preset_api" || template.type === "custom_url") {
    return [template.url || ""];
  }
  const condition = template.condition
    ?? (template.rules && template.rules.length > 0 ? { combinator: "and" as const, rules: template.rules.map((rule) => ({ id: rule.id, field: rule.field, operator: rule.operator, value: rule.value })) } : undefined);
  if (!condition) {
    return [legacyTemplateUrl(template, tagPools)];
  }
  return conditionToVariants(condition, tagPools).map((variant) => serializeVariant(variant, template, tagPools));
}

import type { Field, FullOperator, Translations } from "svelte-querybuilder";
import type { CoverConditionRule, TagPool } from "../lets-more-background/sources";

type Label = (key: string, fallback: string) => string;

const SITES: Array<[string, string]> = [
  ["safebooru.org", "Safebooru.org"], ["yande.re", "Yande.re"], ["konachan.com", "Konachan"], ["gelbooru.com", "Gelbooru"], ["safebooru.donmai.us", "Safebooru (Danbooru mirror)"], ["danbooru.donmai.us", "Danbooru"],
];

function selectField(name: CoverConditionRule["field"], fieldLabel: string, values: Array<[string, string]>, operator: CoverConditionRule["operator"]): Field {
  return { name, label: fieldLabel, valueEditorType: "select", values: values.map(([value, text]) => ({ name: value, label: text })), defaultOperator: operator, defaultValue: values[0]?.[0] ?? "" };
}

export function buildFields(label: Label, tagPools: TagPool[]): Field[] {
  return [
    selectField("aspectRatio", label("fieldRatio", "Aspect ratio"), [["landscape", label("ratioLandscape", "Landscape")], ["wide", label("ratioWide", "Wide")], ["portrait", label("ratioPortrait", "Portrait")], ["any", label("ratioAny", "Any ratio")]], "equals"),
    selectField("site", label("fieldSite", "Booru site"), SITES, "equals"),
    selectField("rating", label("fieldRating", "Safety rating"), [["safe", label("ratingSafe", "Safe")], ["general", label("ratingGeneral", "General")], ["questionable", label("ratingQuestionable", "Questionable")], ["all", label("ratingAll", "All")]], "equals"),
    { name: "tags", label: label("fieldTags", "Fixed tags"), defaultOperator: "contains", defaultValue: "wallpaper" },
    { name: "minScore", label: label("fieldMinScore", "Minimum score"), inputType: "number", defaultOperator: "gte", defaultValue: 5 },
    { name: "timeRange", label: label("fieldTimeRange", "Time range"), defaultOperator: "equals", defaultValue: "30d" },
    selectField("tagPool", label("fieldTagPool", "Tag or artist pool"), tagPools.map((pool) => [pool.id, pool.name]), "randomIn"),
    selectField("excludeTagPool", label("fieldExcludeTagPool", "Excluded tag pool"), tagPools.map((pool) => [pool.id, pool.name]), "excludeAllIn"),
    selectField("imageQuality", label("fieldImageQuality", "Image quality"), [["original", label("qualityOriginal", "Original")], ["sample", label("qualitySample", "Sample")], ["preview", label("qualityPreview", "Preview")]], "equals"),
    { name: "blacklist", label: label("fieldBlacklist", "Excluded tags"), defaultOperator: "containsNone", defaultValue: "" },
  ];
}

export function buildOperators(label: Label): FullOperator[] {
  return [
    { name: "equals", value: "equals", label: label("opEquals", "is") }, { name: "contains", value: "contains", label: label("opContains", "contains") }, { name: "gte", value: "gte", label: label("opGte", "is at least") }, { name: "randomIn", value: "randomIn", label: label("opRandomIn", "random in") }, { name: "excludeAllIn", value: "excludeAllIn", label: label("opExcludeAllIn", "excludes every entry in") }, { name: "containsNone", value: "containsNone", label: label("opContainsNone", "excludes tags") },
  ];
}

export function buildCombinators(label: Label): { name: string; value: string; label: string }[] {
  return [
    { name: "and", value: "and", label: label("conditionAnd", "and") },
    { name: "or", value: "or", label: label("conditionOr", "or") },
  ];
}

export function buildTranslations(label: Label): Partial<Translations> {
  const t = {
    fields: { title: label("field", "Field") },
    operators: { title: label("operator", "Operator") },
    values: { title: label("value", "Value") },
    value: { title: label("value", "Value") },
    combinators: { title: label("conditionAnd", "Combinator") },
    notToggle: { title: label("conditionNot", "not") },
    addRule: { label: label("addRule", "Add filter rule"), title: label("addRule", "Add filter rule") },
    addGroup: { label: label("addConditionGroup", "Add group"), title: label("addConditionGroup", "Add filter group") },
    removeRule: { label: label("deleteCondition", "Delete"), title: label("deleteCondition", "Delete filter rule") },
    removeGroup: { label: label("deleteCondition", "Delete"), title: label("deleteCondition", "Delete filter group") },
    cloneRule: { label: label("cloneCondition", "Clone"), title: label("cloneCondition", "Clone filter rule") },
    cloneRuleGroup: { label: label("cloneConditionGroup", "Clone"), title: label("cloneConditionGroup", "Clone filter group") },
    lockRule: { label: label("lockCondition", "Lock"), title: label("lockCondition", "Lock condition") },
    lockGroup: { label: label("lockConditionGroup", "Lock"), title: label("lockConditionGroup", "Lock filter group") },
    lockRuleDisabled: { label: label("unlockCondition", "Unlock"), title: label("unlockCondition", "Unlock condition") },
    lockGroupDisabled: { label: label("unlockConditionGroup", "Unlock"), title: label("unlockConditionGroup", "Unlock filter group") },
    shiftActions: { shiftUp: label("moveConditionUp", "Move up"), shiftDown: label("moveConditionDown", "Move down") },
    undoRedoActions: { undo: label("undoCondition", "Undo"), redo: label("redoCondition", "Redo") },
  };
  return t as Partial<Translations>;
}

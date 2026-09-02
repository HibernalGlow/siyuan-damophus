import type { Field, FullOperator, Translations } from "svelte-querybuilder";
import type { PracticeFilterField } from "@/question-bank/core/scope";

type Label = (key: string, fallback: string) => string;

/** Human label for a boolean option of a filter field. */
export function optionLabel(label: Label, field: PracticeFilterField, value: unknown): string {
  const yes = value === "yes";
  const labels: Record<PracticeFilterField, [string, string]> = {
    attempted: [label("attemptedStatusYes", "Attempted"), label("attemptedStatusNo", "Unattempted")],
    wrong: [label("wrongStatusYes", "Wrong"), label("wrongStatusNo", "Not wrong")],
    review: [label("reviewStatusYes", "Needs review"), label("reviewStatusNo", "Does not need review")],
    due: [label("dueStatusYes", "Due"), label("dueStatusNo", "Not due")],
    bookmarked: [label("bookmarkedStatusYes", "Bookmarked"), label("bookmarkedStatusNo", "Not bookmarked")],
  };
  return labels[field][yes ? 0 : 1];
}

export function fieldDefinition(label: Label, name: PracticeFilterField, fieldLabel: string): Field {
  return {
    name,
    label: fieldLabel,
    valueEditorType: "select",
    values: [
      { name: "any", label: label("allQuestions", "全部题") },
      { name: "yes", label: optionLabel(label, name, "yes") },
      { name: "no", label: optionLabel(label, name, "no") },
    ],
    defaultOperator: "equal",
    defaultValue: "yes",
  };
}

export function buildFields(label: Label): Field[] {
  return [
    fieldDefinition(label, "attempted", label("attemptedStatus", "Attempt status")),
    fieldDefinition(label, "wrong", label("wrongStatus", "Wrong-answer status")),
    fieldDefinition(label, "review", label("reviewStatus", "Review status")),
    fieldDefinition(label, "due", label("dueStatus", "Due status")),
    fieldDefinition(label, "bookmarked", label("bookmarkedStatus", "Bookmark status")),
  ];
}

export function buildOperators(label: Label): FullOperator[] {
  return [
    { name: "equal", value: "equal", label: label("conditionEqual", "equals") },
    { name: "notEqual", value: "notEqual", label: label("conditionNotEqual", "does not equal") },
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
    fields: { title: label("filter", "Field") },
    operators: { title: label("conditionEqual", "Operator") },
    values: { title: label("selectConditionValue", "Value") },
    value: { title: label("selectConditionValue", "Value") },
    combinators: { title: label("conditionAnd", "Combinator") },
    addRule: {
      label: label("addCondition", "Add condition"),
      title: label("addCondition", "Add condition"),
    },
    addGroup: {
      label: label("addConditionGroup", "Add group"),
      title: label("addConditionGroup", "Add group"),
    },
    removeRule: {
      label: label("deleteCondition", "Delete"),
      title: label("deleteCondition", "Delete condition"),
    },
    removeGroup: {
      label: label("deleteCondition", "Delete"),
      title: label("deleteCondition", "Delete group"),
    },
    cloneRule: { label: label("cloneCondition", "Clone"), title: label("cloneCondition", "Clone condition") },
    cloneRuleGroup: { label: label("cloneConditionGroup", "Clone"), title: label("cloneConditionGroup", "Clone group") },
    lockRule: { label: label("lockCondition", "Lock"), title: label("lockCondition", "Lock condition") },
    lockGroup: { label: label("lockConditionGroup", "Lock"), title: label("lockConditionGroup", "Lock group") },
    lockRuleDisabled: { label: label("unlockCondition", "Unlock"), title: label("unlockCondition", "Unlock condition") },
    lockGroupDisabled: { label: label("unlockConditionGroup", "Unlock"), title: label("unlockConditionGroup", "Unlock group") },
    shiftActions: { shiftUp: label("moveConditionUp", "Move up"), shiftDown: label("moveConditionDown", "Move down") },
    undoRedoActions: { undo: label("undoCondition", "Undo"), redo: label("redoCondition", "Redo") },
  };
  return t as Partial<Translations>;
}

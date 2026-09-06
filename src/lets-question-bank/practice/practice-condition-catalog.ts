import type { Field, FullOperator, Translations } from "svelte-querybuilder";
import {
  PRACTICE_BOOLEAN_FILTER_FIELDS,
  type PracticeBooleanFilterField,
  type PracticeFilterField,
  type PracticeLastResult,
} from "@/question-bank/core/scope";
import type { MasteryRating } from "@/question-bank/core/types";

type Label = (key: string, fallback: string) => string;

export const RATING_VALUES: readonly MasteryRating[] = ["again", "hard", "good", "easy"];
export const LAST_RESULT_VALUES: readonly PracticeLastResult[] = ["correct", "wrong", "unattempted"];
/** Fields whose rules carry yes/no tokens. */
export const BOOLEAN_FIELD_NAMES: readonly PracticeBooleanFilterField[] = PRACTICE_BOOLEAN_FILTER_FIELDS;
/** Fields whose rules carry a numeric threshold (counts and days). */
export const NUMBER_FIELD_NAMES: readonly PracticeFilterField[] = ["wrong_count", "attempt_count", "last_answered_days"];

/** Human label for a boolean option of a filter field. */
export function optionLabel(label: Label, field: PracticeBooleanFilterField, value: unknown): string {
  const yes = value === "yes";
  const labels: Record<PracticeBooleanFilterField, [string, string]> = {
    attempted: [label("attemptedStatusYes", "Attempted"), label("attemptedStatusNo", "Unattempted")],
    wrong: [label("wrongStatusYes", "Wrong"), label("wrongStatusNo", "Not wrong")],
    review: [label("reviewStatusYes", "Needs review"), label("reviewStatusNo", "Does not need review")],
    due: [label("dueStatusYes", "Due"), label("dueStatusNo", "Not due")],
    bookmarked: [label("bookmarkedStatusYes", "Bookmarked"), label("bookmarkedStatusNo", "Not bookmarked")],
  };
  return labels[field][yes ? 0 : 1];
}

/** Human label for a mastery-rating option of the latest-rating filter. */
export function ratingOptionLabel(label: Label, rating: MasteryRating): string {
  const labels: Record<MasteryRating, string> = {
    again: label("again", "Again"),
    hard: label("hard", "Hard"),
    good: label("good", "Good"),
    easy: label("easy", "Easy"),
  };
  return labels[rating];
}

/** Human label for a last-result option of the last-result filter. */
export function lastResultOptionLabel(label: Label, value: PracticeLastResult): string {
  const labels: Record<PracticeLastResult, string> = {
    correct: label("lastResultCorrect", "Correct"),
    wrong: label("lastResultWrong", "Wrong"),
    unattempted: label("lastResultUnattempted", "Unattempted"),
  };
  return labels[value];
}

function booleanFieldDefinition(label: Label, name: PracticeBooleanFilterField, fieldLabel: string): Field {
  return {
    name,
    label: fieldLabel,
    valueEditorType: "select",
    operators: ["equal", "notEqual"],
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
  const numberOperators = ["equal", "notEqual", "greater", "less", "greaterOrEqual", "lessOrEqual"];
  return [
    booleanFieldDefinition(label, "attempted", label("attemptedStatus", "Attempt status")),
    booleanFieldDefinition(label, "wrong", label("wrongStatus", "Wrong-answer status")),
    booleanFieldDefinition(label, "review", label("reviewStatus", "Review status")),
    booleanFieldDefinition(label, "due", label("dueStatus", "Due status")),
    booleanFieldDefinition(label, "bookmarked", label("bookmarkedStatus", "Bookmark status")),
    {
      name: "latest_rating",
      label: label("latestRating", "Latest rating"),
      valueEditorType: "multiselect",
      operators: ["equal", "notEqual"],
      values: RATING_VALUES.map((rating) => ({ name: rating, label: ratingOptionLabel(label, rating) })),
      defaultOperator: "equal",
      defaultValue: ["again", "hard"],
    },
    {
      name: "last_result",
      label: label("lastResult", "Last result"),
      valueEditorType: "select",
      operators: ["equal", "notEqual"],
      values: [
        { name: "any", label: label("allQuestions", "全部题") },
        ...LAST_RESULT_VALUES.map((value) => ({ name: value, label: lastResultOptionLabel(label, value) })),
      ],
      defaultOperator: "equal",
      defaultValue: "wrong",
    },
    {
      name: "wrong_count",
      label: label("wrongCount", "Wrong count"),
      valueEditorType: "text",
      inputType: "number",
      operators: numberOperators,
      defaultOperator: "greaterOrEqual",
      defaultValue: 1,
    },
    {
      name: "attempt_count",
      label: label("attemptCount", "Attempt count"),
      valueEditorType: "text",
      inputType: "number",
      operators: numberOperators,
      defaultOperator: "greaterOrEqual",
      defaultValue: 1,
    },
    {
      name: "last_answered_days",
      label: label("lastAnsweredDays", "Days since last attempt"),
      valueEditorType: "text",
      inputType: "number",
      operators: numberOperators,
      defaultOperator: "lessOrEqual",
      defaultValue: 7,
    },
  ];
}

/** Initial rule payload per field, mirroring the Field.defaultValue entries above. */
export function defaultRuleValue(field: PracticeFilterField): unknown {
  switch (field) {
    case "latest_rating": return ["again", "hard"];
    case "last_result": return "wrong";
    case "wrong_count":
    case "attempt_count": return 1;
    case "last_answered_days": return 7;
    default: return "yes";
  }
}

export function buildOperators(label: Label): FullOperator[] {
  return [
    { name: "equal", value: "equal", label: label("conditionEqual", "equals") },
    { name: "notEqual", value: "notEqual", label: label("conditionNotEqual", "does not equal") },
    { name: "greater", value: "greater", label: label("conditionGreater", "greater than") },
    { name: "less", value: "less", label: label("conditionLess", "less than") },
    { name: "greaterOrEqual", value: "greaterOrEqual", label: label("conditionGreaterOrEqual", "at least") },
    { name: "lessOrEqual", value: "lessOrEqual", label: label("conditionLessOrEqual", "at most") },
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

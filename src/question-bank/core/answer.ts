import type { ObjectiveAnswer, Question } from "./types";

export function serializeObjectiveAnswer(answer: ObjectiveAnswer): string {
  return answer.kind === "boolean" ? String(answer.value) : normalizeOptionIds(answer.optionIds).join(",");
}

export function normalizeOptionIds(optionIds: readonly string[]): string[] {
  return [...new Set(optionIds.map((id) => id.trim().toUpperCase()).filter(Boolean))].sort();
}

export function gradeObjective(
  answer: ObjectiveAnswer | undefined,
  selectedOptionIds: readonly string[],
): boolean | null {
  if (!answer) return null;
  if (answer.kind === "boolean") {
    if (selectedOptionIds.length !== 1) return false;
    return selectedOptionIds[0].trim().toLowerCase() === String(answer.value);
  }
  const expected = normalizeOptionIds(answer.optionIds);
  const selected = normalizeOptionIds(selectedOptionIds);
  return expected.length === selected.length && expected.every((id, index) => id === selected[index]);
}

export function gradeQuestion(question: Question, selectedOptionIds: readonly string[]): boolean | null {
  return gradeObjective(question.answer, selectedOptionIds);
}

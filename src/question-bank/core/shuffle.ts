import type { Question, ShuffledOption, ShuffledQuestion } from "./types";

function labelForIndex(index: number): string {
  let value = index + 1;
  let label = "";
  while (value > 0) {
    value -= 1;
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26);
  }
  return label;
}

function sourceOptions(question: Question): Question["options"] {
  if (question.type === "true-false" && question.options.length === 0) {
    return [
      { id: "true", markdown: "" },
      { id: "false", markdown: "" },
    ];
  }
  return question.options;
}

export function shuffleQuestionOptions(
  question: Question,
  random: () => number = Math.random,
): ShuffledQuestion {
  const options = sourceOptions(question).map((option) => ({ ...option }));
  for (let index = options.length - 1; index > 0; index -= 1) {
    const target = Math.min(index, Math.max(0, Math.floor(random() * (index + 1))));
    [options[index], options[target]] = [options[target], options[index]];
  }
  return {
    questionId: question.id,
    optionOrder: options.map((option) => option.id),
    options: options.map((option, index) => ({
      originalId: option.id,
      displayLabel: labelForIndex(index),
      markdown: option.markdown,
    })),
  };
}

export function questionOptionsFromOrder(
  question: Question,
  optionOrder: readonly string[],
): ShuffledQuestion {
  const options = sourceOptions(question);
  const byId = new Map(options.map((option) => [option.id, option]));
  const normalizedOrder = [
    ...optionOrder.filter((optionId) => byId.has(optionId)),
    ...options.map((option) => option.id).filter((optionId) => !optionOrder.includes(optionId)),
  ];
  return {
    questionId: question.id,
    optionOrder: normalizedOrder,
    options: normalizedOrder.map((optionId, index) => ({
      originalId: optionId,
      displayLabel: labelForIndex(index),
      markdown: byId.get(optionId)?.markdown ?? "",
    })),
  };
}

export function restoreQuestionOptions(
  question: Question,
  shuffled: ShuffledQuestion,
): ShuffledOption[] {
  const displayed = new Map(shuffled.options.map((option) => [option.originalId, option]));
  return sourceOptions(question).map((option, index) => ({
    originalId: option.id,
    displayLabel: labelForIndex(index),
    markdown: displayed.get(option.id)?.markdown ?? option.markdown,
  }));
}

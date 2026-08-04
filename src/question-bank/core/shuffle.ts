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

export function shuffleQuestionOptions(
  question: Question,
  random: () => number = Math.random,
): ShuffledQuestion {
  const options = question.options.map((option) => ({ ...option }));
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

export function restoreQuestionOptions(
  question: Question,
  shuffled: ShuffledQuestion,
): ShuffledOption[] {
  const displayed = new Map(shuffled.options.map((option) => [option.originalId, option]));
  return question.options.map((option, index) => ({
    originalId: option.id,
    displayLabel: labelForIndex(index),
    markdown: displayed.get(option.id)?.markdown ?? option.markdown,
  }));
}

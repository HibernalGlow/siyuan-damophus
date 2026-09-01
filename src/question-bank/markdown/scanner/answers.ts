import { normalizeOptionIds } from "../../core/answer";
import type { ObjectiveAnswer, QuestionType } from "../../core/types";

export function inferQuestionType(
  title: string,
  body: string,
  answerAttribute?: string,
): QuestionType | undefined {
  const sample = `${title}\n${body}`;
  // Prefer the persisted machine answer. Legacy sources may omit all type
  // wording, while a single/multi-letter answer is enough to classify the
  // ordinary choice question.
  const answer = answerAttribute?.trim().replace(/[,，、\s]+/gu, "").toUpperCase();
  if (answer && /^[A-Z]+$/u.test(answer)) return answer.length === 1 ? "single" : "multiple";

  if (/(?:题组|材料题|共用题干)/u.test(sample)) return "group";
  if (/(?:主观题|简答题|论述题)/u.test(sample)) return "subjective";
  if (/(?:判断题|正确还是错误|对还是错)/u.test(sample)) return "true-false";
  if (/(?:不定项|不定项选择)/u.test(sample)) return "indefinite";
  if (/(?:多选|多项选择|[（(]多[）)])/u.test(sample)) return "multiple";
  if (/(?:单选|单项选择|[（(]单[）)])/u.test(sample)) return "single";
  return undefined;
}

export function parseChoiceIds(value: string, validOptionIds: readonly string[] = []): string[] | undefined {
  const compact = value.trim().toUpperCase();
  if (!compact) return undefined;
  const valid = new Set(validOptionIds.map((id) => id.toUpperCase()));
  const ids = /[,，、\s]/u.test(compact)
    ? compact.split(/[,，、\s]+/u)
    : valid.has(compact)
      ? [compact]
    : /^[A-Z]+$/u.test(compact)
      ? [...compact]
      : [compact];
  if (ids.some((id) => !/^[A-Z0-9]+$/u.test(id))) return undefined;
  const normalized = normalizeOptionIds(ids);
  return normalized.length > 0 ? normalized : undefined;
}

export function parseAnswer(
  value: string | undefined,
  type: QuestionType,
  validOptionIds: readonly string[] = [],
): ObjectiveAnswer | undefined {
  if (!value) return undefined;
  if (type === "true-false") {
    const normalized = value.trim().toLowerCase();
    if (["true", "正确", "对"].includes(normalized)) return { kind: "boolean", value: true };
    if (["false", "错误", "错"].includes(normalized)) return { kind: "boolean", value: false };
    return undefined;
  }
  if (["single", "multiple", "indefinite"].includes(type)) {
    const optionIds = parseChoiceIds(value, validOptionIds);
    return optionIds ? { kind: "options", optionIds } : undefined;
  }
  return undefined;
}

export function visibleAnswer(solution: string, type: QuestionType): ObjectiveAnswer | undefined {
  if (type === "true-false") {
    const match = solution.match(/(?:正确)?答案\s*(?:为|是|[:：])\s*(正确|错误|对|错|true|false)/iu);
    return parseAnswer(match?.[1], type);
  }
  if (["single", "multiple", "indefinite"].includes(type)) {
    const match = solution.match(/(?:正确)?答案\s*(?:为|是|[:：])\s*([A-H](?:[\s,，、]*[A-H])*)/iu);
    return parseAnswer(match?.[1], type);
  }
  return undefined;
}

export function serializeAnswer(answer: ObjectiveAnswer): string {
  return answer.kind === "boolean" ? String(answer.value) : normalizeOptionIds(answer.optionIds).join(",");
}

export function answersEqual(left: ObjectiveAnswer, right: ObjectiveAnswer): boolean {
  if (left.kind !== right.kind) return false;
  if (left.kind === "boolean" && right.kind === "boolean") return left.value === right.value;
  if (left.kind === "options" && right.kind === "options") {
    const leftIds = normalizeOptionIds(left.optionIds);
    const rightIds = normalizeOptionIds(right.optionIds);
    return leftIds.length === rightIds.length && leftIds.every((id, index) => id === rightIds[index]);
  }
  return false;
}

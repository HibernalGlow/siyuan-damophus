import { QuestionSchema } from "../../core/schema";
import { serializeObjectiveAnswer } from "../../core/answer";
import type { ObjectiveAnswer, Question } from "../../core/types";
import type { SiyuanKernelClient } from "./types";

export const ANSWER_CORRECTED_ATTRIBUTE = "custom-qb-answer-corrected";

export function correctedAnswerAttributes(question: Question, answer: ObjectiveAnswer): Record<string, string> {
  const parsed = QuestionSchema.safeParse({ ...question, answer });
  if (!parsed.success) {
    throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
  }
  return {
    "custom-qb-answer": serializeObjectiveAnswer(answer),
    [ANSWER_CORRECTED_ATTRIBUTE]: "true",
  };
}

export async function correctQuestionAnswer(
  client: SiyuanKernelClient,
  questionBlockId: string,
  question: Question,
  answer: ObjectiveAnswer,
): Promise<void> {
  await client.request("/api/attr/setBlockAttrs", {
    id: questionBlockId,
    attrs: correctedAnswerAttributes(question, answer),
  });
}

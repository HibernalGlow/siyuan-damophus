import type { Question, TopicNode } from "../core/types";
import type { ExamSessionSnapshot } from "./schema";

export interface ExamSourceSelection {
  sourceKeys: string[];
  scopeIds?: string[];
  questionIds?: string[];
}

export interface ResolvedExamSource {
  sourceKeys: string[];
  questions: Question[];
  topics: TopicNode[];
  blockIdsByQuestionId: ReadonlyMap<string, string>;
}

export interface ExamQuestionSourceProvider {
  resolve(selection: ExamSourceSelection): Promise<ResolvedExamSource>;
}

export async function hydrateExamSessionSource(
  provider: ExamQuestionSourceProvider,
  snapshot: Pick<ExamSessionSnapshot, "queue_question_ids">,
): Promise<ResolvedExamSource> {
  const resolved = await provider.resolve({
    sourceKeys: [],
    questionIds: snapshot.queue_question_ids,
  });
  const questionsById = new Map(resolved.questions.map((question) => [question.id, question]));
  const questions = snapshot.queue_question_ids.map((questionId) => {
    const question = questionsById.get(questionId);
    if (!question) throw new Error(`Exam question '${questionId}' is unavailable`);
    return question;
  });
  return { ...resolved, questions };
}

export class StaticExamQuestionSourceProvider implements ExamQuestionSourceProvider {
  constructor(private readonly source: ResolvedExamSource) {}

  async resolve(selection: ExamSourceSelection): Promise<ResolvedExamSource> {
    const allowed = selection.questionIds ? new Set(selection.questionIds) : undefined;
    return {
      ...this.source,
      sourceKeys: selection.sourceKeys,
      questions: allowed
        ? this.source.questions.filter((question) => allowed.has(question.id))
        : [...this.source.questions],
    };
  }
}

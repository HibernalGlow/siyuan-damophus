import { gradeQuestion } from "../core/answer";
import type { Question } from "../core/types";
import type { ExamQuestionDraft, ExamScoringMode, ExamSessionSnapshot } from "./schema";

export interface ExamQuestionScore {
  questionId: string;
  maxScore: number;
  score: number;
  objectiveCorrect: boolean | null;
  answered: boolean;
  assisted: boolean;
  pendingManualScore: boolean;
}

export interface ExamScoreSummary {
  score: number;
  maxScore: number;
  correctCount: number;
  answeredCount: number;
  pendingManualCount: number;
  percentage: number;
  questions: ExamQuestionScore[];
}

export interface ScoringStrategy {
  readonly id: ExamScoringMode;
  maxScore(question: Question, subjectivePoints: number): number;
  score(question: Question, draft: ExamQuestionDraft, subjectivePoints: number): ExamQuestionScore;
}

function objectiveScore(
  question: Question,
  draft: ExamQuestionDraft,
  maxScore: number,
): ExamQuestionScore {
  const answered = draft.selected_option_ids.length > 0;
  const objectiveCorrect = answered ? gradeQuestion(question, draft.selected_option_ids) : false;
  const assisted = draft.revealed;
  return {
    questionId: question.id,
    maxScore,
    score: objectiveCorrect && !assisted ? maxScore : 0,
    objectiveCorrect,
    answered,
    assisted,
    pendingManualScore: false,
  };
}

function subjectiveScore(
  question: Question,
  draft: ExamQuestionDraft,
  maxScore: number,
): ExamQuestionScore {
  const answered = Boolean(draft.answer_text?.trim());
  const pendingManualScore = draft.subjective_score === undefined;
  return {
    questionId: question.id,
    maxScore,
    score: pendingManualScore ? 0 : maxScore * (draft.subjective_score ?? 0) / 100,
    objectiveCorrect: null,
    answered,
    assisted: draft.revealed,
    pendingManualScore,
  };
}

class LegalExamScoringStrategy implements ScoringStrategy {
  readonly id = "legal-exam" as const;

  maxScore(question: Question, subjectivePoints: number): number {
    if (question.type === "multiple" || question.type === "indefinite") return 2;
    if (question.type === "subjective") return subjectivePoints;
    return 1;
  }

  score(question: Question, draft: ExamQuestionDraft, subjectivePoints: number): ExamQuestionScore {
    const maxScore = this.maxScore(question, subjectivePoints);
    return question.type === "subjective"
      ? subjectiveScore(question, draft, maxScore)
      : objectiveScore(question, draft, maxScore);
  }
}

class StrictScoringStrategy implements ScoringStrategy {
  readonly id = "strict" as const;

  maxScore(question: Question, subjectivePoints: number): number {
    return question.type === "subjective" ? subjectivePoints : 1;
  }

  score(question: Question, draft: ExamQuestionDraft, subjectivePoints: number): ExamQuestionScore {
    const maxScore = this.maxScore(question, subjectivePoints);
    return question.type === "subjective"
      ? subjectiveScore(question, draft, maxScore)
      : objectiveScore(question, draft, maxScore);
  }
}

const strategies: Record<ExamScoringMode, ScoringStrategy> = {
  "legal-exam": new LegalExamScoringStrategy(),
  strict: new StrictScoringStrategy(),
};

export function scoringStrategy(mode: ExamScoringMode): ScoringStrategy {
  return strategies[mode];
}

export function scoreExam(
  snapshot: ExamSessionSnapshot,
  questions: readonly Question[],
): ExamScoreSummary {
  const byId = new Map(questions.map((question) => [question.id, question]));
  const strategy = scoringStrategy(snapshot.blueprint.scoring_mode);
  const results = snapshot.queue_question_ids.map((questionId) => {
    const question = byId.get(questionId);
    const draft = snapshot.drafts[questionId];
    if (!question || !draft) throw new Error(`Exam question '${questionId}' is unavailable`);
    return strategy.score(question, draft, snapshot.blueprint.subjective_points);
  });
  const score = results.reduce((total, result) => total + result.score, 0);
  const maxScore = results.reduce((total, result) => total + result.maxScore, 0);
  return {
    score,
    maxScore,
    correctCount: results.filter((result) => result.objectiveCorrect === true).length,
    answeredCount: results.filter((result) => result.answered).length,
    pendingManualCount: results.filter((result) => result.pendingManualScore).length,
    percentage: maxScore === 0 ? 0 : score / maxScore * 100,
    questions: results,
  };
}

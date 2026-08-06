import { createAttemptEvent } from "../core/attempts";
import type { AttemptEvent, ExamSummaryEvent, Question } from "../core/types";
import type { ExamSessionSnapshot } from "./schema";
import { scoreExam, type ExamScoreSummary } from "./scoring";

export interface ExamQuestionRelation {
  questionId: string;
  blockId?: string;
}

export interface ExamSubmissionPlan {
  attempts: AttemptEvent[];
  summary: ExamScoreSummary;
  pendingSubjectiveQuestionIds: string[];
}

export function buildExamSummaryEvent(
  snapshot: ExamSessionSnapshot,
  plan: ExamSubmissionPlan,
  kind: ExamSummaryEvent["event_kind"],
  now = new Date().toISOString(),
): ExamSummaryEvent {
  const status = kind === "exam_submitted"
    ? (plan.pendingSubjectiveQuestionIds.length > 0 ? "pending_manual_score" : "submitted")
    : kind === "exam_finalized" ? "finalized" : "abandoned";
  return {
    schema_version: 1,
    event_kind: kind,
    attempt_id: `exam-event:${snapshot.exam_id}:${kind}`,
    session_id: snapshot.exam_id,
    answered_at: now,
    session_mode: "exam",
    exam_status: status,
    exam_score: plan.summary.score,
    exam_max_score: plan.summary.maxScore,
    exam_duration_ms: Date.parse(now) - Date.parse(snapshot.started_at),
    exam_payload: JSON.stringify({
      blueprint: snapshot.blueprint,
      queue_question_ids: snapshot.queue_question_ids,
      committed_question_ids: snapshot.committed_question_ids,
      pending_subjective_question_ids: plan.pendingSubjectiveQuestionIds,
      score: plan.summary,
    }),
  };
}

export function examAttemptId(examId: string, questionId: string): string {
  return `exam:${examId}:${questionId}`;
}

export function buildExamSubmissionPlan(
  snapshot: ExamSessionSnapshot,
  questions: readonly Question[],
  relations: readonly ExamQuestionRelation[] = [],
): ExamSubmissionPlan {
  const questionById = new Map(questions.map((question) => [question.id, question]));
  const relationById = new Map(relations.map((relation) => [relation.questionId, relation.blockId]));
  const summary = scoreExam(snapshot, questions);
  const scoreById = new Map(summary.questions.map((result) => [result.questionId, result]));
  const attempts: AttemptEvent[] = [];
  const pendingSubjectiveQuestionIds: string[] = [];
  for (const questionId of snapshot.queue_question_ids) {
    const question = questionById.get(questionId);
    const draft = snapshot.drafts[questionId];
    const result = scoreById.get(questionId);
    if (!question || !draft || !result) throw new Error(`Exam question '${questionId}' is unavailable`);
    if (question.type === "subjective" && result.pendingManualScore) {
      pendingSubjectiveQuestionIds.push(questionId);
      continue;
    }
    attempts.push(createAttemptEvent({
      attemptId: examAttemptId(snapshot.exam_id, questionId),
      questionId,
      questionRelation: relationById.get(questionId),
      sessionId: snapshot.exam_id,
      answeredAt: snapshot.submitted_at ?? new Date().toISOString(),
      questionType: question.type,
      optionOrder: draft.option_order,
      selectedOptionIds: draft.selected_option_ids,
      objectiveCorrect: result.objectiveCorrect,
      masteryRating: result.objectiveCorrect === true ? "good" : "again",
      subjectiveScore: draft.subjective_score,
      durationMs: draft.elapsed_ms,
      sessionMode: "exam",
      ratingSource: "exam-auto",
    }));
  }
  return { attempts, summary, pendingSubjectiveQuestionIds };
}

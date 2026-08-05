import type { AttemptEvent, Question } from "./types";
import {
  createPracticeDraft,
  questionAnswerSignature,
  questionOptionIds,
  type PracticeDraft,
  type PracticeSessionSnapshot,
} from "./session-schema";

export interface PracticeSessionRecoveryIssue {
  code: "missing-question" | "changed-question-structure" | "removed-draft-selection";
  questionId: string;
}

export interface PracticeSessionRecoveryResult {
  snapshot?: PracticeSessionSnapshot;
  attemptsByQuestionId: ReadonlyMap<string, AttemptEvent>;
  issues: PracticeSessionRecoveryIssue[];
}

function latestSessionAttempts(
  sessionId: string,
  attempts: readonly AttemptEvent[],
): Map<string, AttemptEvent> {
  const result = new Map<string, AttemptEvent>();
  for (const attempt of [...attempts]
    .filter((event) => event.session_id === sessionId)
    .sort((left, right) => left.answered_at.localeCompare(right.answered_at))) {
    result.set(attempt.question_id, attempt);
  }
  return result;
}

function reconcileDraft(
  draft: PracticeDraft | undefined,
  question: Question,
  issues: PracticeSessionRecoveryIssue[],
): PracticeDraft {
  if (!draft) return createPracticeDraft(question);
  if (draft.question_type !== question.type || draft.answer_signature !== questionAnswerSignature(question)) {
    issues.push({ code: "changed-question-structure", questionId: question.id });
    return createPracticeDraft(question);
  }

  const availableOptionIds = questionOptionIds(question);
  const available = new Set(availableOptionIds);
  const selectedOptionIds = draft.selected_option_ids.filter((optionId) => available.has(optionId));
  const removedSelection = selectedOptionIds.length !== draft.selected_option_ids.length;
  if (removedSelection) issues.push({ code: "removed-draft-selection", questionId: question.id });
  const optionOrder = [
    ...draft.option_order.filter((optionId) => available.has(optionId)),
    ...availableOptionIds.filter((optionId) => !draft.option_order.includes(optionId)),
  ];
  const optionSetChanged = optionOrder.length !== draft.option_order.length
    || availableOptionIds.some((optionId) => !draft.available_option_ids.includes(optionId));
  return {
    ...draft,
    option_order: optionOrder,
    available_option_ids: availableOptionIds,
    selected_option_ids: selectedOptionIds,
    revealed: optionSetChanged || removedSelection ? false : draft.revealed,
    objective_correct: optionSetChanged || removedSelection ? null : draft.objective_correct,
    subjective_score: question.type === "subjective" ? draft.subjective_score : undefined,
  };
}

export function reconcilePracticeSession(
  source: PracticeSessionSnapshot,
  questions: readonly Question[],
  attempts: readonly AttemptEvent[],
  now = new Date(),
): PracticeSessionRecoveryResult {
  const questionsById = new Map(questions.map((question) => [question.id, question]));
  const issues: PracticeSessionRecoveryIssue[] = [];
  const queueQuestionIds = source.queue_question_ids.filter((questionId) => {
    const exists = questionsById.has(questionId);
    if (!exists) issues.push({ code: "missing-question", questionId });
    return exists;
  });
  const attemptsByQuestionId = latestSessionAttempts(source.session_id, attempts);
  if (queueQuestionIds.length === 0) {
    return { attemptsByQuestionId, issues };
  }

  const drafts = Object.fromEntries(queueQuestionIds.map((questionId) => [
    questionId,
    reconcileDraft(source.drafts[questionId], questionsById.get(questionId)!, issues),
  ]));
  const completedQuestionIds = queueQuestionIds.filter((questionId) => attemptsByQuestionId.has(questionId));
  const currentQuestionId = queueQuestionIds.includes(source.current_question_id)
    ? source.current_question_id
    : queueQuestionIds.find((questionId) => !completedQuestionIds.includes(questionId)) ?? queueQuestionIds[0];

  return {
    snapshot: {
      ...source,
      revision: source.revision + 1,
      queue_question_ids: queueQuestionIds,
      current_question_id: currentQuestionId,
      drafts,
      completed_question_ids: completedQuestionIds,
      updated_at: now.toISOString(),
    },
    attemptsByQuestionId,
    issues,
  };
}

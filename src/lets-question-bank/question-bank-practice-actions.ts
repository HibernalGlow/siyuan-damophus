import { gradeQuestion, normalizeOptionIds } from "@/question-bank/core/answer";
import type { MasteryRating, Question } from "@/question-bank/core/types";
import type { PracticeSessionRuntime } from "@/question-bank/application";
import type { QuestionBankUiController } from "./controller";

export interface PracticeActionState {
  currentQuestion: Question | undefined;
  shuffled: { optionOrder: string[] } | undefined;
  practiceRuntime: PracticeSessionRuntime | undefined;
  selectedOptionIds: string[];
  revealed: boolean;
  readOnlyQuestion: boolean;
  submitting: boolean;
  timingEnabled: boolean;
  previewBlockIds: ReadonlyMap<string, string> | undefined;
  sessionId: string;
  filter: string;
  dueCards: ReadonlyMap<string, any>;
  log?: { debug: (event: string, data: unknown) => void; info: (event: string, data: unknown) => void };
}

export function createPracticeActions(deps: {
  getState: () => PracticeActionState;
  now: () => number;
  setError: (value: string) => void;
  setSubmitting: (value: boolean) => void;
  label: (key: string, fallback: string) => string;
  controller: QuestionBankUiController;
}) {
  const state = () => deps.getState();

  function toggleOption(optionId: string): void {
    const current = state();
    if (!current.currentQuestion || current.revealed || current.readOnlyQuestion || !current.practiceRuntime) return;
    const draft = current.practiceRuntime.actor.getSnapshot().context.session.drafts[current.currentQuestion.id];
    const selectedOptionIds = draft?.selected_option_ids ?? current.selectedOptionIds;
    const nextSelection = current.currentQuestion.type === "multiple" || current.currentQuestion.type === "indefinite"
      ? selectedOptionIds.includes(optionId)
        ? selectedOptionIds.filter((id) => id !== optionId)
        : [...selectedOptionIds, optionId]
      : [optionId];
    current.log?.debug("answer.selection.changed", {
      questionId: current.currentQuestion.id,
      questionType: current.currentQuestion.type,
      selectedOptionIds: normalizeOptionIds(nextSelection),
      optionId,
    });
    current.practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: current.currentQuestion.id,
      patch: { selected_option_ids: nextSelection },
      now: deps.now(),
    });
  }

  function revealAnswer(): void {
    const current = state();
    if (!current.currentQuestion || !current.shuffled || !current.practiceRuntime || current.readOnlyQuestion) return;
    const draft = current.practiceRuntime.actor.getSnapshot().context.session.drafts[current.currentQuestion.id];
    const selectedOptionIds = draft?.selected_option_ids ?? current.selectedOptionIds;
    if (current.currentQuestion.type !== "subjective" && selectedOptionIds.length === 0) {
      deps.setError(deps.label("selectAnswer", "Select an answer before revealing"));
      return;
    }
    deps.setError("");
    const objectiveCorrect = gradeQuestion(current.currentQuestion, selectedOptionIds);
    current.log?.info("answer.graded", {
      questionId: current.currentQuestion.id,
      questionType: current.currentQuestion.type,
      expectedAnswer: current.currentQuestion.answer,
      selectedOptionIds: normalizeOptionIds(selectedOptionIds),
      optionOrder: current.shuffled.optionOrder,
      objectiveCorrect,
    });
    current.practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: current.currentQuestion.id,
      patch: { selected_option_ids: selectedOptionIds, revealed: true, objective_correct: objectiveCorrect },
      now: deps.now(),
    });
  }

  function retry(): void {
    const current = state();
    if (!current.currentQuestion || !current.practiceRuntime || current.readOnlyQuestion) return;
    current.practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: current.currentQuestion.id,
      patch: { selected_option_ids: [], revealed: false, objective_correct: null, subjective_score: undefined },
      now: deps.now(),
    });
    deps.setError("");
  }

  function resetQuestionTimer(): void {
    const current = state();
    if (!current.currentQuestion || !current.practiceRuntime || current.readOnlyQuestion || current.submitting || !current.timingEnabled) return;
    current.practiceRuntime.actor.send({ type: "RESET_QUESTION_TIMER", now: deps.now() });
  }

  function changeSubjectiveScore(event: Event): void {
    const current = state();
    if (!current.currentQuestion || !current.practiceRuntime || current.readOnlyQuestion) return;
    const value = (event.currentTarget as HTMLInputElement).valueAsNumber;
    current.practiceRuntime.actor.send({
      type: "DRAFT_CHANGED",
      questionId: current.currentQuestion.id,
      patch: { subjective_score: Number.isFinite(value) ? value : undefined },
      now: deps.now(),
    });
  }

  function submitRating(rating: MasteryRating): void {
    const current = state();
    if (!current.currentQuestion || !current.shuffled || !current.revealed || current.submitting || !current.practiceRuntime || current.readOnlyQuestion) return;
    deps.setSubmitting(true);
    deps.setError("");
    const question = current.currentQuestion;
    const runtime = current.practiceRuntime;
    runtime.actor.send({ type: "BEGIN_SUBMIT", questionId: question.id, now: deps.now() });
    const draft = runtime.actor.getSnapshot().context.session.drafts[question.id];
    const durationMs = current.timingEnabled ? draft.elapsed_ms : undefined;
    current.log?.info("answer.submitted", {
      questionId: question.id,
      questionType: question.type,
      selectedOptionIds: normalizeOptionIds(draft.selected_option_ids),
      objectiveCorrect: draft.objective_correct,
      masteryRating: rating,
    });
    void deps.controller.submitAttempt({
      questionId: question.id,
      questionRelation: current.previewBlockIds?.get(question.id),
      sessionId: current.sessionId,
      questionType: question.type,
      optionOrder: current.shuffled.optionOrder,
      selectedOptionIds: draft.selected_option_ids,
      objectiveCorrect: draft.objective_correct,
      masteryRating: rating,
      subjectiveScore: draft.subjective_score,
      durationMs,
    }, current.filter === "due" ? current.dueCards.get(question.id) : undefined).then((result) => {
      if (result.warnings.length > 0) deps.setError(result.warnings.join("; "));
      runtime.actor.send({ type: "SUBMIT_SUCCEEDED", attempt: result.event, now: deps.now() });
    }).catch((reason) => {
      const message = reason instanceof Error ? reason.message : String(reason);
      deps.setError(message);
      runtime.actor.send({ type: "SUBMIT_FAILED", message, now: deps.now() });
    }).finally(() => deps.setSubmitting(false));
  }

  return { toggleOption, revealAnswer, retry, resetQuestionTimer, changeSubjectiveScore, submitRating };
}

import { describe, expect, it, vi } from "vitest";
import type { PracticeSessionRuntime } from "@/question-bank/application";
import type { Question } from "@/question-bank/core/types";
import { createPracticeActions } from "./question-bank-practice-actions";

const question: Question = {
  id: "civil-procedure-gold-2022-2-4-15",
  type: "multiple",
  title: "Question",
  stemMarkdown: "Stem",
  options: [
    { id: "A", markdown: "A" },
    { id: "B", markdown: "B" },
    { id: "C", markdown: "C" },
    { id: "D", markdown: "D" },
  ],
  answer: { kind: "options", optionIds: ["B", "C"] },
  solutionMarkdown: "正确答案：BC。",
  metadata: { topicPath: [] },
};

describe("question bank practice actions", () => {
  it("builds a multi-choice selection from the authoritative draft across rapid option clicks", () => {
    const send = vi.fn((event: { patch?: { selected_option_ids?: string[] } }) => {
      const selected = event.patch?.selected_option_ids;
      if (selected) draft.selected_option_ids = [...selected];
    });
    const draft = { selected_option_ids: [] as string[] };
    const practiceRuntime = {
      actor: {
        getSnapshot: () => ({ context: { session: { drafts: { [question.id]: draft } } } }),
        send,
      },
    } as unknown as PracticeSessionRuntime;
    const actions = createPracticeActions({
      getState: () => ({
        currentQuestion: question,
        shuffled: { optionOrder: ["A", "B", "C", "D"], options: [] },
        practiceRuntime,
        selectedOptionIds: [],
        revealed: false,
        readOnlyQuestion: false,
        submitting: false,
        timingEnabled: true,
        previewBlockIds: undefined,
        sessionId: "session-1",
        filter: "all",
        dueCards: new Map(),
      }),
      now: () => 1000,
      setError: vi.fn(),
      setSubmitting: vi.fn(),
      label: (_key, fallback) => fallback,
      controller: {} as never,
    });

    actions.toggleOption("B");
    actions.toggleOption("C");

    expect(send).toHaveBeenNthCalledWith(2, expect.objectContaining({
      patch: { selected_option_ids: ["B", "C"] },
    }));
  });

  it("grades from the authoritative session draft instead of a stale component selection", () => {
    const send = vi.fn();
    const info = vi.fn();
    const practiceRuntime = {
      actor: {
        getSnapshot: () => ({
          context: {
            session: {
              drafts: {
                [question.id]: { selected_option_ids: ["B", "C"] },
              },
            },
          },
        }),
        send,
      },
    } as unknown as PracticeSessionRuntime;
    const actions = createPracticeActions({
      getState: () => ({
        currentQuestion: question,
        shuffled: { optionOrder: ["A", "B", "C", "D"], options: [] },
        practiceRuntime,
        selectedOptionIds: ["B"],
        revealed: false,
        readOnlyQuestion: false,
        submitting: false,
        timingEnabled: true,
        previewBlockIds: undefined,
        sessionId: "session-1",
        filter: "all",
        dueCards: new Map(),
        log: { debug: vi.fn(), info },
      }),
      now: () => 1000,
      setError: vi.fn(),
      setSubmitting: vi.fn(),
      label: (_key, fallback) => fallback,
      controller: {} as never,
    });

    actions.revealAnswer();

    expect(send).toHaveBeenCalledWith({
      type: "DRAFT_CHANGED",
      questionId: question.id,
      patch: { selected_option_ids: ["B", "C"], revealed: true, objective_correct: true },
      now: 1000,
    });
    expect(info).toHaveBeenCalledWith("answer.graded", expect.objectContaining({
      expectedAnswer: { kind: "options", optionIds: ["B", "C"] },
      selectedOptionIds: ["B", "C"],
      objectiveCorrect: true,
    }));
  });
});

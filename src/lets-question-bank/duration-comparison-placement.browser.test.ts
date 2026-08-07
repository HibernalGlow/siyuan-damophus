import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import type { Question } from "@/question-bank/core/types";
import { normalizeBreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import PracticeHeader from "./PracticeHeader.svelte";
import QuestionBankPractice from "./QuestionBankPractice.svelte";

const question: Question = {
  id: "q-duration-placement",
  type: "single",
  title: "Question",
  stemMarkdown: "Stem",
  options: [{ id: "A", markdown: "Option" }],
  answer: { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "Solution",
  metadata: { topicPath: ["Topic"] },
};

const comparisons = [{
  benchmark: "previous" as const,
  direction: "faster" as const,
  currentDurationMs: 10_000,
  referenceDurationMs: 15_000,
  deltaMs: 5_000,
}];

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

const label = (_key: string, fallback: string) => fallback;
const formatDuration = (milliseconds: number) => `${milliseconds} ms`;

describe("duration comparison placement", () => {
  it("uses a compact row immediately above the rating bar", async () => {
    mounted = mount(QuestionBankPractice, {
      target: document.body,
      props: {
        label,
        currentQuestion: question,
        currentGroup: undefined,
        currentQuestionBlockId: undefined,
        displayedOptions: [],
        selectedOptionIds: [],
        revealed: true,
        objectiveCorrect: true,
        subjectiveScore: undefined,
        currentAttempt: undefined,
        durationComparisons: comparisons,
        durationComparisonPosition: "rating",
        renderedQuestionContent: (markdown: string) => markdown,
        questionTypeLabel: () => "Single choice",
        optionMarkdown: () => "",
        formatDuration,
        toggleOption: vi.fn(),
        changeSubjectiveScore: vi.fn(),
        mountSourceBlock: undefined,
        suggestedRating: undefined,
        resetQuestionTimer: vi.fn(),
        confirmEndPractice: vi.fn(),
        retryPracticeSave: vi.fn(),
        goToQuestion: vi.fn(),
        previousQuestion: vi.fn(),
        nextQuestion: vi.fn(),
        revealAnswer: vi.fn(),
        retry: vi.fn(),
        submitRating: vi.fn(),
      },
    });
    await tick();

    const row = document.querySelector(".rating-duration-row");
    expect(row?.nextElementSibling?.classList.contains("rating-bar")).toBe(true);
    expect(document.querySelector(".answer [data-benchmark]")) .toBeNull();
  });

  it("can place the comparison in the title bar", async () => {
    mounted = mount(PracticeHeader, {
      target: document.body,
      props: {
        currentQuestion: question,
        currentQuestionBlockId: undefined,
        buildRevision: "test",
        label,
        translations: {},
        questionIndex: 0,
        queueLength: 1,
        completedCount: 0,
        timingEnabled: false,
        sessionElapsedMs: 0,
        durationComparisons: comparisons,
        durationComparisonPosition: "header",
        breadcrumbItems: [],
        mobileBreadcrumb: false,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
        submitting: false,
        reviewing: false,
        answerTimerPaused: false,
        timerEffectivelyPaused: false,
        answerCardOpen: false,
        openQuestionSource: vi.fn(),
        previousQuestion: vi.fn(),
        nextQuestion: vi.fn(),
        togglePracticeTimer: vi.fn(),
        exitReview: vi.fn(),
        pausePractice: vi.fn(),
        requestEndPractice: vi.fn(),
        onAnswerCardToggle: vi.fn(),
      },
    });
    await tick();

    expect(document.querySelector(".practice-heading-details [data-benchmark=previous]")).not.toBeNull();
  });
});

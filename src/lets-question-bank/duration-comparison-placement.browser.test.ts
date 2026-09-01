import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import type { Question } from "@/question-bank/core/types";
import { normalizeBreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import PracticeHeader from "./practice/PracticeHeader.svelte";
import QuestionBankPractice from "./practice/QuestionBankPractice.svelte";

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
        questionElapsedMs: 0,
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

  it("can place the reveal action directly below the options", async () => {
    mounted = mount(QuestionBankPractice, {
      target: document.body,
      props: {
        label,
        currentQuestion: question,
        currentGroup: undefined,
        currentQuestionBlockId: undefined,
        displayedOptions: [{ originalId: "A", displayLabel: "A", markdown: "Option" }],
        selectedOptionIds: ["A"],
        revealed: false,
        readOnlyQuestion: false,
        objectiveCorrect: null,
        subjectiveScore: undefined,
        currentAttempt: undefined,
        durationComparisons: [],
        durationComparisonPosition: "rating",
        revealActionBelowOptions: true,
        renderedQuestionContent: (markdown: string) => markdown,
        questionTypeLabel: () => "Single choice",
        optionMarkdown: () => "Option",
        formatDuration,
        toggleOption: vi.fn(),
        changeSubjectiveScore: vi.fn(),
        mountSourceBlock: undefined,
        suggestedRating: undefined,
        resetQuestionTimer: vi.fn(),
        confirmEndPractice: vi.fn(),
        retryPracticeSave: vi.fn(),
        goToQuestion: vi.fn(),
        revealAnswer: vi.fn(),
        retry: vi.fn(),
        submitRating: vi.fn(),
      },
    });
    await tick();

    const inlineAction = document.querySelector(".action-bar--inline");
    expect(inlineAction).not.toBeNull();
    expect(document.querySelectorAll(".action-bar")).toHaveLength(1);
    expect(document.querySelector(".rating-bar")).toBeNull();
    expect(document.querySelector(".options")).not.toBeNull();
  });
});

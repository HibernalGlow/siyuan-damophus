import { mount, tick, unmount } from "svelte";
import { afterEach, describe, expect, it, vi } from "vitest";
import PracticeHeader from "./PracticeHeader.svelte";
import "./question-bank.css";
import { normalizeBreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import type { Question } from "@/question-bank/core/types";

let mounted: ReturnType<typeof mount> | undefined;

afterEach(() => {
  if (mounted) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
});

const question: Question = {
  id: "header-correction-question",
  type: "multiple",
  title: "Question",
  stemMarkdown: "Stem",
  options: [
    { id: "A", markdown: "A" },
    { id: "B", markdown: "B" },
    { id: "C", markdown: "C" },
  ],
  answer: { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "Answer",
  metadata: { topicPath: ["Topic"] },
};

describe("practice header answer correction", () => {
  it("hides the Damophus title by default and keeps breadcrumb items visible and clickable", async () => {
    const openQuestionSource = vi.fn();
    const target = document.createElement("div");
    target.className = "question-bank";
    target.style.width = "640px";
    document.body.append(target);
    mounted = mount(PracticeHeader, {
      target,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        label: (_key: string, fallback: string) => fallback,
        translations: {},
        questionIndex: 0,
        queueLength: 1,
        completedCount: 0,
        timingEnabled: false,
        sessionElapsedMs: 0,
        breadcrumbItems: [
          { id: "document", name: "Civil Procedure", type: "NodeDocument", subType: "" },
          { id: "question", name: "Service of process", type: "NodeHeading", subType: "h1" },
        ],
        currentQuestionBlockId: "question",
        mobileBreadcrumb: true,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
        openQuestionSource,
        submitting: false,
        reviewing: false,
        answerTimerPaused: false,
        timerEffectivelyPaused: false,
        answerCardOpen: false,
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

    expect(target.querySelector(".app-brand")).toBeNull();
    const breadcrumb = target.querySelector<HTMLElement>(".practice-breadcrumb")!;
    expect(breadcrumb.textContent).toContain("Civil Procedure");
    expect(breadcrumb.textContent).toContain("Service of process");
    expect(breadcrumb.getBoundingClientRect().width).toBeGreaterThan(0);
    breadcrumb.querySelector<HTMLElement>('[data-node-id="document"]')?.click();
    expect(openQuestionSource).toHaveBeenCalledWith("document");
  });

  it("opens the correction dialog from the revealed title-bar pencil and saves a changed answer", async () => {
    const onCorrectAnswer = vi.fn();
    const target = document.createElement("div");
    document.body.append(target);
    mounted = mount(PracticeHeader, {
      target,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        label: (_key: string, fallback: string) => fallback,
        translations: {},
        busy: false,
        questionIndex: 0,
        queueLength: 1,
        completedCount: 0,
        timingEnabled: false,
        sessionElapsedMs: 0,
        breadcrumbItems: [],
        currentQuestionBlockId: "20260806120000-header01",
        openQuestionSource: vi.fn(),
        mobileBreadcrumb: false,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
        submitting: false,
        reviewing: false,
        answerTimerPaused: false,
        timerEffectivelyPaused: false,
        answerCardOpen: false,
        previousQuestion: vi.fn(),
        nextQuestion: vi.fn(),
        togglePracticeTimer: vi.fn(),
        exitReview: vi.fn(),
        pausePractice: vi.fn(),
        requestEndPractice: vi.fn(),
        onAnswerCardToggle: vi.fn(),
        revealed: true,
        onCorrectAnswer,
      },
    });

    const pencil = target.querySelector<HTMLButtonElement>("[data-correct-answer]");
    expect(pencil).not.toBeNull();
    pencil?.click();
    await tick();
    expect(target.querySelector('[role="dialog"]')).not.toBeNull();

    target.querySelector<HTMLButtonElement>('[role="dialog"] .correction-options button:nth-child(1)')?.click();
    target.querySelector<HTMLButtonElement>('[role="dialog"] .correction-options button:nth-child(2)')?.click();
    target.querySelector<HTMLButtonElement>('[data-save-corrected-answer]')?.click();
    await tick();
    expect(onCorrectAnswer).toHaveBeenCalledWith({ kind: "options", optionIds: ["B"] });
    expect(target.querySelector('[role="dialog"]')).toBeNull();
  });
});

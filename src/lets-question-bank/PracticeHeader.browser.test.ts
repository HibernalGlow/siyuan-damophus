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
  it("toggles the practice-local source editing lock from the header", async () => {
    const toggleSourceEditingLock = vi.fn();
    mounted = mount(PracticeHeader, {
      target: document.body,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        label: (_key: string, fallback: string) => fallback,
        translations: {},
        questionIndex: 0,
        queueLength: 1,
        timingEnabled: false,
        breadcrumbItems: [],
        currentQuestionBlockId: "20260808120000-lock001",
        openQuestionSource: vi.fn(),
        mobileBreadcrumb: true,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
        sourceEditingAvailable: true,
        sourceEditingLocked: true,
        toggleSourceEditingLock,
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

    const lock = document.querySelector<HTMLButtonElement>("[data-source-editing-lock]");
    expect(lock?.getAttribute("aria-pressed")).toBe("true");
    expect(lock?.getAttribute("aria-label")).toBe("Unlock source editing");
    lock?.click();
    expect(toggleSourceEditingLock).toHaveBeenCalledOnce();
  });

  it("moves low-frequency controls into an overflow menu when the header is narrow", async () => {
    const openQuestionSource = vi.fn();
    const toggleSourceEditingLock = vi.fn();
    const toggleStemStyles = vi.fn();
    const toggleIndefinitePracticeMode = vi.fn();
    const target = document.createElement("div");
    target.className = "question-bank";
    target.style.width = "600px";
    document.body.append(target);
    const togglePauseOnBlur = vi.fn();
    mounted = mount(PracticeHeader, {
      target,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        label: (_key: string, fallback: string) => fallback,
        translations: {},
        questionIndex: 0,
        queueLength: 1,
        timingEnabled: false,
        breadcrumbItems: [],
        currentQuestionBlockId: "20260808120000-menu001",
        openQuestionSource,
        mobileBreadcrumb: false,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
        sourceEditingAvailable: true,
        sourceEditingLocked: true,
        toggleSourceEditingLock,
        showStemStyles: false,
        toggleStemStyles,
        indefinitePracticeMode: false,
        toggleIndefinitePracticeMode,
        pauseOnBlur: false,
        togglePauseOnBlur,
        previousQuestion: vi.fn(),
        nextQuestion: vi.fn(),
        togglePracticeTimer: vi.fn(),
        exitReview: vi.fn(),
        pausePractice: vi.fn(),
        requestEndPractice: vi.fn(),
        onAnswerCardToggle: vi.fn(),
        revealed: true,
        onCorrectAnswer: vi.fn(),
      },
    });
    await tick();

    const directLocate = target.querySelector<HTMLElement>("[data-open-question-source]")!;
    const overflow = target.querySelector<HTMLButtonElement>("[data-practice-overflow-trigger]")!;
    expect(getComputedStyle(directLocate).display).toBe("none");
    expect(getComputedStyle(overflow).display).not.toBe("none");
    overflow.click();
    await tick();
    const menu = target.querySelector<HTMLElement>('[role="menu"]');
    const indefiniteMode = menu?.querySelector<HTMLButtonElement>("[data-toggle-indefinite-practice-mode]");
    expect(indefiniteMode?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(indefiniteMode?.getAttribute("aria-checked")).toBe("false");
    expect(indefiniteMode?.textContent).toContain("Indefinite practice mode");
    const stemStyles = menu?.querySelector<HTMLButtonElement>("[data-toggle-stem-styles]");
    expect(stemStyles?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(stemStyles?.getAttribute("aria-checked")).toBe("false");
    expect(stemStyles?.textContent).toContain("Show question stem styles");
    const pauseOnBlurItem = menu?.querySelector<HTMLButtonElement>("[data-toggle-pause-on-blur]");
    expect(pauseOnBlurItem?.getAttribute("role")).toBe("menuitemcheckbox");
    expect(pauseOnBlurItem?.getAttribute("aria-checked")).toBe("false");
    expect(pauseOnBlurItem?.textContent).toContain("Pause timer on blur");
    expect(menu?.textContent).toContain("Open source in SiYuan");
    expect(menu?.textContent).toContain("Unlock source editing");
    expect(menu?.textContent).toContain("Correct answer");
    [...menu!.querySelectorAll<HTMLButtonElement>('button')]
      .find((button) => button.textContent?.includes("Open source in SiYuan"))
      ?.click();
    await tick();
    expect(openQuestionSource).toHaveBeenCalledWith("20260808120000-menu001");
    expect(target.querySelector('[role="menu"]')).toBeNull();

    overflow.click();
    await tick();
    target.querySelector<HTMLButtonElement>("[data-toggle-stem-styles]")?.click();
    await tick();
    expect(toggleStemStyles).toHaveBeenCalledOnce();
    expect(target.querySelector('[role="menu"]')).toBeNull();

    overflow.click();
    await tick();
    target.querySelector<HTMLButtonElement>("[data-toggle-indefinite-practice-mode]")?.click();
    await tick();
    expect(toggleIndefinitePracticeMode).toHaveBeenCalledOnce();
    expect(target.querySelector('[role="menu"]')).toBeNull();

    overflow.click();
    await tick();
    target.querySelector<HTMLButtonElement>("[data-toggle-pause-on-blur]")?.click();
    await tick();
    expect(togglePauseOnBlur).toHaveBeenCalledOnce();
    expect(target.querySelector('[role="menu"]')).toBeNull();
  });

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
        questionElapsedMs: 0,
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
    expect(breadcrumb.textContent).toContain("/");
    expect(breadcrumb.querySelectorAll(".protyle-breadcrumb__arrow")).toHaveLength(0);
    expect(breadcrumb.getBoundingClientRect().width).toBeGreaterThan(0);
    breadcrumb.querySelector<HTMLElement>('[data-node-id="document"]')?.click();
    expect(openQuestionSource).toHaveBeenCalledWith("document");
  });

  it("keeps the stem style switch reachable in the desktop overflow menu", async () => {
    const target = document.createElement("div");
    target.className = "question-bank";
    target.style.width = "1100px";
    document.body.append(target);
    mounted = mount(PracticeHeader, {
      target,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        label: (_key: string, fallback: string) => fallback,
        questionIndex: 0,
        queueLength: 1,
        timingEnabled: false,
        breadcrumbItems: [],
        currentQuestionBlockId: "20260808120000-desktop1",
        openQuestionSource: vi.fn(),
        mobileBreadcrumb: false,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
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

    const overflow = target.querySelector<HTMLButtonElement>("[data-practice-overflow-trigger]")!;
    expect(getComputedStyle(overflow).display).not.toBe("none");
    overflow.click();
    await tick();
    expect(getComputedStyle(target.querySelector<HTMLElement>("[data-toggle-stem-styles]")!).display).not.toBe("none");
    expect(getComputedStyle(target.querySelector<HTMLElement>(".practice-overflow-compact-action")!).display).toBe("none");
  });

  it("keeps compact progress beside the timer instead of creating an empty row", async () => {
    const target = document.createElement("div");
    target.className = "question-bank";
    target.style.width = "600px";
    document.body.append(target);
    mounted = mount(PracticeHeader, {
      target,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        label: (_key: string, fallback: string) => fallback,
        translations: {},
        questionIndex: 0,
        queueLength: 7,
        completedCount: 1,
        timingEnabled: true,
        questionElapsedMs: 2_000,
        breadcrumbItems: [],
        showPracticeBreadcrumb: false,
        currentQuestionBlockId: "20260806120000-compact01",
        openQuestionSource: vi.fn(),
        mobileBreadcrumb: false,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
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

    const toolbar = target.querySelector<HTMLElement>(".practice-toolbar");
    const timer = target.querySelector<HTMLElement>(".timer");
    const progress = target.querySelector<HTMLElement>(".progress-copy");
    expect(toolbar).not.toBeNull();
    expect(timer).not.toBeNull();
    expect(progress).not.toBeNull();
    expect(Math.abs(timer!.getBoundingClientRect().top - progress!.getBoundingClientRect().top)).toBeLessThanOrEqual(1);
    expect(toolbar!.getBoundingClientRect().height).toBeLessThanOrEqual(50);
  });

  it("hides only the practice breadcrumb when its display setting is disabled", async () => {
    mounted = mount(PracticeHeader, {
      target: document.body,
      props: {
        currentQuestion: question,
        buildRevision: "test",
        showPracticeBreadcrumb: false,
        label: (_key: string, fallback: string) => fallback,
        translations: {},
        questionIndex: 0,
        queueLength: 1,
        timingEnabled: false,
        breadcrumbItems: [{ id: "document", name: "Civil Procedure", type: "NodeDocument", subType: "" }],
        currentQuestionBlockId: "question",
        openQuestionSource: vi.fn(),
        mobileBreadcrumb: false,
        breadcrumbPriority: "tail",
        breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
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

    expect(document.querySelector(".practice-breadcrumb")).toBeNull();
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
        questionElapsedMs: 0,
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

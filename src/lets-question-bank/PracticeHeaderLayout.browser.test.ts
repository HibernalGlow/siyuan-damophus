import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import { normalizeBreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import type { Question } from "@/question-bank/core/types";
import PracticeHeader from "./practice/PracticeHeader.svelte";
import "./question-bank.css";

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  await page.viewport(1024, 768);
});

function props(overrides: Record<string, unknown> = {}) {
  return {
    currentQuestion: undefined,
    buildRevision: "test",
    showPracticeTitle: false,
    label: (_key: string, fallback: string) => fallback,
    translations: {},
    breadcrumbTextDisplay: normalizeBreadcrumbTextDisplay("full", 16, 160),
    currentQuestionBlockId: undefined,
    openQuestionSource: undefined,
    previousQuestion: vi.fn(),
    nextQuestion: vi.fn(),
    togglePracticeTimer: vi.fn(),
    exitReview: vi.fn(),
    pausePractice: vi.fn(),
    requestEndPractice: vi.fn(),
    onAnswerCardToggle: vi.fn(),
    ...overrides,
  };
}

const question: Question = {
  id: "q-type-tag",
  type: "multiple",
  title: "Type tag question",
  stemMarkdown: "Stem",
  options: [{ id: "A", markdown: "Alpha" }, { id: "B", markdown: "Beta" }],
  answer: { kind: "options", optionIds: ["A", "B"] },
  solutionMarkdown: "Solution",
  metadata: { topicPath: ["Root"] },
};

const withTypeLabel = { currentQuestion: question, questionTypeLabel: () => "Multiple choice" };

describe("PracticeHeader non-practice layout", () => {
  it("does not reserve an empty header in the dock", async () => {
    mounted = mount(PracticeHeader, { target: document.body, props: props() });
    await tick();
    expect(document.querySelector(".app-header")).toBeNull();
  });

  it("does not reserve a separate close header in a standalone dialog", async () => {
    mounted = mount(PracticeHeader, { target: document.body, props: props({ onClose: vi.fn() }) });
    await tick();
    expect(document.querySelector(".app-header")).toBeNull();
  });
});

describe("PracticeHeader question-type tag", () => {
  it("renders the localized type tag inline in the top status row on desktop", async () => {
    const target = document.createElement("div");
    target.className = "question-bank";
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(PracticeHeader, { target, props: props(withTypeLabel) });
    await tick();

    const badge = document.querySelector<HTMLElement>("[data-question-type='multiple']");
    expect(badge?.textContent?.trim()).toBe("Multiple choice");
    expect(badge?.closest(".practice-status")).not.toBeNull();
    expect(badge && getComputedStyle(badge).display).not.toBe("none");
    await unmount(mounted);
    mounted = undefined;
    document.body.innerHTML = "";
  });

  it("hides the tag entirely in indefinite practice mode", async () => {
    mounted = mount(PracticeHeader, {
      target: document.body,
      props: props({ ...withTypeLabel, indefinitePracticeMode: true }),
    });
    await tick();
    expect(document.querySelector("[data-question-type]")).toBeNull();
  });

  it("drops the top-bar tag inside a narrow container; the bottom bar takes over", async () => {
    const target = document.createElement("div");
    target.className = "question-bank";
    target.style.height = "100vh";
    document.body.appendChild(target);
    await page.viewport(600, 800);
    mounted = mount(PracticeHeader, { target, props: props(withTypeLabel) });
    await tick();

    const badge = document.querySelector<HTMLElement>(".practice-status [data-question-type]");
    expect(badge && getComputedStyle(badge).display).toBe("none");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import { normalizeBreadcrumbTextDisplay } from "@/lets-mobile-breadcrumb/breadcrumb-scroll";
import PracticeHeader from "./PracticeHeader.svelte";
import "./question-bank.css";

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
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

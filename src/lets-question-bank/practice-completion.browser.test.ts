import { mount, tick, unmount } from "svelte";
import { page } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";
import "@/styles/damophus.css";
import type { AttemptEvent, Question } from "@/question-bank/core/types";
import PracticeCompletion from "./practice/PracticeCompletion.svelte";

const questions: Question[] = Array.from({ length: 20 }, (_, index) => ({
  id: `question-${index + 1}`,
  type: index === 2 ? "subjective" : "single",
  title: `Question ${index + 53}`,
  stemMarkdown: "",
  options: [{ id: "A", markdown: "Alpha" }, { id: "B", markdown: "Beta" }],
  answer: index === 2 ? undefined : { kind: "options", optionIds: ["A"] },
  solutionMarkdown: "",
  metadata: { topicPath: [] },
}));

const attempts: AttemptEvent[] = questions.map((question, index) => ({
  schema_version: 1,
  attempt_id: `attempt-${index + 1}`,
  question_id: question.id,
  session_id: "session-1",
  answered_at: `2026-08-24T10:${String(index).padStart(2, "0")}:00.000Z`,
  question_type: question.type,
  option_order: question.options.map((option) => option.id),
  selected_option_ids: question.type === "subjective" ? [] : [index % 3 === 0 ? "B" : "A"],
  objective_correct: question.type === "subjective" ? null : index % 3 !== 0,
  mastery_rating: (["again", "hard", "good", "easy"] as const)[index % 4],
  subjective_score: question.type === "subjective" ? 4 : undefined,
  duration_ms: (index + 1) * 1_000,
}));

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
  await page.viewport(1024, 768);
});

function render(overrides: Record<string, unknown> = {}) {
  const target = document.createElement("div");
  target.className = "damophus-theme-root damophus-question-bank-theme";
  target.style.height = "100vh";
  target.style.containerType = "inline-size";
  document.body.appendChild(target);
  const goToQuestion = vi.fn();
  component = mount(PracticeCompletion, {
    target,
    props: {
      label: (_key: string, fallback: string) => fallback,
      queue: questions,
      attempts,
      submittedCount: attempts.length,
      correctCount: attempts.filter((attempt) => attempt.objective_correct === true).length,
      completionDurationMs: attempts.reduce((total, attempt) => total + (attempt.duration_ms ?? 0), 0),
      touchedDrafts: 0,
      formatDuration: (milliseconds: number) => `${Math.round(milliseconds / 1_000)}s`,
      goToQuestion,
      resetPractice: vi.fn(),
      ...overrides,
    },
  });
  return { target, goToQuestion };
}

describe("practice completion", () => {
  it("renders session visuals and a compact two-column question review on desktop", async () => {
    await page.viewport(1180, 820);
    const { target, goToQuestion } = render();
    await tick();

    expect(target.textContent).toContain("Accuracy");
    expect(target.textContent).toContain("Rating distribution");
    expect(target.textContent).toContain("Your answer: B");
    expect(target.querySelectorAll(".completion-question")).toHaveLength(20);
    expect(getComputedStyle(target.querySelector(".completion-question-grid")!).gridTemplateColumns.split(" ")).toHaveLength(2);
    expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);

    target.querySelectorAll<HTMLButtonElement>(".completion-question")[4]?.click();
    expect(goToQuestion).toHaveBeenCalledWith(4);
  });

  it("collapses to one question column on mobile without horizontal overflow", async () => {
    await page.viewport(390, 720);
    const { target } = render({ showAnsweredAt: true });
    await tick();

    expect(getComputedStyle(target.querySelector(".completion-question-grid")!).gridTemplateColumns.split(" ")).toHaveLength(1);
    expect(target.scrollWidth).toBeLessThanOrEqual(target.clientWidth);
    expect(target.querySelector("time")).not.toBeNull();
  });

  it("respects completion field visibility settings", async () => {
    const { target } = render({
      showCorrectness: false,
      showRating: false,
      showDuration: false,
      showAnswer: false,
      showAnsweredAt: false,
    });
    await tick();

    expect(target.textContent).not.toContain("Accuracy");
    expect(target.textContent).not.toContain("Rating distribution");
    expect(target.textContent).not.toContain("Your answer");
    expect(target.querySelector(".question-metadata")?.textContent?.trim()).toBe("");
    expect(target.querySelector("time")).toBeNull();
  });
});

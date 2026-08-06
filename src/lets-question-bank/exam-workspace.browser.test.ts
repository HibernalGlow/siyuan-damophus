import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, tick, unmount } from "svelte";
import type { Question } from "@/question-bank/core/types";
import "@/styles/damophus.css";
import ExamWorkspace from "./ExamWorkspace.svelte";
import type { QuestionBankUiController } from "./controller";

const questions: Question[] = [
  {
    id: "single-1",
    type: "single",
    title: "Single",
    stemMarkdown: "Choose one",
    options: [{ id: "A", markdown: "Alpha" }, { id: "B", markdown: "Beta" }],
    answer: { kind: "options", optionIds: ["A"] },
    solutionMarkdown: "Single solution",
    metadata: { topicPath: ["Civil"] },
  },
  {
    id: "multiple-1",
    type: "multiple",
    title: "Multiple",
    stemMarkdown: "Choose all",
    options: [{ id: "A", markdown: "First" }, { id: "B", markdown: "Second" }, { id: "C", markdown: "Third" }],
    answer: { kind: "options", optionIds: ["A", "C"] },
    solutionMarkdown: "Multiple solution",
    metadata: { topicPath: ["Civil"] },
  },
];

let component: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (component) await unmount(component);
  component = undefined;
  document.body.innerHTML = "";
});

function mockController() {
  const submittedAttempts: unknown[] = [];
  const submittedEvents: unknown[] = [];
  const controller = {
    loadExamSession: vi.fn(async () => undefined),
    saveExamSession: vi.fn(async () => undefined),
    removeExamSession: vi.fn(async () => undefined),
    submitExamAttempt: vi.fn(async (event) => {
      submittedAttempts.push(event);
      return "created" as const;
    }),
    submitExamEvent: vi.fn(async (event) => {
      submittedEvents.push(event);
      return "created" as const;
    }),
  } as unknown as QuestionBankUiController;
  return { controller, submittedAttempts, submittedEvents };
}

describe("exam workspace", () => {
  it("submits one immutable row per question and one exam summary", async () => {
    const { controller, submittedAttempts, submittedEvents } = mockController();
    component = mount(ExamWorkspace, {
      target: document.body,
      props: {
        controller,
        questions,
        sourceKey: "doc-1",
        sourceLabel: "Civil exam",
        uuid: () => "exam-1",
        random: () => 0.5,
      },
    });
    await tick();
    document.querySelector<HTMLButtonElement>(".exam-actions button")?.click();
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".exam-options button")]
      .find((button) => button.textContent?.includes("Alpha"))?.click();
    document.querySelectorAll<HTMLButtonElement>(".exam-question-nav button")[1]?.click();
    await tick();
    for (const text of ["First", "Third"]) {
      [...document.querySelectorAll<HTMLButtonElement>(".exam-options button")]
        .find((button) => button.textContent?.includes(text))?.click();
      await tick();
    }
    [...document.querySelectorAll<HTMLButtonElement>(".exam-footer button")]
      .find((button) => button.textContent?.includes("Submit exam"))?.click();
    await vi.waitFor(() => expect(submittedEvents).toHaveLength(1));

    expect(submittedAttempts).toHaveLength(2);
    expect(submittedAttempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ attempt_id: "exam:exam-1:single-1", session_mode: "exam" }),
      expect.objectContaining({ attempt_id: "exam:exam-1:multiple-1", session_mode: "exam" }),
    ]));
    expect(submittedEvents[0]).toEqual(expect.objectContaining({
      event_kind: "exam_submitted",
      session_id: "exam-1",
      exam_score: 3,
      exam_max_score: 3,
    }));
    expect(document.querySelector(".exam-score")?.textContent).toContain("100.0%");
  });

  it("marks a revealed answer as assisted and awards zero", async () => {
    const { controller, submittedEvents } = mockController();
    component = mount(ExamWorkspace, {
      target: document.body,
      props: { controller, questions: [questions[0]], sourceKey: "doc-1", uuid: () => "exam-2" },
    });
    await tick();
    document.querySelectorAll<HTMLInputElement>('.exam-check input[type="checkbox"]')[0]?.click();
    document.querySelector<HTMLButtonElement>(".exam-actions button")?.click();
    await tick();
    [...document.querySelectorAll<HTMLButtonElement>(".exam-options button")]
      .find((button) => button.textContent?.includes("Alpha"))?.click();
    [...document.querySelectorAll<HTMLButtonElement>(".exam-footer button")]
      .find((button) => button.textContent?.includes("Reveal"))?.click();
    await tick();
    expect(document.querySelector(".exam-solution")?.textContent).toContain("Single solution");
    [...document.querySelectorAll<HTMLButtonElement>(".exam-footer button")]
      .find((button) => button.textContent?.includes("Submit exam"))?.click();
    await vi.waitFor(() => expect(submittedEvents).toHaveLength(1));
    expect(submittedEvents[0]).toEqual(expect.objectContaining({ exam_score: 0, exam_max_score: 1 }));
  });
});

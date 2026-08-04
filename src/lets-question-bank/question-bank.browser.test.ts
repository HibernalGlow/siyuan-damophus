import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import type { AttemptEvent, Question, TopicNode } from "@/question-bank/core/types";
import type { QuestionIndexPreview } from "@/question-bank/application";
import type {
  QuestionBankBinding,
  QuestionBankInitializationPreview,
} from "@/question-bank/adapters/siyuan";
import { QUICK_RIFF_DECK_ID, type RiffCard } from "@/question-bank/adapters/siyuan/riff";
import QuestionBank from "./question-bank.svelte";
import type { QuestionBankUiController, RecentScope } from "./controller";

const documentId = "20260804120000-abcdefg";
const blockId = "20260804120001-abcdefg";

const topics: TopicNode[] = [
  { id: "root", title: "Root topic", level: 2, childIds: ["child"], explicit: true },
  { id: "child", title: "Child topic", level: 3, parentId: "root", childIds: [], explicit: true },
];

const objectiveQuestion: Question = {
  id: "q-objective",
  type: "multiple",
  title: "Objective question",
  stemMarkdown: "Select the correct options.",
  options: [
    { id: "A", markdown: "Alpha" },
    { id: "B", markdown: "Beta" },
    { id: "C", markdown: "Gamma" },
  ],
  answer: { kind: "options", optionIds: ["A", "C"] },
  solutionMarkdown: "**Answer:** A and C",
  metadata: { topicId: "child", topicPath: ["Root topic", "Child topic"] },
};

const subjectiveQuestion: Question = {
  id: "q-subjective",
  type: "subjective",
  title: "Subjective question",
  stemMarkdown: "Explain the rule.",
  options: [],
  solutionMarkdown: "Reference answer.",
  metadata: { topicId: "root", topicPath: ["Root topic"] },
};

const dueCard: RiffCard = {
  deckID: QUICK_RIFF_DECK_ID,
  cardID: "card-1",
  blockID: blockId,
  lapses: 0,
  reps: 1,
  state: 2,
  lastReview: 1785825600000,
  nextDues: { "1": "1 minute", "2": "6 minutes", "3": "1 day", "4": "4 days" },
};

function makePreview(questions: Question[] = [objectiveQuestion, subjectiveQuestion]): QuestionIndexPreview {
  return {
    token: "preview-token",
    generatedAt: "2026-08-04T12:00:00.000Z",
    documentId,
    scan: {
      documentId,
      kramdown: "",
      report: {
        document: { questions, topics, groups: [] },
        inferences: [],
        conflicts: [],
        issues: [],
      },
      blockIdsByQuestionId: new Map(questions.map((question) => [question.id, blockId])),
      sourceIssues: [],
    },
    actions: questions.map((question) => ({ kind: "add" as const, question, blockId })),
    staleQuestionIds: [],
    blockers: [],
  };
}

function initializationPreview(): QuestionBankInitializationPreview {
  return {
    token: "init-token",
    notebookId: "20260804110000-abcdefg",
    path: "/Damophus",
    questionBlockId: "20260804110001-abcdefg",
    questionAvId: "20260804110002-abcdefg",
    attemptBlockId: "20260804110003-abcdefg",
    attemptAvId: "20260804110004-abcdefg",
    questionColumns: [],
    attemptColumns: [],
  };
}

function binding(): QuestionBankBinding {
  return { schemaVersion: 1 } as QuestionBankBinding;
}

function attempt(input: Parameters<QuestionBankUiController["submitAttempt"]>[0]): AttemptEvent {
  return {
    schema_version: 1,
    attempt_id: "attempt-1",
    question_id: input.questionId,
    question_relation: input.questionRelation,
    session_id: input.sessionId,
    answered_at: "2026-08-04T12:00:00.000Z",
    question_type: input.questionType,
    option_order: input.optionOrder ?? [],
    selected_option_ids: input.selectedOptionIds ?? [],
    objective_correct: input.objectiveCorrect,
    mastery_rating: input.masteryRating,
    subjective_score: input.subjectiveScore,
    duration_ms: input.durationMs,
  };
}

function mockController(options: {
  initialized?: boolean;
  preview?: QuestionIndexPreview;
  dueCards?: ReadonlyMap<string, RiffCard>;
} = {}) {
  let currentBinding = options.initialized === false ? undefined : binding();
  let recent: RecentScope | undefined;
  const preview = options.preview ?? makePreview();
  const submitAttempt = vi.fn(async (
    input: Parameters<QuestionBankUiController["submitAttempt"]>[0],
    _dueCard?: RiffCard,
  ) => ({
    event: attempt(input),
    warnings: [],
  }));
  const saveRecentScope = vi.fn((scope: RecentScope) => { recent = scope; });
  const previewImport = vi.fn(async () => ({
    token: "import-token",
    schemaVersion: 1 as const,
    pluginVersion: "0.25.3",
    total: 3,
    importable: 1,
    duplicateAttemptIds: ["duplicate-1"],
    orphanQuestionIds: ["missing-question"],
    existingRowIssues: [],
  }));
  const confirmImport = vi.fn(async () => ({
    ...(await previewImport()),
    imported: 1,
    failures: [],
  }));
  const controller: QuestionBankUiController = {
    getBinding: () => currentBinding,
    previewInitialization: vi.fn(async () => initializationPreview()),
    confirmInitialization: vi.fn(async () => {
      currentBinding = binding();
      return currentBinding;
    }),
    previewSync: vi.fn(async () => preview),
    confirmSync: vi.fn(async () => preview),
    loadAggregates: vi.fn(async () => new Map([
      [objectiveQuestion.id, {
        questionId: objectiveQuestion.id,
        attempts: 1,
        objectiveAttempts: 1,
        objectiveCorrect: 0,
        objectiveIncorrect: 1,
        consecutiveReviewCount: 2,
      }],
    ])),
    loadDueCards: vi.fn(async () => options.dueCards ?? new Map()),
    exportAttempts: vi.fn(async () => "{}\n"),
    previewImport,
    confirmImport,
    submitAttempt,
    getRecentScope: () => recent,
    saveRecentScope,
  };
  return { controller, submitAttempt, saveRecentScope, previewImport, confirmImport };
}

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  await page.viewport(1024, 768);
});

function render(controller: QuestionBankUiController, props: Record<string, unknown> = {}): void {
  const target = document.createElement("div");
  target.style.height = "100vh";
  document.body.appendChild(target);
  mounted = mount(QuestionBank, {
    target,
    props: {
      controller,
      initialDocumentId: documentId,
      translations: {},
      uuid: () => "session-1",
      ...props,
    },
  });
}

async function flush(): Promise<void> {
  await Promise.resolve();
  await tick();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await tick();
}

function button(name: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button")]
    .find((item) => item.textContent?.trim() === name || item.getAttribute("aria-label") === name);
  if (!result) throw new Error(`Missing button '${name}'`);
  return result;
}

function option(name: string): HTMLButtonElement {
  const result = [...document.querySelectorAll<HTMLButtonElement>("button.option")]
    .find((item) => item.textContent?.includes(name));
  if (!result) throw new Error(`Missing option '${name}'`);
  return result;
}

async function scan(): Promise<void> {
  button("Scan document").click();
  await flush();
}

describe("question bank browser flow", () => {
  it("previews initialization, scans, and confirms index synchronization", async () => {
    const { controller } = mockController({ initialized: false });
    render(controller);
    button("Preview initialization").click();
    await flush();
    expect(document.body.textContent).toContain("System document and databases are ready to create");
    button("Create system document").click();
    await flush();
    await scan();
    expect(document.querySelector(".scan-summary")).not.toBeNull();
    button("Confirm index sync").click();
    await flush();
    expect(document.body.textContent).toContain("Question index synchronized");
    expect(controller.confirmSync).toHaveBeenCalledWith(documentId, "preview-token");
  });

  it("applies scope and filters and creates a random practice queue", async () => {
    const { controller, saveRecentScope } = mockController();
    render(controller, { random: () => 0 });
    await scan();
    const scope = document.querySelector<HTMLSelectElement>("select");
    if (!scope) throw new Error("Missing scope select");
    scope.value = "root";
    scope.dispatchEvent(new Event("change", { bubbles: true }));
    button("Random").click();
    button("all").click();
    button("Start practice").click();
    await flush();
    expect(document.body.textContent).toContain("Subjective question");
    expect(saveRecentScope).toHaveBeenCalledWith({ documentId, topicId: "root" });
  });

  it("restores source option order, undoes without writing, and submits once", async () => {
    const { controller, submitAttempt } = mockController({ preview: makePreview([objectiveQuestion]) });
    const values = [0, 0];
    render(controller, { random: () => values.shift() ?? 0 });
    await scan();
    button("Start practice").click();
    await flush();
    const before = [...document.querySelectorAll("button.option")].map((item) => item.textContent?.trim());
    expect(before.join(" ")).toMatch(/Beta.*Gamma.*Alpha/);
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    const after = [...document.querySelectorAll("button.option")].map((item) => item.textContent?.trim());
    expect(after.join(" ")).toMatch(/Alpha.*Beta.*Gamma/);
    button("Undo and retry").click();
    await flush();
    expect(submitAttempt).not.toHaveBeenCalled();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();
    expect(submitAttempt).toHaveBeenCalledTimes(1);
    expect(submitAttempt.mock.calls[0][0]).toMatchObject({
      questionId: objectiveQuestion.id,
      selectedOptionIds: ["A", "C"],
      objectiveCorrect: true,
      masteryRating: "good",
    });
  });

  it("records subjective self-rating independently from objective correctness", async () => {
    const { controller, submitAttempt } = mockController({ preview: makePreview([subjectiveQuestion]) });
    render(controller);
    await scan();
    button("Start practice").click();
    await flush();
    button("Reveal answer").click();
    await flush();
    const score = document.querySelector<HTMLInputElement>('input[type="number"]');
    if (!score) throw new Error("Missing self score input");
    score.value = "82";
    score.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    button("easy").click();
    await flush();
    expect(submitAttempt.mock.calls[0][0]).toMatchObject({
      questionId: subjectiveQuestion.id,
      objectiveCorrect: null,
      subjectiveScore: 82,
      masteryRating: "easy",
    });
  });

  it("submits mapped Riff cards when practicing the due filter", async () => {
    const { controller, submitAttempt } = mockController({
      preview: makePreview([objectiveQuestion]),
      dueCards: new Map([[objectiveQuestion.id, dueCard]]),
    });
    render(controller);
    await scan();
    button("due").click();
    button("Start practice").click();
    await flush();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();
    expect(submitAttempt.mock.calls[0][1]).toEqual(dueCard);
  });

  it("previews attempt imports before confirming writes", async () => {
    const { controller, previewImport, confirmImport } = mockController();
    render(controller);
    const input = document.querySelector<HTMLInputElement>(".file-input");
    if (!input) throw new Error("Missing import input");
    const file = new File(["{}"], "attempts.json", { type: "application/json" });
    Object.defineProperty(input, "files", { value: [file], configurable: true });
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(previewImport).toHaveBeenCalledWith("{}"));
    await flush();
    expect(document.body.textContent).toContain("missing-question");
    button("Confirm import").click();
    await flush();
    expect(confirmImport).toHaveBeenCalledWith("{}", "import-token");
    expect(document.body.textContent).toContain("Imported");
  });

  it("keeps mobile practice controls inside the viewport without overlap", async () => {
    await page.viewport(390, 844);
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller);
    await scan();
    button("Start practice").click();
    await flush();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    const controls = [...document.querySelectorAll<HTMLButtonElement>(".rating-bar button")];
    const rects = controls.map((control) => control.getBoundingClientRect());
    expect(controls).toHaveLength(5);
    for (const rect of rects) {
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(390);
      expect(rect.width).toBeGreaterThan(0);
    }
    for (let index = 1; index < rects.length; index += 1) {
      expect(rects[index - 1].right).toBeLessThanOrEqual(rects[index].left);
    }
  });
});

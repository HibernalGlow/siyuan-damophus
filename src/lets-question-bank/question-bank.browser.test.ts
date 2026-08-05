import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import "@/styles/damophus.css";
import type { AttemptEvent, Question, TopicNode } from "@/question-bank/core/types";
import type { QuestionIndexPreview } from "@/question-bank/application";
import type {
  QuestionBankBinding,
  QuestionBankInitializationPreview,
  QuestionBankRebindingPreview,
} from "@/question-bank/adapters/siyuan";
import { QUICK_RIFF_DECK_ID, type RiffCard } from "@/question-bank/adapters/siyuan/riff";
import QuestionBank from "./question-bank.svelte";
import type { QuestionBankUiController, RecentScope } from "./controller";

const documentId = "20260804120000-abcdefg";
const blockId = "20260804120001-abcdefg";
const systemDocumentId = "20260804110000-system1";

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

const indefiniteQuestion: Question = {
  ...objectiveQuestion,
  id: "q-indefinite",
  type: "indefinite",
  title: "Indefinite question",
  answer: { kind: "options", optionIds: ["A"] },
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
        ialUpdates: [],
      },
      blockIdsByQuestionId: new Map(questions.map((question) => [question.id, blockId])),
      topicBlockIdsByTopicId: new Map([
        ["root", "20260804120002-abcdefg"],
        ["child", "20260804120003-abcdefg"],
      ]),
      ialWriteActions: [],
      sourceIssues: [],
    },
    actions: questions.map((question) => ({ kind: "add" as const, question, blockId })),
    staleQuestionIds: [],
    blockers: [],
    bindingRepairs: [],
    ialWriteActions: [],
    results: [],
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
  return { schemaVersion: 2 } as unknown as QuestionBankBinding;
}

function rebindingPreview(): QuestionBankRebindingPreview {
  return { token: "rebind-token", systemDocumentId, binding: binding(), bindingRepairs: [] };
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
  recent?: RecentScope;
} = {}) {
  let currentBinding = options.initialized === false ? undefined : binding();
  let recent = options.recent;
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
    previewRebinding: vi.fn(async () => rebindingPreview()),
    confirmRebinding: vi.fn(async () => {
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
        consecutiveAgainCount: 2,
        consecutiveHardCount: 0,
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
  vi.restoreAllMocks();
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

async function selectScope(name: string): Promise<void> {
  await page.getByRole("button", { name: "Entire document", exact: true }).click();
  await page.getByRole("option", { name, exact: true }).click();
  await flush();
}

async function scan(): Promise<void> {
  button("Scan document").click();
  await flush();
}

async function scanAndSync(): Promise<void> {
  await scan();
  button("Confirm index sync").click();
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
    expect(document.body.textContent).toContain("Index changes detected; synchronization is required");
    button("Confirm index sync").click();
    await flush();
    expect(document.body.textContent).toContain("Question index synchronized");
    expect(controller.confirmSync).toHaveBeenCalledWith(documentId, "preview-token");
  });

  it("shows that the index is current when a scan has no pending writes", async () => {
    const currentPreview = makePreview([objectiveQuestion]);
    currentPreview.actions = [];
    const { controller } = mockController({ preview: currentPreview });
    render(controller);

    await scan();

    const current = button("Index is up to date");
    expect(current.disabled).toBe(true);
    expect(document.body.textContent).not.toContain("Index changes detected");
  });

  it("reconnects an existing Damophus system document after preview", async () => {
    const { controller } = mockController({ initialized: false });
    render(controller);
    const input = document.querySelector<HTMLInputElement>("#system-document-id");
    if (!input) throw new Error("Missing system document input");
    input.value = systemDocumentId;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    button("Preview reconnection").click();
    await flush();
    expect(document.body.textContent).toContain("Question index and attempt log are ready to reconnect");
    button("Reconnect").click();
    await flush();
    expect(controller.confirmRebinding).toHaveBeenCalledWith(systemDocumentId, "rebind-token");
    expect(document.querySelector(".workspace")).not.toBeNull();
  });

  it("applies scope and filters and creates a random practice queue", async () => {
    const { controller, saveRecentScope } = mockController();
    render(controller, { random: () => 0 });
    await scanAndSync();
    expect(document.querySelector('[data-slot="select-trigger"]')).not.toBeNull();
    expect(document.querySelectorAll('[data-slot="toggle-group"]')).toHaveLength(2);
    await selectScope("Root topic");
    button("Random").click();
    button("all").click();
    button("Start practice").click();
    await flush();
    expect(document.body.textContent).toContain("Subjective question");
    expect(saveRecentScope).toHaveBeenCalledWith({
      documentId,
      headingBlockId: "20260804120002-abcdefg",
    });
  });

  it("restores source option order, undoes without writing, and submits once", async () => {
    const { controller, submitAttempt } = mockController({ preview: makePreview([objectiveQuestion]) });
    const values = [0, 0];
    render(controller, { random: () => values.shift() ?? 0 });
    await scanAndSync();
    button("Start practice").click();
    await flush();
    expect(document.querySelector('[data-question-type="multiple"]')?.textContent?.trim()).toBe("Multiple choice");
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
    expect(submitAttempt.mock.calls[0][0].durationMs).toEqual(expect.any(Number));
  });

  it("shows the indefinite type and allows selecting more than one option", async () => {
    const { controller } = mockController({ preview: makePreview([indefiniteQuestion]) });
    render(controller, { random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    expect(document.querySelector('[data-question-type="indefinite"]')?.textContent?.trim())
      .toBe("Indefinite choice");
    option("Alpha").click();
    option("Beta").click();
    await flush();
    expect(option("Alpha").getAttribute("aria-pressed")).toBe("true");
    expect(option("Beta").getAttribute("aria-pressed")).toBe("true");
  });

  it("does not run or persist timing when the timer setting is disabled", async () => {
    const { controller, submitAttempt } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { timingEnabled: false, random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    expect(document.querySelector(".timer")).toBeNull();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();

    expect(submitAttempt.mock.calls[0][0]).toHaveProperty("durationMs", undefined);
  });

  it("accumulates in-memory question time across answer-card navigation", async () => {
    let now = 1000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const { controller, submitAttempt } = mockController({
      preview: makePreview([objectiveQuestion, subjectiveQuestion]),
    });
    render(controller, { random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();
    now = 4000;
    button("Answer card").click();
    await flush();
    button("Question 2").click();
    await flush();
    now = 5000;
    button("Answer card").click();
    await flush();
    button("Question 1").click();
    await flush();
    now = 7000;
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();

    expect(submitAttempt.mock.calls[0][0].durationMs).toBe(5000);
  });

  it("opens a mobile answer card, navigates pending questions, and keeps actions docked", async () => {
    await page.viewport(390, 844);
    const thirdQuestion: Question = {
      ...subjectiveQuestion,
      id: "q-subjective-2",
      title: "Third question",
    };
    const { controller } = mockController({
      preview: makePreview([objectiveQuestion, subjectiveQuestion, thirdQuestion]),
    });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();

    expect(document.querySelector(".timer")?.textContent).toMatch(/^\s*00:0\d\s*$/u);
    button("Answer card").click();
    await flush();
    const panel = document.querySelector<HTMLElement>(".answer-card-panel");
    expect(panel).not.toBeNull();
    expect(panel?.querySelectorAll(".answer-card-grid button")).toHaveLength(3);
    button("Question 2").click();
    await flush();

    expect(document.body.textContent).toContain("Subjective question");
    expect(document.querySelector(".answer-card-panel")).toBeNull();
    const practice = document.querySelector<HTMLElement>(".practice")!.getBoundingClientRect();
    const actions = document.querySelector<HTMLElement>(".action-bar")!.getBoundingClientRect();
    expect(Math.abs(practice.bottom - actions.bottom)).toBeLessThanOrEqual(1);
    expect(actions.top).toBeGreaterThan(practice.top);
  });

  it("scrolls long mobile questions inside the practice content while keeping the chrome visible", async () => {
    await page.viewport(390, 844);
    const longQuestion: Question = {
      ...objectiveQuestion,
      stemMarkdown: Array.from(
        { length: 24 },
        (_, index) => `Paragraph ${index + 1} with enough question text to require vertical scrolling.`,
      ).join("\n\n"),
    };
    const { controller } = mockController({ preview: makePreview([longQuestion]) });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();

    const host = document.body.firstElementChild as HTMLElement;
    const root = document.querySelector<HTMLElement>(".question-bank")!;
    const header = document.querySelector<HTMLElement>(".app-header")!;
    const content = document.querySelector<HTMLElement>('.practice-content [data-slot="scroll-area-viewport"]')!;
    const actions = document.querySelector<HTMLElement>(".action-bar")!;
    const hostRect = host.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();

    expect(Math.abs(rootRect.bottom - hostRect.bottom)).toBeLessThanOrEqual(1);
    expect(headerRect.top).toBeGreaterThanOrEqual(hostRect.top);
    expect(actionRect.bottom).toBeLessThanOrEqual(hostRect.bottom);
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    content.scrollTop = 240;
    content.dispatchEvent(new Event("scroll"));
    expect(content.scrollTop).toBeGreaterThan(0);
    expect(header.getBoundingClientRect()).toEqual(headerRect);
    expect(actions.getBoundingClientRect()).toEqual(actionRect);
  });

  it("keeps the desktop reveal action visible while a long question scrolls internally", async () => {
    await page.viewport(1280, 840);
    const longQuestion: Question = {
      ...objectiveQuestion,
      stemMarkdown: Array.from(
        { length: 32 },
        (_, index) => `Desktop paragraph ${index + 1} with enough text to require internal scrolling.`,
      ).join("\n\n"),
    };
    const { controller } = mockController({ preview: makePreview([longQuestion]) });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();

    const host = document.body.firstElementChild as HTMLElement;
    const root = document.querySelector<HTMLElement>(".question-bank")!;
    const header = document.querySelector<HTMLElement>(".app-header")!;
    const viewport = document.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]')!;
    const actions = document.querySelector<HTMLElement>(".action-bar")!;
    const hostRect = host.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const headerRect = header.getBoundingClientRect();
    const actionRect = actions.getBoundingClientRect();

    expect(document.querySelector('[data-slot="scroll-area"]')).not.toBeNull();
    expect(Math.abs(rootRect.bottom - hostRect.bottom)).toBeLessThanOrEqual(1);
    expect(actionRect.bottom).toBeLessThanOrEqual(hostRect.bottom);
    expect(actionRect.top).toBeGreaterThan(headerRect.bottom);
    expect(viewport.scrollHeight).toBeGreaterThan(viewport.clientHeight);
    viewport.scrollTop = 320;
    viewport.dispatchEvent(new Event("scroll"));
    expect(viewport.scrollTop).toBeGreaterThan(0);
    expect(header.getBoundingClientRect()).toEqual(headerRect);
    expect(actions.getBoundingClientRect()).toEqual(actionRect);
  });

  it("opens the current question title block in the SiYuan source editor", async () => {
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    const openQuestionSource = vi.fn();
    render(controller, { openQuestionSource });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    button("Open source in SiYuan").click();

    expect(openQuestionSource).toHaveBeenCalledOnce();
    expect(openQuestionSource).toHaveBeenCalledWith(blockId);
  });

  it("uses the SiYuan renderer for question and answer content and toggles source styles", async () => {
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    const renderQuestionMarkdown = vi.fn((markdown: string, inheritStyles: boolean) => (
      `<span data-native-render="true" data-source-styles="${inheritStyles}">${markdown}</span>`
    ));
    const onInheritSourceStylesChange = vi.fn();
    render(controller, { renderQuestionMarkdown, onInheritSourceStylesChange });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    expect(renderQuestionMarkdown).toHaveBeenCalledWith(objectiveQuestion.stemMarkdown, true);
    expect(document.querySelector('[data-native-render="true"][data-source-styles="true"]')).not.toBeNull();

    const sourceStyleToggle = document.querySelector<HTMLButtonElement>('[data-slot="switch"]');
    if (!sourceStyleToggle) throw new Error("Missing source style toggle");
    expect(sourceStyleToggle.getAttribute("data-state")).toBe("checked");
    sourceStyleToggle.click();
    await flush();
    expect(onInheritSourceStylesChange).toHaveBeenCalledWith(false);
    expect(renderQuestionMarkdown).toHaveBeenCalledWith(objectiveQuestion.stemMarkdown, false);

    const alpha = [...document.querySelectorAll<HTMLButtonElement>("button.option")]
      .find((item) => item.querySelector(".option-label")?.textContent === "A");
    if (!alpha) throw new Error("Missing source option A");
    alpha.click();
    await flush();
    const gamma = [...document.querySelectorAll<HTMLButtonElement>("button.option")]
      .find((item) => item.querySelector(".option-label")?.textContent === "C");
    if (!gamma) throw new Error("Missing source option C");
    gamma.click();
    button("Reveal answer").click();
    await flush();
    expect(renderQuestionMarkdown).toHaveBeenCalledWith(objectiveQuestion.solutionMarkdown, false);
    expect(document.querySelector(".solution [data-native-render='true']")?.textContent).toContain("Answer");
  });

  it("records subjective self-rating independently from objective correctness", async () => {
    const { controller, submitAttempt } = mockController({ preview: makePreview([subjectiveQuestion]) });
    render(controller);
    await scanAndSync();
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

  it("renders answer controls for true-false questions without explicit source options", async () => {
    const trueFalseQuestion: Question = {
      id: "q-true-false",
      type: "true-false",
      title: "True or false",
      stemMarkdown: "The statement is false.",
      options: [],
      answer: { kind: "boolean", value: false },
      solutionMarkdown: "False.",
      metadata: { topicId: "root", topicPath: ["Root topic"] },
    };
    const { controller, submitAttempt } = mockController({ preview: makePreview([trueFalseQuestion]) });
    render(controller, { random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    option("False").click();
    button("Reveal answer").click();
    await flush();
    expect(document.body.textContent).toContain("Correct");
    button("good").click();
    await flush();
    expect(submitAttempt.mock.calls[0][0]).toMatchObject({
      questionId: trueFalseQuestion.id,
      selectedOptionIds: ["false"],
      objectiveCorrect: true,
    });
  });

  it("shows shared group material with each child question", async () => {
    const child = {
      ...subjectiveQuestion,
      metadata: { ...subjectiveQuestion.metadata, parentId: "group-1" },
    };
    const preview = makePreview([child]);
    preview.scan.report.document.groups = [{
      id: "group-1",
      materialMarkdown: "**Shared case facts**",
      questionIds: [child.id],
    }];
    const { controller } = mockController({ preview });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();
    expect(document.body.textContent).toContain("Shared material");
    expect(document.body.textContent).toContain("Shared case facts");
  });

  it("clears a saved heading scope when its block no longer exists", async () => {
    const { controller, saveRecentScope } = mockController({
      recent: { documentId, headingBlockId: "20260804120004-deleted" },
    });
    render(controller);
    await scan();
    expect(document.querySelector('[data-slot="select-trigger"]')?.textContent).toContain("Entire document");
    expect(saveRecentScope).toHaveBeenCalledWith({ documentId });
  });

  it("restores a saved scope by immutable heading block ID", async () => {
    const { controller } = mockController({
      recent: { documentId, headingBlockId: "20260804120003-abcdefg" },
    });
    render(controller);
    await scan();

    expect(document.querySelector('[data-slot="select-trigger"]')?.textContent).toContain("Child topic");
  });

  it("shows concrete scan findings and planned writes", async () => {
    const preview = makePreview([objectiveQuestion]);
    preview.scan.report.inferences = [{
      code: "inferred-question-type",
      message: "Inferred single choice",
      questionId: objectiveQuestion.id,
      line: 12,
      title: "120. （多）",
      sourceMarkdown: "##### 120. （多）",
    }];
    preview.ialWriteActions = [{
      blockId,
      questionId: objectiveQuestion.id,
      line: 12,
      attributes: { "custom-qb-type": "multiple" },
      reason: "inferred-question-type",
    }];
    preview.bindingRepairs = [{
      kind: "add",
      database: "attemptLog",
      field: "duration_ms",
      keyId: "20260804120005-abcdefg",
      name: "Duration (min)",
      type: "number",
    }];
    const { controller } = mockController({ preview });
    render(controller);
    await scan();

    expect(document.body.textContent).toContain("Inferred single choice");
    expect(document.body.textContent).toContain("Heading: 120. （多）");
    expect(document.querySelector(".message-source")?.textContent).toContain("##### 120. （多）");
    expect(document.body.textContent).toContain("custom-qb-type");
    expect(document.body.textContent).toContain("duration_ms");
  });

  it("copies a complete scan log with heading and source Markdown", async () => {
    const preview = makePreview([objectiveQuestion]);
    preview.scan.report.issues = [{
      code: "missing-stable-question-id",
      message: "Question-like heading has no custom-qb-id and was not indexed",
      line: 7,
      title: "99. （单）",
      sourceMarkdown: "##### 99. （单）",
    }];
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    const { controller } = mockController({ preview });
    render(controller);
    await scan();

    button("Copy scan log").click();
    await flush();

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("Heading: 99. （单）"));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("##### 99. （单）"));
  });

  it("discards a scan preview when the target document ID changes", async () => {
    const { controller } = mockController();
    render(controller);
    await scan();
    expect(document.querySelector(".scan-summary")).not.toBeNull();
    const input = document.querySelector<HTMLInputElement>("#document-id");
    if (!input) throw new Error("Missing document input");

    input.value = "20260804120009-changed";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();

    expect(document.querySelector(".scan-summary")).toBeNull();
    expect(document.body.textContent).not.toContain("Start practice");
  });

  it("submits mapped Riff cards when practicing the due filter", async () => {
    const { controller, submitAttempt } = mockController({
      preview: makePreview([objectiveQuestion]),
      dueCards: new Map([[objectiveQuestion.id, dueCard]]),
    });
    render(controller);
    await scanAndSync();
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
    const input = document.querySelector<HTMLInputElement>("[data-import-file]");
    if (!input) throw new Error("Missing import input");
    const file = new File(["{}"], "attempts.json", { type: "application/json" });
    const transfer = new DataTransfer();
    transfer.items.add(file);
    input.files = transfer.files;
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
    await scanAndSync();
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

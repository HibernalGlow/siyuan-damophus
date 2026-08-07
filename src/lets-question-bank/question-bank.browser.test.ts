import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { Question } from "@/question-bank/core/types";
import { createPracticeSessionSnapshot } from "@/question-bank/core";
import type { QuestionIndexBatchPreview } from "@/question-bank/application";
import type { FrozenQuestionSet, QuestionCatalogEntry } from "@/question-bank/assembly";
import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
import { attempt, blockId, button, documentId, flush, indefiniteQuestion, makePreview, mockController, objectiveQuestion, option, render, scan, scanAndSync, selectScope, subjectiveQuestion, systemDocumentId } from "./question-bank.browser.fixtures";
describe("question bank browser flow", () => {
  it("uses a compact highlighted icon for automatic document scanning", async () => {
    const { controller } = mockController();
    render(controller, { autoScanDocument: true });
    await flush();

    const toggle = document.querySelector<HTMLButtonElement>("[data-auto-scan-toggle]");
    expect(toggle).not.toBeNull();
    expect(toggle?.getAttribute("aria-pressed")).toBe("true");
    expect(toggle?.textContent?.trim()).toBe("");
    expect(toggle?.getAttribute("aria-label")).toBe("Automatically scan document");

    toggle?.click();
    await flush();
    expect(toggle?.getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps the scan summary collapsed on a short mobile viewport", async () => {
    await page.viewport(390, 640);
    const { controller } = mockController();
    render(controller, { autoScanDocument: true });

    await new Promise((resolve) => setTimeout(resolve, 320));
    await flush();

    const panel = document.querySelector<HTMLElement>(".scan-panel");
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute("data-state")).toBe("closed");

    const trigger = panel?.querySelector<HTMLButtonElement>(".workspace-panel-trigger");
    trigger?.click();
    await flush();
    expect(panel?.getAttribute("data-state")).toBe("open");
  });

  it("switches from practice to the full-library read-only statistics view", async () => {
    const { controller } = mockController();
    controller.loadStatisticsQuestions = vi.fn(async () => [
      { questionId: objectiveQuestion.id, questionType: objectiveQuestion.type, subject: "Civil law", category: "Security" },
    ]);
    controller.loadAttemptEvents = vi.fn(async () => [attempt({
      questionId: objectiveQuestion.id,
      sessionId: "statistics-session",
      questionType: objectiveQuestion.type,
      objectiveCorrect: false,
      masteryRating: "again",
      durationMs: 2000,
    })]);
    render(controller, { now: () => Date.parse("2026-08-06T02:00:00.000Z") });

    button("统计").click();
    await vi.waitFor(() => expect(document.querySelector('[data-testid="statistics-view"]')).not.toBeNull());
    expect(document.body.textContent).toContain("Question coverage");
    expect(document.body.textContent).toContain("Civil law");
    expect(controller.loadStatisticsQuestions).toHaveBeenCalledOnce();
    expect(controller.loadAttemptEvents).toHaveBeenCalledOnce();
  });

  it("starts a durable practice session from a frozen cross-document set", async () => {
    const { controller, practiceSessions } = mockController();
    const sourceDocuments: QuestionSourceDocument[] = [{
      documentId,
      notebookId: "notebook-1",
      title: "Civil questions",
    }];
    const catalog: QuestionCatalogEntry[] = [{
      questionId: objectiveQuestion.id,
      blockId,
      documentId,
      notebookId: "notebook-1",
      questionTitle: objectiveQuestion.title,
      questionType: objectiveQuestion.type,
    }];
    const frozen: FrozenQuestionSet = {
      schema_version: 1,
      set_id: "set-practice-1",
      blueprint_id: "blueprint-practice-1",
      blueprint_revision: 1,
      generated_at: "2026-08-06T00:00:00.000Z",
      seed: "seed-practice-1",
      source_revision: "revision-practice-1",
      question_ids: [objectiveQuestion.id],
      source_keys: [documentId],
      widened: false,
      deficits: [],
    };
    const batch = {
      token: "batch-token",
      generatedAt: "2026-08-06T00:00:00.000Z",
      documentIds: [documentId],
      aliases: [],
      blockers: [],
      documents: [{
        ...makePreview([]),
        actions: [],
      }],
    } as unknown as QuestionIndexBatchPreview;
    controller.listQuestionSourceDocuments = vi.fn(async () => sourceDocuments);
    controller.loadQuestionCatalog = vi.fn(async () => catalog);
    controller.listQuestionSetBlueprints = vi.fn(async () => []);
    controller.previewSyncBatch = vi.fn(async () => batch);
    controller.confirmSyncBatch = vi.fn(async () => batch);
    controller.assembleQuestionSet = vi.fn(() => frozen);
    controller.hydrateQuestionSources = vi.fn(async () => ({
      questions: [objectiveQuestion],
      topics: [],
      blockIdsByQuestionId: new Map([[objectiveQuestion.id, blockId]]),
      sourceKeys: [documentId],
    }));
    render(controller);
    await scan();

    button("跨文档组卷").click();
    await vi.waitFor(() => expect(document.querySelector(".question-set-composer")).not.toBeNull());
    await page.getByRole("checkbox").click();
    await page.getByRole("button", { name: "检查并入库" }).click();
    await vi.waitFor(() => expect(controller.previewSyncBatch).toHaveBeenCalledOnce());
    await page.getByRole("button", { name: "继续设置" }).click();
    await page.getByRole("button", { name: "预览试卷" }).click();
    await page.getByRole("button", { name: "用于考试/练习" }).click();

    await vi.waitFor(() => expect(practiceSessions.has(frozen.set_id)).toBe(true));
    expect(practiceSessions.get(frozen.set_id)).toMatchObject({
      source_key: frozen.set_id,
      source_label: "新组卷方案",
      queue_question_ids: [objectiveQuestion.id],
    });
    expect(document.body.textContent).toContain(objectiveQuestion.title);
  });

  it("shows a working close action when hosted in a mobile dialog", async () => {
    const onClose = vi.fn();
    const { controller } = mockController();
    render(controller, { onClose });
    await flush();

    button("Close").click();

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("does not leak its box sizing reset into SiYuan's SVG icon sprite", async () => {
    const hostIcon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const hostUse = document.createElementNS("http://www.w3.org/2000/svg", "use");
    hostIcon.append(hostUse);
    document.body.append(hostIcon);

    const { controller } = mockController();
    render(controller);
    await flush();

    expect(getComputedStyle(hostIcon).boxSizing).not.toBe("border-box");
    expect(getComputedStyle(hostUse).boxSizing).not.toBe("border-box");
    const questionBank = document.querySelector<HTMLElement>(".question-bank");
    expect(questionBank).not.toBeNull();
    expect(getComputedStyle(questionBank!).boxSizing).toBe("border-box");
  });

  it("shows session storage errors discovered during startup", async () => {
    const { controller } = mockController();
    vi.mocked(controller.listPracticeSessions).mockRejectedValueOnce(new Error("Practice session storage is invalid"));

    render(controller);
    await flush();

    expect(document.body.textContent).toContain("Practice session storage is invalid");
  });

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
    expect(controller.confirmSync).not.toHaveBeenCalled();
    button("Confirm index sync").click();
    await flush();
    expect(document.body.textContent).toContain("Question index synchronized");
    expect(controller.confirmSync).toHaveBeenCalledWith(documentId, "preview-token");
  });

  it("automatically synchronizes a safe pending index when enabled", async () => {
    const { controller } = mockController();
    render(controller, { autoSyncIndex: true });

    await scan();

    expect(controller.confirmSync).toHaveBeenCalledWith(documentId, "preview-token");
    expect(document.body.textContent).toContain("Question index synchronized");
    expect(button("Start practice").disabled).toBe(false);
  });

  it("does not automatically synchronize an index with blockers", async () => {
    const blockedPreview = makePreview([objectiveQuestion]);
    blockedPreview.blockers = [{
      code: "duplicate-question-id",
      message: "Duplicate stable question ID",
      questionId: objectiveQuestion.id,
    }];
    const { controller } = mockController({ preview: blockedPreview });
    render(controller, { autoSyncIndex: true });

    await scan();

    expect(controller.confirmSync).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("resolve blockers before syncing");
  });

  it("reports automatic index synchronization setting changes", async () => {
    const onAutoSyncIndexChange = vi.fn();
    const { controller } = mockController();
    render(controller, { onAutoSyncIndexChange });
    await scan();

    const toggle = document.querySelector<HTMLButtonElement>(
      '[aria-label="Automatically sync latest index"]',
    );
    if (!toggle) throw new Error("Missing automatic index synchronization switch");
    toggle.click();
    await flush();

    expect(onAutoSyncIndexChange).toHaveBeenCalledWith(true);
    expect(toggle.dataset.state).toBe("checked");
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

  it("shows the selected source and persisted completion overview", async () => {
    const { controller } = mockController();
    render(controller);

    await scan();

    const source = document.querySelector<HTMLElement>('[data-testid="source-identity"]');
    const overview = document.querySelector<HTMLElement>('[data-testid="completion-overview"]');
    const progress = document.querySelector<HTMLElement>('[role="progressbar"]');
    expect(source?.textContent).toContain("Document");
    expect(source?.textContent).toContain("2021 Civil Procedure Gold Questions");
    expect(source?.textContent).toContain("/Legal Exam/Civil Procedure/2021 Gold Questions");
    expect(source?.textContent).toContain(documentId);
    expect(overview?.textContent).toContain("50%");
    expect(overview?.textContent).toContain("2Questions");
    expect(overview?.textContent).toContain("1Attempted");
    expect(overview?.textContent).toContain("1Untouched");
    expect(overview?.textContent).toContain("1Needs review");
    expect(progress?.getAttribute("aria-valuenow")).toBe("50");
    expect(progress?.getAttribute("aria-valuemax")).toBe("100");
  });

  it.each([
    { name: "not started", aggregates: new Map(), status: "Not started", percentage: "0" },
    {
      name: "completed",
      aggregates: new Map([
        [objectiveQuestion.id, {
          questionId: objectiveQuestion.id,
          attempts: 1,
          objectiveAttempts: 1,
          objectiveCorrect: 1,
          objectiveIncorrect: 0,
          consecutiveReviewCount: 0,
          consecutiveAgainCount: 0,
          consecutiveHardCount: 0,
        }],
        [subjectiveQuestion.id, {
          questionId: subjectiveQuestion.id,
          attempts: 1,
          objectiveAttempts: 0,
          objectiveCorrect: 0,
          objectiveIncorrect: 0,
          consecutiveReviewCount: 0,
          consecutiveAgainCount: 0,
          consecutiveHardCount: 0,
        }],
      ]),
      status: "Completed",
      percentage: "100",
    },
  ])("renders the $name persisted completion state", async ({ aggregates, status, percentage }) => {
    const { controller } = mockController({ aggregates });
    render(controller);

    await scan();

    const overview = document.querySelector<HTMLElement>('[data-testid="completion-overview"]');
    const progress = document.querySelector<HTMLElement>('[role="progressbar"]');
    expect(overview?.textContent).toContain(status);
    expect(overview?.textContent).toContain(`${percentage}%`);
    expect(progress?.getAttribute("aria-valuenow")).toBe(percentage);
  });

  it("keeps the source and progress overview within a mobile viewport", async () => {
    await page.viewport(390, 844);
    const { controller } = mockController({
      sourceIdentity: {
        id: documentId,
        rootId: documentId,
        type: "d",
        content: "A deliberately long civil procedure source title that must wrap on mobile",
        hpath: "/Legal Exam/A deliberately long civil procedure document path",
      },
    });
    render(controller);

    await scan();

    for (const element of document.querySelectorAll<HTMLElement>('[data-testid="source-identity"], [data-testid="completion-overview"]')) {
      const rect = element.getBoundingClientRect();
      expect(rect.left).toBeGreaterThanOrEqual(0);
      expect(rect.right).toBeLessThanOrEqual(390);
      expect(element.scrollWidth).toBeLessThanOrEqual(element.clientWidth);
    }
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
    expect(document.body.textContent).toContain("Question index, topic index, and attempt log are ready to reconnect");
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
    button("All").click();
    button("Start practice").click();
    await flush();
    expect(document.body.textContent).toContain("Subjective question");
    expect(document.querySelector('[data-slot="tabs"]')).toBeNull();
    expect(saveRecentScope).toHaveBeenCalledWith({
      documentId,
      headingBlockId: "20260804120002-abcdefg",
    });
  });

  it("preloads initial and upcoming embed sources without revealing the solution", async () => {
    const thirdQuestion: Question = {
      ...subjectiveQuestion,
      id: "q-third",
      title: "Third question",
    };
    const preview = makePreview([objectiveQuestion, subjectiveQuestion, thirdQuestion]);
    const sourceIds = [
      "20260804120011-abcdefg",
      "20260804120012-abcdefg",
      "20260804120013-abcdefg",
    ];
    preview.scan.blockIdsByQuestionId = new Map([
      [objectiveQuestion.id, sourceIds[0]],
      [subjectiveQuestion.id, sourceIds[1]],
      [thirdQuestion.id, sourceIds[2]],
    ]);
    const { controller } = mockController({ preview });
    const prepareSourceBlock = vi.fn(async () => {});
    const mountSourceBlock = vi.fn((target: HTMLElement) => {
      target.innerHTML = "<div data-mounted-source>stem</div>";
      return () => target.replaceChildren();
    });
    render(controller, {
      questionRenderMode: "embed",
      prepareSourceBlock,
      mountSourceBlock,
    });
    await scanAndSync();
    button("Start practice").click();
    await vi.waitFor(() => expect(prepareSourceBlock).toHaveBeenCalledWith(sourceIds[0]));
    expect(prepareSourceBlock).toHaveBeenCalledWith(sourceIds[1]);
    expect(prepareSourceBlock).not.toHaveBeenCalledWith(sourceIds[2]);
    await vi.waitFor(() => expect(mountSourceBlock).toHaveBeenCalledOnce());
    expect(document.querySelector(".embedded-answer-source")).toBeNull();

    button("Next question").click();
    await new Promise((resolve) => setTimeout(resolve, 450));
    await vi.waitFor(() => expect(prepareSourceBlock).toHaveBeenCalledWith(sourceIds[2]));
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

  it("pauses to the scope screen and resumes every question draft", async () => {
    const { controller, practiceSessions } = mockController({ preview: makePreview([objectiveQuestion, subjectiveQuestion]) });
    render(controller, { random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    option("Alpha").click();
    button("Next question").click();
    await flush();
    button("Previous question").click();
    await flush();
    expect(option("Alpha").getAttribute("aria-pressed")).toBe("true");

    button("Pause and return").click();
    await vi.waitFor(() => expect(practiceSessions.size).toBe(1));
    await flush();
    expect(document.body.textContent).toContain("Unfinished sessions");
    button("Continue").click();
    await flush();

    expect(document.body.textContent).toContain("Objective question");
    expect(option("Alpha").getAttribute("aria-pressed")).toBe("true");
  });

  it("pauses only the practice timer without leaving the question", async () => {
    let currentNow = 1_000;
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { now: () => currentNow });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    const toggle = document.querySelector<HTMLButtonElement>("[data-practice-timer-toggle]")!;
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
    toggle.click();
    await flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("true");
    expect(document.body.textContent).toContain("Objective question");

    currentNow = 20_000;
    await flush();
    expect(document.querySelector<HTMLElement>(".timer")?.textContent).toMatch(/00:00/);

    toggle.click();
    await flush();
    expect(toggle.getAttribute("aria-pressed")).toBe("false");
  });

  it("shows source reconciliation issues after resuming", async () => {
    const { controller, practiceSessions } = mockController({ preview: makePreview([objectiveQuestion]) });
    practiceSessions.set(documentId, createPracticeSessionSnapshot({
      sessionId: "unfinished-session",
      sourceKey: documentId,
      filter: "all",
      order: "sequential",
      queue: [
        { question: objectiveQuestion, optionOrder: ["A", "B", "C"] },
        { question: subjectiveQuestion, optionOrder: [] },
      ],
      now: new Date("2026-08-06T00:00:00.000Z"),
    }));
    render(controller);
    await scanAndSync();

    button("Continue").click();
    await flush();

    expect(document.body.textContent).toContain("Source changes were reconciled");
    expect(document.body.textContent).toContain("q-subjective: missing-question");
  });

  it("keeps an unfinished session when another window owns its lease", async () => {
    const { controller, practiceSessions } = mockController({ preview: makePreview([objectiveQuestion]) });
    const unfinished = createPracticeSessionSnapshot({
      sessionId: "unfinished-session",
      sourceKey: documentId,
      filter: "all",
      order: "sequential",
      queue: [{ question: objectiveQuestion, optionOrder: ["A", "B", "C"] }],
      now: new Date("2026-08-06T00:00:00.000Z"),
    });
    practiceSessions.set(documentId, unfinished);
    vi.mocked(controller.acquirePracticeSession).mockResolvedValue(false);
    render(controller);
    await scanAndSync();

    button("Use current settings").click();
    await flush();
    button("Replace and start").click();
    await flush();

    expect(controller.removePracticeSession).not.toHaveBeenCalled();
    expect(practiceSessions.get(documentId)).toEqual(unfinished);
    expect(document.body.textContent).toContain("This practice session is open in another window");
  });

  it("ends a partial session without deleting submitted attempt events", async () => {
    const { controller, practiceSessions, sessionAttempts } = mockController({
      preview: makePreview([objectiveQuestion, subjectiveQuestion]),
    });
    render(controller, { random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();

    button("End practice").click();
    await flush();
    expect(document.body.textContent).toContain("End this practice?");
    const confirmation = [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((item) => item.textContent?.trim() === "End practice");
    if (!confirmation) throw new Error("Missing end-practice confirmation");
    confirmation.click();
    await vi.waitFor(() => expect(practiceSessions.size).toBe(0));
    await flush();

    expect(sessionAttempts).toHaveLength(1);
    expect(sessionAttempts[0].question_id).toBe(objectiveQuestion.id);
    expect(document.querySelector(".workspace")).not.toBeNull();
  });

  it("removes the completed snapshot and opens submitted questions in read-only review", async () => {
    const { controller, practiceSessions } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await vi.waitFor(() => expect(document.body.textContent).toContain("Practice complete"));
    await vi.waitFor(() => expect(practiceSessions.size).toBe(0));

    button("1. Objective question").click();
    await flush();
    expect(option("Alpha").disabled).toBe(true);
    expect(button("Return to summary")).toBeDefined();
    expect(document.querySelector(".attempt-metadata")?.textContent).toContain("good");
    button("Return to summary").click();
    await flush();
    expect(document.body.textContent).toContain("Practice complete");
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

  it("excludes answer viewing time by default", async () => {
    let currentNow = 1_000;
    const { controller, submitAttempt } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { now: () => currentNow, random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    currentNow = 4_000;
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    expect(document.querySelector<HTMLButtonElement>("[data-practice-timer-toggle]")?.getAttribute("aria-pressed")).toBe("true");

    currentNow = 14_000;
    button("good").click();
    await flush();
    expect(submitAttempt.mock.calls[0][0].durationMs).toBe(3_000);
  });

  it("compares reveal time with the previous attempt and historical average", async () => {
    let currentNow = 1_000;
    const { controller } = mockController({
      preview: makePreview([objectiveQuestion]),
      aggregates: new Map([[objectiveQuestion.id, {
        questionId: objectiveQuestion.id,
        attempts: 2,
        timedAttempts: 2,
        totalDurationMs: 70_000,
        objectiveAttempts: 2,
        objectiveCorrect: 1,
        objectiveIncorrect: 1,
        consecutiveReviewCount: 0,
        consecutiveAgainCount: 0,
        consecutiveHardCount: 0,
        lastAttemptId: "previous-attempt",
        lastDurationMs: 30_000,
        previousDurationMs: 40_000,
      }]]),
    });
    render(controller, { now: () => currentNow, random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    currentNow = 21_000;
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();

    const previous = document.querySelector<HTMLElement>('[data-benchmark="previous"]');
    const average = document.querySelector<HTMLElement>('[data-benchmark="average"]');
    expect(previous?.classList.contains("faster")).toBe(true);
    expect(previous?.textContent).toContain("Faster than last time by 00:10");
    expect(average?.classList.contains("faster")).toBe(true);
    expect(average?.textContent).toContain("Faster than historical average by 00:15");
  });

  it("resets the current question timer without resetting session time", async () => {
    let currentNow = 1_000;
    const { controller, submitAttempt } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { now: () => currentNow, random: () => 0.99 });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    currentNow = 4_000;
    button("Reset question timer").click();
    await flush();
    currentNow = 6_000;
    option("Alpha").click();
    option("Gamma").click();
    button("Reveal answer").click();
    await flush();
    button("good").click();
    await flush();

    expect(submitAttempt.mock.calls[0][0].durationMs).toBe(2_000);
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
    expect(headerRect.height).toBeGreaterThan(0);
    expect(header.classList.contains("app-header--practice")).toBe(true);
    expect(actionRect.bottom).toBeLessThanOrEqual(hostRect.bottom);
    expect(content.scrollHeight).toBeGreaterThan(content.clientHeight);
    content.scrollTop = 240;
    content.dispatchEvent(new Event("scroll"));
    expect(content.scrollTop).toBeGreaterThan(0);
    expect(header.getBoundingClientRect()).toEqual(headerRect);
    expect(actions.getBoundingClientRect()).toEqual(actionRect);
  });

  it("uses the compact reference layout for mobile practice", async () => {
    await page.viewport(390, 844);
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();

    const root = document.querySelector<HTMLElement>(".question-bank")!;
    const header = document.querySelector<HTMLElement>(".app-header")!;
    const bar = document.querySelector<HTMLElement>(".practice-toolbar")!;
    const question = document.querySelector<HTMLElement>(".question")!;
    const topic = document.querySelector<HTMLElement>(".practice-topic")!;
    const progress = document.querySelector<HTMLElement>(".progress-copy")!;
    const bottomTimer = document.querySelector<HTMLElement>(".question-timer")!;

    expect(root.dataset.practiceActive).toBe("true");
    expect(getComputedStyle(header).display).not.toBe("none");
    expect(document.querySelector(".practice-bar")).toBeNull();
    expect(header.querySelector(".practice-toolbar")).not.toBeNull();
    expect(bar.getBoundingClientRect().height).toBeLessThanOrEqual(70);
    expect(getComputedStyle(topic).display).not.toBe("none");
    expect(progress.innerText.replace(/\s+/gu, " ").trim()).toBe("1 / 1");
    expect(getComputedStyle(progress.querySelector<HTMLElement>(".submitted-copy")!).display).toBe("none");
    expect(parseFloat(getComputedStyle(question).paddingTop)).toBeLessThanOrEqual(12);
    expect(parseFloat(getComputedStyle(question).paddingLeft)).toBeLessThanOrEqual(12);
    expect(getComputedStyle(bottomTimer).display).toBe("none");
  });

  it("keeps the mobile timer clear of the practice controls", async () => {
    await page.viewport(390, 844);
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller);
    await scanAndSync();
    button("Start practice").click();
    await flush();

    const bar = document.querySelector<HTMLElement>(".practice-toolbar")!;
    const timer = document.querySelector<HTMLElement>(".timer")!.getBoundingClientRect();
    const controls = document.querySelector<HTMLElement>(".practice-controls")!.getBoundingClientRect();
    const overlaps = timer.left < controls.right
      && timer.right > controls.left
      && timer.top < controls.bottom
      && timer.bottom > controls.top;

    expect(overlaps).toBe(false);
    expect(timer.left).toBeGreaterThanOrEqual(bar.getBoundingClientRect().left);
    expect(controls.right).toBeLessThanOrEqual(bar.getBoundingClientRect().right);
  });

  it("reuses the scrollable breadcrumb for the current question source", async () => {
    await page.viewport(390, 844);
    const navigate = vi.fn();
    const loadBreadcrumb = vi.fn(async () => [
      { id: "doc", name: "Question bank", type: "NodeDocument", subType: "" },
      { id: blockId, name: "Current question", type: "NodeParagraph", subType: "" },
    ]);
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, {
      mobileBreadcrumb: true,
      loadBreadcrumb,
      openQuestionSource: navigate,
    });
    await scanAndSync();
    button("Start practice").click();
    await vi.waitFor(() => expect(loadBreadcrumb).toHaveBeenCalledWith(blockId));
    await flush();

    const breadcrumb = document.querySelector<HTMLElement>(".practice-breadcrumb")!;
    expect(breadcrumb.dataset.damophusMobileBreadcrumb).toBe("true");
    expect(breadcrumb.querySelectorAll(".protyle-breadcrumb__item")).toHaveLength(2);
    breadcrumb.querySelector<HTMLElement>('[data-node-id="doc"]')!.click();
    expect(navigate).toHaveBeenCalledWith("doc");
  });

  it("locates the current question source from the practice title bar", async () => {
    const navigate = vi.fn();
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { openQuestionSource: navigate });
    await scanAndSync();
    button("Start practice").click();
    await flush();

    button("Open source in SiYuan").click();

    expect(navigate).toHaveBeenCalledOnce();
    expect(navigate).toHaveBeenCalledWith(blockId);
  });

  it("falls back to topic labels when the breadcrumb API returns empty names", async () => {
    await page.viewport(390, 844);
    const loadBreadcrumb = vi.fn(async () => [
      { id: "doc", name: "", type: "NodeDocument", subType: "" },
      { id: blockId, name: "", type: "NodeParagraph", subType: "" },
    ]);
    const { controller } = mockController({ preview: makePreview([objectiveQuestion]) });
    render(controller, { mobileBreadcrumb: true, loadBreadcrumb });
    await scanAndSync();
    button("Start practice").click();
    await vi.waitFor(() => expect(loadBreadcrumb).toHaveBeenCalledWith(blockId));
    await flush();

    const breadcrumb = document.querySelector<HTMLElement>(".practice-breadcrumb")!;
    expect(breadcrumb.textContent).toContain("Root topic");
    expect(breadcrumb.textContent).toContain("Child topic");
    expect(breadcrumb.textContent).not.toMatch(/^\s*\/\s*$/u);
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
});

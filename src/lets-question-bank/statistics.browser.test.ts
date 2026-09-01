import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { mount, tick, unmount } from "svelte";
import "@/styles/damophus.css";
import { buildStatistics } from "@/question-bank/core/statistics";
import type { AttemptEvent } from "@/question-bank/core/types";
import { emptyTopicDictionary, updateTopicDictionaryLabel } from "@/question-bank/topic-dictionary";
import { zhCN as questionBankZhCN } from "@/translations/parts/lets-question-bank";
import { zhCN as topicDictionaryZhCN } from "@/translations/parts/lets-topic-dictionary";
import Statistics from "./Statistics.svelte";

const questions = [
  { questionId: "civil-1", questionType: "single" as const, subject: "civil-procedure", category: "mediation", collection: "gold" },
  { questionId: "criminal-1", questionType: "multiple" as const, subject: "criminal-procedure", category: "evidence", collection: "gold" },
];

const translations: Record<string, string> = {...questionBankZhCN, ...topicDictionaryZhCN};
const label = (key: string, fallback: string) => translations[`lets-question-bank.${key}`] ?? fallback;
const topicDictionary = updateTopicDictionaryLabel(
  updateTopicDictionaryLabel(emptyTopicDictionary("2026-08-06T00:00:00.000Z"), "mediation", "调解"),
  "evidence",
  "证据",
);

const attempts: AttemptEvent[] = [
  {
    schema_version: 1,
    event_kind: "question_attempt",
    attempt_id: "attempt-1",
    question_id: "civil-1",
    session_id: "session-1",
    answered_at: "2026-08-05T16:00:00.000Z",
    question_type: "single",
    option_order: ["A"],
    selected_option_ids: ["A"],
    objective_correct: false,
    mastery_rating: "again",
    session_mode: "practice",
    rating_source: "user",
    duration_ms: 2000,
  },
];

let mounted: ReturnType<typeof mount> | undefined;

afterEach(async () => {
  if (mounted) await unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = "";
  await page.viewport(1024, 768);
});

describe("Statistics", () => {
  it("renders the read-only overview, trend, distributions and weak list", async () => {
    const onSubjectQuestionTotalChange = vi.fn();
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
        subjectQuestionTotals: {"civil-procedure": 100},
        onSubjectQuestionTotalChange,
      },
    });
    expect(document.querySelector('[data-testid="statistics-view"]')).not.toBeNull();
    expect(document.body.textContent).toContain("题目覆盖");
    expect(document.body.textContent).toContain("薄弱题目");
    expect(document.body.textContent).toContain("北京时间");
    expect(document.body.textContent).toContain("科目进度");
    expect(document.body.textContent).toContain("调解");
    expect(document.body.textContent).toContain("证据");
    expect(document.body.textContent).toContain("单选题");
    expect(document.body.textContent).not.toContain("真金题");
    expect(document.querySelector('[data-subject="civil-procedure"]')?.textContent).toContain("民诉");
    expect(document.querySelector('[data-subject="civil-procedure"]')?.textContent).toContain("1%");
    expect(document.querySelector('[data-subject="criminal-procedure"]')?.textContent).toContain("刑诉");
    expect(document.querySelector('[data-subject="criminal-procedure"]')?.textContent).toContain("0%");
    expect(document.querySelector('[data-subject="civil-procedure"] [role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("1");
    const plannedTotalInput = page.getByRole("spinbutton", {name: "民诉 计划总题数"});
    await expect.element(plannedTotalInput).toHaveValue(100);
    await plannedTotalInput.fill("120");
    expect(onSubjectQuestionTotalChange).toHaveBeenLastCalledWith("civil-procedure", "120");
  });

  it("keeps subject progress cards inside a narrow viewport", async () => {
    await page.viewport(360, 640);
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
        subjectQuestionTotals: {"civil-procedure": 100, "criminal-procedure": 80},
      },
    });
    const dashboard = document.querySelector('[data-testid="subject-dashboard"]') as HTMLElement;
    const subjects = [...document.querySelectorAll<HTMLElement>("[data-subject]")];
    expect(subjects.length).toBeGreaterThanOrEqual(8);
    expect(subjects.every((subject) => subject.getBoundingClientRect().right <= dashboard.getBoundingClientRect().right + 1)).toBe(true);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  });

  it("resizes dashboard cards vertically and scrolls overflowing content", async () => {
    const onLayoutChange = vi.fn();
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
        statisticsLayout: {heights: {subject: 240, trend: 200}},
        onLayoutChange,
      },
    });
    await tick();

    const resizableCards = [...target.querySelectorAll<HTMLElement>("[data-resizable-card]")];
    const resizers = [...target.querySelectorAll<HTMLButtonElement>(".statistics-card-resizer")];
    expect(resizableCards.length).toBe(9);
    expect(resizers.length).toBe(9);
    expect(target.querySelector("[data-statistics-distribution-dnd]")).toBeNull();
    expect(target.querySelector('[aria-label^="拖动调整顺序"]')).toBeNull();

    const subjectCard = target.querySelector<HTMLElement>('[data-distribution-card="subject"]')!;
    expect(subjectCard).not.toBeNull();
    expect(subjectCard.getBoundingClientRect().height).toBeCloseTo(240, 0);
    expect(getComputedStyle(subjectCard.querySelector<HTMLElement>(".statistics-card-content")!).overflowY).toBe("auto");

    const subjectResizer = subjectCard.querySelector<HTMLButtonElement>(".statistics-card-resizer")!;
    subjectResizer.dispatchEvent(new PointerEvent("pointerdown", {bubbles: true, pointerId: 1, clientY: 100}));
    window.dispatchEvent(new PointerEvent("pointermove", {bubbles: true, pointerId: 1, clientY: 160}));
    expect(subjectCard.getBoundingClientRect().height).toBeCloseTo(300, 0);
    window.dispatchEvent(new PointerEvent("pointerup", {bubbles: true, pointerId: 1, clientY: 160}));
    expect(onLayoutChange).toHaveBeenLastCalledWith({heights: {subject: 300, trend: 200}});

    const trendCard = target.querySelector<HTMLElement>('[data-resizable-card="trend"]')!;
    expect(trendCard.getBoundingClientRect().height).toBeCloseTo(200, 0);
    const trendResizer = trendCard.querySelector<HTMLButtonElement>(".statistics-card-resizer")!;
    trendResizer.dispatchEvent(new KeyboardEvent("keydown", {bubbles: true, key: "ArrowDown"}));
    expect(onLayoutChange).toHaveBeenLastCalledWith({heights: {subject: 300, trend: 224}});
  });

  it("opens every report card in a keyboard-accessible fullscreen preview", async () => {
    const onFullscreenPreview = vi.fn();
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
        subjectQuestionTotals: {"civil-procedure": 100},
        onFullscreenPreview,
      },
    });
    await tick();

    const cards = [...target.querySelectorAll<HTMLElement>("[data-statistics-card-id]")];
    const previewButtons = [...target.querySelectorAll<HTMLButtonElement>('[aria-label^="全屏查看:"]')];
    expect(cards).toHaveLength(13);
    expect(previewButtons).toHaveLength(13);

    for (const button of previewButtons) button.click();
    expect(onFullscreenPreview).toHaveBeenCalledTimes(13);
    expect(onFullscreenPreview).toHaveBeenNthCalledWith(1, expect.objectContaining({
      id: "overview-coverage",
      title: "题目覆盖",
      card: cards[0],
      trigger: previewButtons[0],
    }));
  });

  it("fills a mobile viewport and keeps fullscreen card content scrollable", async () => {
    await page.viewport(360, 640);
    const onFullscreenPreview = vi.fn();
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
        onFullscreenPreview,
      },
    });
    await tick();

    target.querySelector<HTMLButtonElement>('[aria-label="全屏查看: 科目进度"]')?.click();
    await tick();
    const request = onFullscreenPreview.mock.calls[0]?.[0];
    expect(request).toMatchObject({id: "subject-progress", title: "科目进度"});
    const dialog = request.card as HTMLElement;
    dialog.classList.add("damophus-statistics-preview-card");
    const content = dialog.querySelector<HTMLElement>(".statistics-card-content")!;
    expect(getComputedStyle(content).overflowY).toBe("visible");
    expect(getComputedStyle(content).overscrollBehaviorY).toBe("contain");
    expect(dialog.querySelector(".statistics-card-resizer")).not.toBeVisible();
  });

  it("renders the bookmark card with tag counts, notes, redo, and open-source actions", async () => {
    const onOpenBookmarkSource = vi.fn();
    const onStartBookmarkPractice = vi.fn();
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
        bookmarkEntries: [
          {
            questionId: "civil-1",
            title: "民诉经典题",
            blockId: "20260820120002-aaa0001",
            tags: ["classic", "hard"],
            note: "注意调解协议的生效时点",
            updatedAt: "2026-08-31T10:00:00Z",
            attempts: 2,
            accuracy: 50,
            needsReview: true,
          },
          {
            questionId: "criminal-1",
            title: "刑诉收藏题",
            tags: ["classic"],
            note: "",
            updatedAt: "2026-08-30T10:00:00Z",
            attempts: 0,
            needsReview: false,
          },
        ],
        onOpenBookmarkSource,
        onStartBookmarkPractice,
      },
    });
    await tick();
    const card = document.querySelector('[data-testid="statistics-bookmarks"]') as HTMLElement;
    expect(card).not.toBeNull();
    expect(card.textContent).toContain("收藏");
    expect(card.textContent).toContain("民诉经典题");
    expect(card.textContent).toContain("刑诉收藏题");
    expect(card.textContent).toContain("经典好题");
    expect(card.textContent).toContain("重难点");
    expect(card.textContent).toContain("未作答");
    expect(card.textContent).toContain("需复习");
    expect(card.textContent).toContain("注意调解协议的生效时点");
    const chips = [...card.querySelectorAll(".statistics-bookmark-tag-chip")];
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toContain("2");
    expect(chips[1].textContent).toContain("1");

    await page.getByRole("button", { name: "重做收藏" }).click();
    expect(onStartBookmarkPractice).toHaveBeenCalledTimes(1);

    const openButtons = [...card.querySelectorAll<HTMLButtonElement>(".statistics-bookmark-open")];
    expect(openButtons).toHaveLength(1);
    openButtons[0].click();
    expect(onOpenBookmarkSource).toHaveBeenCalledWith(expect.objectContaining({ questionId: "civil-1" }));
  });

  it("shows the bookmark empty state and keeps redo disabled without entries", async () => {
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
        translations,
        label,
        topicDictionary,
      },
    });
    await tick();
    const card = document.querySelector('[data-testid="statistics-bookmarks"]') as HTMLElement;
    expect(card.textContent).toContain("还没有收藏的题目");
    const redo = card.querySelector<HTMLButtonElement>("button[data-disabled], button:disabled");
    expect(redo).not.toBeNull();
  });
});

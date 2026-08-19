import { afterEach, describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { mount, unmount } from "svelte";
import "@/styles/damophus.css";
import { buildStatistics } from "@/question-bank/core/statistics";
import type { AttemptEvent } from "@/question-bank/core/types";
import Statistics from "./Statistics.svelte";

const questions = [
  { questionId: "civil-1", questionType: "single" as const, subject: "民法", category: "担保" },
  { questionId: "criminal-1", questionType: "multiple" as const, subject: "刑法", category: "总则" },
];

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
    const target = document.createElement("div");
    target.style.height = "100vh";
    document.body.appendChild(target);
    mounted = mount(Statistics, {
      target,
      props: {
        snapshot: buildStatistics(questions, attempts, "all", Date.parse("2026-08-06T02:00:00.000Z")),
      },
    });
    expect(document.querySelector('[data-testid="statistics-view"]')).not.toBeNull();
    expect(document.body.textContent).toContain("Question coverage");
    expect(document.body.textContent).toContain("Weak questions");
    expect(document.body.textContent).toContain("民法");
    expect(document.body.textContent).toContain("Beijing time");
    expect(document.body.textContent).toContain("Subject progress");
    expect(document.querySelector('[data-subject="民法"]')?.textContent).toContain("100%");
    expect(document.querySelector('[data-subject="刑法"]')?.textContent).toContain("0%");
    expect(document.querySelector('[data-subject="民法"] [role="progressbar"]')?.getAttribute("aria-valuenow")).toBe("100");
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
      },
    });
    const dashboard = document.querySelector('[data-testid="subject-dashboard"]') as HTMLElement;
    const subjects = [...document.querySelectorAll<HTMLElement>("[data-subject]")];
    expect(subjects).toHaveLength(2);
    expect(subjects.every((subject) => subject.getBoundingClientRect().right <= dashboard.getBoundingClientRect().right + 1)).toBe(true);
    expect(document.documentElement.scrollWidth).toBeLessThanOrEqual(360);
  });
});

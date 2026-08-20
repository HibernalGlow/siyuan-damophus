import { describe, expect, it } from "vitest";
import {
  normalizeStatisticsLayout,
  normalizeSubjectQuestionTotals,
  subjectCompletionPercent,
  subjectPlannedTotal,
} from "./subject-dashboard";

describe("subject dashboard", () => {
  it("normalizes saved distribution card heights to the supported range", () => {
    expect(normalizeStatisticsLayout({
      order: ["year", "subject"],
      heights: {subject: 300.4, category: 20, year: 900, invalid: "large", "": 240},
    })).toEqual({heights: {subject: 300, category: 120, year: 720}});
    expect(normalizeStatisticsLayout(undefined)).toEqual({heights: {}});
  });

  it("keeps only positive integer totals", () => {
    expect(normalizeSubjectQuestionTotals({
      "civil-procedure": 100.9,
      criminal: "80",
      empty: 0,
      invalid: "many",
    })).toEqual({"civil-procedure": 100, criminal: 80});
  });

  it("uses the configured plan without allowing it below the indexed count", () => {
    expect(subjectPlannedTotal({totalQuestions: 42}, 100)).toBe(100);
    expect(subjectPlannedTotal({totalQuestions: 42}, 20)).toBe(42);
    expect(subjectPlannedTotal({totalQuestions: 42}, undefined)).toBe(42);
  });

  it("calculates progress against the planned total", () => {
    expect(subjectCompletionPercent(26, 100)).toBe(26);
    expect(subjectCompletionPercent(1, 3)).toBe(33.3);
    expect(subjectCompletionPercent(0, 0)).toBe(0);
  });
});

import { describe, expect, it } from "vitest";
import { matchesCondition, matchesNegations, type BooruNegations } from "./post-filter";

const widePost = { image_width: 1920, image_height: 1080, score: 25, rating: "s", created_at: "2024-03-01T00:00:00Z" };
const tallPost = { image_width: 1080, image_height: 1920, score: 5, rating: "e", created_at: "2020-01-01T00:00:00Z" };

describe("booru negation (NOT) post filters", () => {
  it("rejects posts above the negated score and keeps the rest", () => {
    const negations: BooruNegations = { maxScore: 10 };
    expect(matchesNegations(widePost, negations)).toBe(false);
    expect(matchesNegations(tallPost, negations)).toBe(true);
  });

  it("rejects posts matching the negated ratio class, fail-open on unknown size", () => {
    expect(matchesNegations(widePost, { notRatio: "landscape" })).toBe(false);
    expect(matchesNegations(tallPost, { notRatio: "landscape" })).toBe(true);
    expect(matchesNegations(tallPost, { notRatio: "portrait" })).toBe(false);
    expect(matchesNegations({ score: 1 }, { notRatio: "portrait" })).toBe(true);
  });

  it("normalizes rating letters and words to the same bucket", () => {
    expect(matchesNegations(widePost, { notRating: "safe" })).toBe(false);
    expect(matchesNegations(widePost, { notRating: "general" })).toBe(false);
    expect(matchesNegations(tallPost, { notRating: "safe" })).toBe(true);
    expect(matchesNegations(tallPost, { notRating: "explicit" })).toBe(false);
  });

  it("rejects posts inside the negated time window only", () => {
    const negations: BooruNegations = { notTimeRange: "2018+" };
    expect(matchesNegations(widePost, negations)).toBe(false);
    expect(matchesNegations(tallPost, negations)).toBe(false);
    expect(matchesNegations({ ...tallPost, created_at: "2015-06-01T00:00:00Z" }, negations)).toBe(true);
  });

  it("keeps posts when any negation passes and integrates with matchesCondition", () => {
    const negations: BooruNegations = { maxScore: 10, notRating: "explicit" };
    expect(matchesNegations(widePost, negations)).toBe(false);
    // matchesCondition rejects via the same negations plus positive checks.
    expect(matchesCondition(widePost, "any", undefined, "any", undefined, negations)).toBe(false);
    expect(matchesCondition(tallPost, "portrait", 3, "any", undefined, negations)).toBe(false);
  });
});

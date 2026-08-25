import { describe, expect, it } from "vitest";
import { ReviewRoundPolicy, type ReviewRoundPolicyCard } from "./review-round-policy";

function card(cardID: string, state: number): ReviewRoundPolicyCard {
  return { cardID, state };
}

function complete(policy: ReviewRoundPolicy, cards: readonly ReviewRoundPolicyCard[]): void {
  for (const item of cards) policy.markReviewed(item.cardID, "3");
}

describe("review round policy", () => {
  it("keeps later new-first rounds on old cards while old cards remain", () => {
    const policy = new ReviewRoundPolicy();
    policy.start();
    const firstRound = [card("new-1", 0), card("old-1", 1)];
    expect(policy.apply(firstRound, 1)).toEqual(firstRound);
    complete(policy, firstRound);

    const secondRound = [card("new-2", 0), card("old-2", 1)];
    expect(policy.apply(secondRound, 1)).toEqual([card("old-2", 1)]);
  });

  it("allows new cards again once a continuation has no old cards", () => {
    const policy = new ReviewRoundPolicy();
    policy.start();
    const firstRound = [card("new-1", 0), card("old-1", 1)];
    policy.apply(firstRound, 1);
    complete(policy, firstRound);
    const oldOnlyRound = [card("old-2", 1)];
    expect(policy.apply([...oldOnlyRound, card("new-2", 0)], 1)).toEqual(oldOnlyRound);
    complete(policy, oldOnlyRound);

    const newOnlyRound = [card("new-3", 0)];
    expect(policy.apply(newOnlyRound, 1)).toEqual(newOnlyRound);
  });

  it("does not filter new cards for mixed or old-first modes", () => {
    const policy = new ReviewRoundPolicy();
    policy.start();
    const firstRound = [card("new-1", 0), card("old-1", 1)];
    policy.apply(firstRound, 0);
    complete(policy, firstRound);
    expect(policy.apply([card("new-2", 0), card("old-2", 1)], 0)).toHaveLength(2);
  });
});

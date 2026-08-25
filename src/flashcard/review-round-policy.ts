export interface ReviewRoundPolicyCard {
  cardID: string;
  state?: number;
}

/** Keeps new-card priority meaningful across the native review continuation prompt. */
export class ReviewRoundPolicy {
  private active = false;
  private currentRound = new Set<string>();
  private completed = new Set<string>();
  private currentRoundHadNew = false;
  private awaitingInitialRound = true;
  private oldCardsOnly = false;

  start(): void {
    this.active = true;
    this.currentRound.clear();
    this.completed.clear();
    this.currentRoundHadNew = false;
    this.awaitingInitialRound = true;
    this.oldCardsOnly = false;
  }

  markReviewed(cardID: string, actionType: string): void {
    if (!this.active) return;
    if (actionType === "-2") {
      this.completed.delete(cardID);
      return;
    }
    if (["1", "2", "3", "4", "-3"].includes(actionType)) this.completed.add(cardID);
  }

  apply<T extends ReviewRoundPolicyCard>(cards: readonly T[], reviewMode: 0 | 1 | 2): T[] {
    if (!this.active) return [...cards];
    let next = [...cards];
    if (reviewMode !== 1) this.oldCardsOnly = false;
    if (this.awaitingInitialRound) {
      this.awaitingInitialRound = false;
    } else if (this.isRoundComplete()) {
      const hasOldCards = next.some((card) => card.state !== 0);
      if (reviewMode === 1 && (this.oldCardsOnly || this.currentRoundHadNew) && hasOldCards) {
        next = next.filter((card) => card.state !== 0);
        this.oldCardsOnly = true;
      } else if (!hasOldCards) {
        this.oldCardsOnly = false;
      }
    }

    this.currentRound = new Set(next.map((card) => card.cardID));
    this.currentRoundHadNew = next.some((card) => card.state === 0);
    this.completed.clear();
    return next;
  }

  reset(): void {
    this.currentRound.clear();
    this.completed.clear();
    this.currentRoundHadNew = false;
    this.awaitingInitialRound = true;
    this.oldCardsOnly = false;
    this.active = false;
  }

  private isRoundComplete(): boolean {
    return this.currentRound.size > 0
      && [...this.currentRound].every((cardID) => this.completed.has(cardID));
  }
}

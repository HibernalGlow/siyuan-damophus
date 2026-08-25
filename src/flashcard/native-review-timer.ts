export interface NativeReviewTimerSettings {
  enabled: boolean;
  continueAfterAnswer: boolean;
}

export interface NativeReviewTimerDisplay {
  enabled: boolean;
  totalMs: number;
  cardMs: number;
  paused: boolean;
}

export interface NativeReviewTimerOptions {
  getSettings: () => NativeReviewTimerSettings;
  onChange?: () => void;
  now?: () => number;
}

function finiteNow(value: number): number {
  return Number.isFinite(value) ? value : Date.now();
}

/** Tracks active review time independently from SiYuan's review-duration log. */
export class NativeReviewTimer {
  private readonly now: () => number;
  private sessionActive = false;
  private currentCardID?: string;
  private currentCardMs = 0;
  private totalMs = 0;
  private activeSince?: number;
  private answerRevealed = false;
  private interval?: number;

  constructor(private readonly options: NativeReviewTimerOptions) {
    this.now = options.now ?? (() => Date.now());
  }

  startSession(cardID?: string, at = this.now()): void {
    this.stopInterval();
    this.sessionActive = true;
    this.currentCardID = cardID;
    this.currentCardMs = 0;
    this.totalMs = 0;
    this.answerRevealed = false;
    this.activeSince = cardID && this.options.getSettings().enabled ? finiteNow(at) : undefined;
    this.syncInterval();
    this.options.onChange?.();
  }

  setActiveCard(cardID: string | undefined, at = this.now()): void {
    if (!this.sessionActive) return;
    const next = cardID || undefined;
    if (next === this.currentCardID) return;
    this.commit(at);
    this.currentCardID = next;
    this.currentCardMs = 0;
    this.answerRevealed = false;
    this.activeSince = next && this.options.getSettings().enabled ? finiteNow(at) : undefined;
    this.syncInterval();
    this.options.onChange?.();
  }

  setQueue(cardIDs: readonly string[], at = this.now()): void {
    if (!this.sessionActive) return;
    if (cardIDs.length === 0) {
      this.stopSession(at);
      return;
    }
    if (this.currentCardID && !cardIDs.includes(this.currentCardID)) {
      this.setActiveCard(cardIDs[0], at);
    }
  }

  handleAction(type: string, cardID?: string, at = this.now()): void {
    if (!this.sessionActive) return;
    if (cardID && cardID !== this.currentCardID) this.setActiveCard(cardID, at);
    if (type === "-1") {
      this.commit(at);
      this.answerRevealed = true;
      if (!this.options.getSettings().continueAfterAnswer) this.activeSince = undefined;
    } else if (type === "-3" || /^[1-4]$/u.test(type)) {
      this.commit(at);
      this.activeSince = undefined;
    }
    this.syncInterval();
    this.options.onChange?.();
  }

  refresh(at = this.now()): void {
    if (!this.sessionActive) return;
    const settings = this.options.getSettings();
    this.commit(at);
    if (!settings.enabled) {
      this.activeSince = undefined;
    } else if (this.currentCardID && (!this.answerRevealed || settings.continueAfterAnswer)) {
      this.activeSince = finiteNow(at);
    } else {
      this.activeSince = undefined;
    }
    this.syncInterval();
    this.options.onChange?.();
  }

  stopSession(at = this.now()): void {
    if (!this.sessionActive) return;
    this.commit(at);
    this.sessionActive = false;
    this.currentCardID = undefined;
    this.activeSince = undefined;
    this.answerRevealed = false;
    this.stopInterval();
    this.options.onChange?.();
  }

  getDisplay(at = this.now()): NativeReviewTimerDisplay {
    const settings = this.options.getSettings();
    if (this.sessionActive && settings.enabled) this.commit(at);
    if (this.sessionActive && !settings.enabled) this.activeSince = undefined;
    return {
      enabled: settings.enabled && this.sessionActive,
      totalMs: Math.max(0, this.totalMs),
      cardMs: Math.max(0, this.currentCardMs),
      paused: this.sessionActive && this.activeSince === undefined,
    };
  }

  dispose(): void {
    this.stopInterval();
    this.sessionActive = false;
  }

  private commit(at: number): void {
    if (this.activeSince === undefined) return;
    const delta = Math.max(0, finiteNow(at) - this.activeSince);
    this.currentCardMs += delta;
    this.totalMs += delta;
    this.activeSince = finiteNow(at);
  }

  private syncInterval(): void {
    const shouldRun = this.sessionActive && this.activeSince !== undefined && this.options.getSettings().enabled;
    if (shouldRun && this.interval === undefined) {
      this.interval = globalThis.setInterval(() => this.options.onChange?.(), 1000) as unknown as number;
    } else if (!shouldRun) {
      this.stopInterval();
    }
  }

  private stopInterval(): void {
    if (this.interval !== undefined) globalThis.clearInterval(this.interval);
    this.interval = undefined;
  }
}

export function formatReviewTimer(milliseconds: number): string {
  const totalSeconds = Math.floor(Math.max(0, milliseconds) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

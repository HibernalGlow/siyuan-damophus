import type { FlashcardPriorityTag } from "./priority-tags";

export type ReviewPriorityBucket = FlashcardPriorityTag | "other";

export interface ReviewCounterCard {
  cardID: string;
  priority: ReviewPriorityBucket;
}

export interface NativeReviewCounterOptions {
  documentRef: Document;
}

const PRIORITIES: readonly ReviewPriorityBucket[] = ["P1", "P2", "P3", "P4", "other"];
const STYLE_ID = "damophus-native-review-counter-style";

const COUNTER_STYLE = `
.damophus-priority-counter {
  display: inline-flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  max-width: min(48vw, 460px);
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
  line-height: 1.2;
}
.damophus-priority-counter::-webkit-scrollbar { display: none; }
.damophus-priority-chip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  min-width: 32px;
  justify-content: center;
  padding: 3px 6px;
  border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 5px;
  background: color-mix(in srgb, currentColor 10%, transparent);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  transition: opacity .2s ease, transform .2s ease, background-color .2s ease;
}
.damophus-priority-chip[data-count="0"] { opacity: .42; }
.damophus-priority-chip[data-priority="P1"] { color: var(--b3-theme-error); font-weight: 700; }
.damophus-priority-chip[data-priority="P2"] { color: var(--b3-theme-warning); font-weight: 650; }
.damophus-priority-chip[data-priority="P3"] { color: var(--b3-theme-primary); }
.damophus-priority-chip[data-priority="P4"] { color: var(--b3-theme-success); }
.damophus-priority-chip[data-priority="other"] { color: var(--b3-theme-on-surface-light); }
.damophus-priority-chip[data-complete="true"] { opacity: .7; }
.damophus-priority-chip[data-complete="true"][data-priority="P1"] { animation: damophus-priority-p1 .8s ease both; }
.damophus-priority-chip[data-complete="true"][data-priority="P2"] { animation: damophus-priority-p2 .8s ease both; }
.damophus-priority-chip[data-complete="true"][data-priority="P3"] { animation: damophus-priority-p3 .8s ease both; }
.damophus-priority-chip[data-complete="true"][data-priority="P4"] { animation: damophus-priority-p4 .8s ease both; }
.damophus-priority-chip[data-complete="true"][data-priority="other"] { animation: damophus-priority-other .5s ease both; }
.damophus-priority-total {
  margin-inline-start: 2px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
@keyframes damophus-priority-p1 {
  0%, 100% { transform: scale(1); }
  35% { transform: scale(1.18); box-shadow: 0 0 0 4px color-mix(in srgb, var(--b3-theme-error) 18%, transparent); }
}
@keyframes damophus-priority-p2 {
  0%, 100% { transform: translateY(0); }
  30%, 65% { transform: translateY(-4px); }
}
@keyframes damophus-priority-p3 {
  0%, 100% { background: color-mix(in srgb, currentColor 10%, transparent); }
  50% { background: color-mix(in srgb, currentColor 30%, transparent); }
}
@keyframes damophus-priority-p4 {
  0% { transform: rotate(0); }
  35% { transform: rotate(-4deg); }
  70% { transform: rotate(4deg); }
  100% { transform: rotate(0); }
}
@keyframes damophus-priority-other {
  0%, 100% { opacity: .7; }
  50% { opacity: .35; }
}
@media (prefers-reduced-motion: reduce) {
  .damophus-priority-chip[data-complete="true"] { animation: none; }
}
`;

interface CounterState {
  element: HTMLElement;
  originalHTML: string;
}

/** Decorates SiYuan's native counter without replacing the native review surface. */
export class NativeReviewCounter {
  private observer?: MutationObserver;
  private readonly states = new Map<HTMLElement, CounterState>();
  private readonly completed = new Set<string>();
  private readonly animated = new Set<ReviewPriorityBucket>();
  private queue: ReviewCounterCard[] = [];
  private lastCounts = new Map<ReviewPriorityBucket, number>();
  private renderQueued = false;

  constructor(private readonly options: NativeReviewCounterOptions) {}

  install(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scheduleRender());
    if (this.options.documentRef.body) {
      this.observer.observe(this.options.documentRef.body, { childList: true, subtree: true });
    }
    this.render();
  }

  setQueue(cards: readonly ReviewCounterCard[]): void {
    const nextIds = new Set(cards.map((card) => card.cardID));
    for (const cardID of [...this.completed]) {
      if (!nextIds.has(cardID)) this.completed.delete(cardID);
    }
    this.queue = cards.map((card) => ({ ...card }));
    this.animated.clear();
    this.lastCounts = this.counts();
    this.scheduleRender();
  }

  markReviewed(cardID: string, actionType: string): void {
    if (actionType === "-2") return;
    if (this.queue.some((card) => card.cardID === cardID)) {
      this.completed.add(cardID);
      this.scheduleRender();
    }
  }

  refresh(): void {
    this.scheduleRender();
  }

  uninstall(): void {
    this.observer?.disconnect();
    this.observer = undefined;
    for (const state of this.states.values()) state.element.innerHTML = state.originalHTML;
    this.states.clear();
    this.queue = [];
    this.completed.clear();
    this.animated.clear();
    this.lastCounts.clear();
    this.options.documentRef.getElementById(STYLE_ID)?.remove();
  }

  private scheduleRender(): void {
    if (this.renderQueued) return;
    this.renderQueued = true;
    queueMicrotask(() => {
      this.renderQueued = false;
      this.render();
    });
  }

  private render(): void {
    const counts = this.counts();
    const completedPriorities = new Set<ReviewPriorityBucket>();
    for (const priority of PRIORITIES) {
      if ((this.lastCounts.get(priority) ?? 0) > 0 && counts.get(priority) === 0) {
        completedPriorities.add(priority);
        this.animated.add(priority);
      }
    }
    this.lastCounts = counts;
    if (this.queue.length === 0) {
      for (const element of this.options.documentRef.querySelectorAll<HTMLElement>(
        '.card__main [data-type="count"]',
      )) element.classList.add("fn__none");
      return;
    }
    for (const element of this.options.documentRef.querySelectorAll<HTMLElement>(
      '.card__main [data-type="count"]',
    )) {
      if (!element.hasAttribute("data-damophus-priority-counter")) {
        this.states.set(element, { element, originalHTML: element.innerHTML });
      }
      element.setAttribute("data-damophus-priority-counter", "true");
      element.classList.remove("fn__none");
      element.classList.add("damophus-priority-counter");
      const markup = PRIORITIES.map((priority) => {
        const count = counts.get(priority) ?? 0;
        const complete = completedPriorities.has(priority) || this.animated.has(priority);
        return `<span class="damophus-priority-chip" data-priority="${priority}" data-count="${count}" data-complete="${complete}">
          <span>${priority === "other" ? "其他" : priority}</span><strong>${count}</strong>
        </span>`;
      }).join("") + `<span class="damophus-priority-total" aria-label="剩余闪卡">共 ${this.queue.length - this.completed.size}</span>`;
      if (element.innerHTML !== markup) element.innerHTML = markup;
    }
    this.ensureStyle();
  }

  private counts(): Map<ReviewPriorityBucket, number> {
    const counts = new Map<ReviewPriorityBucket, number>(PRIORITIES.map((priority) => [priority, 0]));
    for (const card of this.queue) {
      if (this.completed.has(card.cardID)) continue;
      counts.set(card.priority, (counts.get(card.priority) ?? 0) + 1);
    }
    return counts;
  }

  private ensureStyle(): void {
    if (this.options.documentRef.getElementById(STYLE_ID)) return;
    const style = this.options.documentRef.createElement("style");
    style.id = STYLE_ID;
    style.textContent = COUNTER_STYLE;
    this.options.documentRef.head?.append(style);
  }
}

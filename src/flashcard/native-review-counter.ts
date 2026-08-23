import type { FlashcardPriorityTag } from "./priority-tags";
import { DEFAULT_FLASHCARD_SETTINGS } from "./types";
import type { FlashcardReviewStatKey, FlashcardReviewStatsSettings } from "./types";
import { reviewStatDisplay, type ReviewCardStats } from "./review-stats";

export type ReviewPriorityBucket = FlashcardPriorityTag | "other";

export interface ReviewCounterCard {
  cardID: string;
  priority: ReviewPriorityBucket;
  stats?: ReviewCardStats;
}

export interface NativeReviewCounterOptions {
  documentRef: Document;
  getStatsSettings?: () => FlashcardReviewStatsSettings;
}

const PRIORITIES: readonly ReviewPriorityBucket[] = ["P1", "P2", "P3", "P4", "other"];
const STYLE_ID = "damophus-native-review-counter-style";
const STAT_ICONS: Record<FlashcardReviewStatKey, string> = {
  reviews: "iconHistory",
  lastReview: "iconClock",
  lapses: "iconCloseRound",
  lapseRate: "iconTags",
  interval: "iconCalendar",
};

const COUNTER_STYLE = `
.damophus-priority-counter {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  max-width: min(80vw, 760px);
  overflow-x: auto;
  scrollbar-width: none;
  white-space: nowrap;
  min-width: max-content;
  line-height: 1.2;
}
.damophus-counter-row {
  display: flex;
  align-items: center;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  flex: 0 0 auto;
  min-height: 32px;
  box-sizing: border-box;
  padding: 3px 8px;
  background: var(--b3-theme-surface);
  border-bottom: .5px solid var(--b3-theme-background-light);
  overflow: hidden;
}
.damophus-mobile-counter-row {
  justify-content: flex-end;
  padding-inline: 0;
}
.damophus-mobile-counter-row > .damophus-priority-counter {
  flex: 0 1 auto;
  width: auto;
  max-width: 100%;
  min-width: 0;
  justify-content: flex-end;
}
.damophus-counter-row > .damophus-priority-counter {
  flex: 1 1 auto;
  width: 100%;
  max-width: none;
  min-width: 0;
  justify-content: flex-start;
  flex-wrap: nowrap;
  overflow-x: hidden;
  overflow-y: hidden;
  white-space: nowrap;
  gap: 7px;
  padding: 0 2px;
}
.damophus-counter-row > .damophus-priority-counter > *,
.damophus-counter-row .damophus-review-stats > * {
  flex: 0 0 auto;
  min-width: max-content;
}
.damophus-counter-row .damophus-review-stats {
  flex: 0 0 auto;
}
.damophus-counter-row .damophus-priority-chip,
.damophus-counter-row .damophus-priority-total,
.damophus-counter-row .damophus-review-stat {
  font-size: 0;
  white-space: nowrap;
  word-spacing: 0;
  letter-spacing: 0;
}
.damophus-counter-row .damophus-priority-chip {
  flex: 0 0 auto;
  min-width: 0;
  padding: 3px 5px;
  gap: 3px;
}
.damophus-counter-row .damophus-priority-total {
  margin-inline-start: 0;
}
.damophus-counter-row .damophus-review-stats {
  margin-inline-start: 0;
  gap: 6px;
}
.damophus-counter-row .damophus-priority-chip strong,
.damophus-counter-row .damophus-priority-total strong,
.damophus-counter-row .damophus-review-stat strong {
  font-size: 12px;
  line-height: 1;
  white-space: nowrap;
  word-spacing: 0;
  letter-spacing: 0;
}
.damophus-priority-counter::-webkit-scrollbar { display: none; }
.damophus-priority-segment,
.damophus-counter-details {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  min-width: max-content;
}
.damophus-counter-details {
  gap: 0;
}
.damophus-counter-row > .damophus-counter-details {
  flex: 1 1 auto;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  box-sizing: border-box;
  overflow-x: hidden;
  overflow-y: hidden;
  justify-content: flex-start;
  padding: 0 2px;
}
.damophus-mobile-counter-row > .damophus-counter-details {
  padding-inline: 0;
}
.damophus-counter-row,
.damophus-counter-row > .damophus-priority-counter,
.damophus-counter-row > .damophus-counter-details,
.damophus-counter-details-copy {
  scrollbar-width: none;
}
.damophus-counter-row::-webkit-scrollbar,
.damophus-counter-row > .damophus-priority-counter::-webkit-scrollbar,
.damophus-counter-row > .damophus-counter-details::-webkit-scrollbar,
.damophus-counter-details-copy::-webkit-scrollbar { display: none; }
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
.damophus-counter-icon {
  width: 14px;
  height: 14px;
  flex: 0 0 14px;
}
.damophus-priority-label,
.damophus-priority-total-label,
.damophus-review-stat-label { display: none; }
.damophus-priority-chip[data-count="0"] { opacity: .42; }
.damophus-priority-chip[data-active="true"] {
  opacity: 1;
  background: color-mix(in srgb, currentColor 24%, transparent);
  border-color: currentColor;
  box-shadow: 0 0 0 2px color-mix(in srgb, currentColor 18%, transparent);
  font-weight: 750;
}
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
  display: inline-flex;
  align-items: center;
  gap: 3px;
  margin-inline-start: 2px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.damophus-review-stats {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  margin-inline-start: 5px;
  color: var(--b3-theme-on-surface-light);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.damophus-review-stat {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 5px;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 4px;
  background: color-mix(in srgb, currentColor 6%, transparent);
}
[data-damophus-density="expanded"] .damophus-priority-label,
[data-damophus-density="expanded"] .damophus-priority-total-label,
[data-damophus-density="expanded"] .damophus-review-stat-label { display: inline; }
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
  originalParent: HTMLElement | null;
  originalNextSibling: ChildNode | null;
  inlineRequiredWidth?: number;
  priorityRequiredWidth?: number;
}

/** Decorates SiYuan's native counter without replacing the native review surface. */
export class NativeReviewCounter {
  private observer?: MutationObserver;
  private resizeObserver?: ResizeObserver;
  private readonly states = new Map<HTMLElement, CounterState>();
  private readonly completed = new Set<string>();
  private readonly animated = new Set<ReviewPriorityBucket>();
  private queue: ReviewCounterCard[] = [];
  private activeCardID?: string;
  private lastCounts = new Map<ReviewPriorityBucket, number>();
  private renderQueued = false;

  constructor(private readonly options: NativeReviewCounterOptions) {}

  install(): void {
    if (this.observer) return;
    this.observer = new MutationObserver(() => this.scheduleRender());
    if (typeof ResizeObserver !== "undefined") {
      this.resizeObserver = new ResizeObserver(() => this.scheduleRender());
    }
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
    if (this.activeCardID && !nextIds.has(this.activeCardID)) this.activeCardID = undefined;
    this.animated.clear();
    this.lastCounts = this.counts();
    this.scheduleRender();
  }

  setActiveCard(cardID: string | undefined): void {
    this.activeCardID = cardID;
    this.scheduleRender();
  }

  updateCardStats(cardID: string, stats: ReviewCardStats): void {
    const card = this.queue.find((candidate) => candidate.cardID === cardID);
    if (!card) return;
    card.stats = { ...card.stats, ...stats };
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
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;
    for (const state of this.states.values()) {
      state.element.innerHTML = state.originalHTML;
      if (state.originalParent && state.element.parentElement !== state.originalParent) {
        state.originalParent.insertBefore(state.element, state.originalNextSibling);
      }
    }
    for (const row of this.options.documentRef.querySelectorAll<HTMLElement>(".damophus-counter-row")) row.remove();
    this.states.clear();
    this.queue = [];
    this.completed.clear();
    this.activeCardID = undefined;
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
      for (const row of this.options.documentRef.querySelectorAll<HTMLElement>(".damophus-counter-row")) {
        row.classList.add("fn__none");
      }
      return;
    }
    for (const element of this.options.documentRef.querySelectorAll<HTMLElement>(
      '.card__main [data-type="count"]',
    )) {
      if (!element.hasAttribute("data-damophus-priority-counter")) {
        this.states.set(element, {
          element,
          originalHTML: element.innerHTML,
          originalParent: element.parentElement,
          originalNextSibling: element.nextSibling,
        });
      }
      element.setAttribute("data-damophus-priority-counter", "true");
      element.classList.remove("fn__none");
      element.classList.add("damophus-priority-counter");
      const markup = this.renderMarkup(counts, completedPriorities);
      this.updateMarkup(element, markup);
      this.ensureCounterLayout(element);
      element.closest<HTMLElement>(".damophus-counter-row")?.classList.remove("fn__none");
      element.setAttribute("data-damophus-density", this.densityFor(element));
      this.observeLayout(element);
    }
    this.ensureStyle();
  }

  private updateMarkup(element: HTMLElement, markup: string): void {
    const template = this.options.documentRef.createElement("template");
    template.innerHTML = markup;
    const nextPriority = template.content.querySelector<HTMLElement>(".damophus-priority-segment");
    const nextDetails = template.content.querySelector<HTMLElement>(".damophus-counter-details");
    const currentPriority = element.querySelector<HTMLElement>(".damophus-priority-segment");
    const currentDetails = element.querySelector<HTMLElement>(".damophus-counter-details");
    if (!nextPriority || !nextDetails || !currentPriority || !currentDetails) {
      if (element.innerHTML !== markup) element.innerHTML = markup;
      return;
    }
    if (currentPriority.innerHTML !== nextPriority.innerHTML) currentPriority.innerHTML = nextPriority.innerHTML;
    if (currentDetails.innerHTML !== nextDetails.innerHTML) currentDetails.innerHTML = nextDetails.innerHTML;
  }

  private ensureCounterLayout(element: HTMLElement): void {
    const root = element.closest<HTMLElement>(".card__main");
    if (!root) return;
    const toolbar = root.querySelector<HTMLElement>(".toolbar, .block__icons");
    if (!toolbar) return;
    const state = this.states.get(element);
    if (!state) return;
    const details = element.querySelector<HTMLElement>(".damophus-counter-details");
    let row = [...root.children].find((child): child is HTMLElement =>
      child.classList.contains("damophus-counter-row"),
    );
    const isMobile = toolbar.classList.contains("toolbar");
    const width = toolbar.clientWidth || toolbar.getBoundingClientRect().width;
    if (!details) return;
    if (!details.classList.contains("fn__none") && element.parentElement !== row) {
      state.inlineRequiredWidth = toolbar.scrollWidth;
    }
    const fullFits = width <= 0 || (state.inlineRequiredWidth ?? toolbar.scrollWidth) <= width + 1;
    if (isMobile) {
      details.classList.remove("fn__none");
      row ??= this.createCounterRow(toolbar);
      row.querySelector(".damophus-counter-details-copy")?.remove();
      if (element.parentElement !== row) row.append(element);
      return;
    }
    const detailsInRow = isMobile || !fullFits;
    if (detailsInRow) {
      details.classList.add("fn__none");
      if (element.parentElement !== row) {
        state.priorityRequiredWidth = toolbar.scrollWidth;
      }
      const priorityFits = isMobile || width <= 0 || (state.priorityRequiredWidth ?? Number.POSITIVE_INFINITY) <= width + 1;
      if (!priorityFits && !row) {
        row = this.createCounterRow(toolbar);
      } else if (detailsInRow && !row) {
        row = this.createCounterRow(toolbar);
      }
      if (row) {
        this.syncDetailsCopy(row, details);
        if (priorityFits) {
          this.restoreInline(element);
        } else if (element.parentElement !== row) {
          row.append(element);
        }
      }
      return;
    }
    details.classList.remove("fn__none");
    row?.querySelector(".damophus-counter-details-copy")?.remove();
    if (element.parentElement === row) this.restoreInline(element);
    if (row && !row.firstElementChild) row.remove();
  }

  private createCounterRow(toolbar: HTMLElement): HTMLElement {
    const row = this.options.documentRef.createElement("div");
    row.className = toolbar.classList.contains("toolbar")
      ? "damophus-counter-row damophus-mobile-counter-row"
      : "damophus-counter-row";
    toolbar.insertAdjacentElement("afterend", row);
    return row;
  }

  private syncDetailsCopy(row: HTMLElement, details: HTMLElement): void {
    let copy = row.querySelector<HTMLElement>(".damophus-counter-details-copy");
    if (!copy) {
      copy = this.options.documentRef.createElement("div");
      copy.className = "damophus-counter-details damophus-counter-details-copy";
      row.append(copy);
    }
    if (copy.innerHTML !== details.innerHTML) copy.innerHTML = details.innerHTML;
  }

  private restoreInline(element: HTMLElement): void {
    const state = this.states.get(element);
    if (!state?.originalParent || element.parentElement === state.originalParent) return;
    state.originalParent.insertBefore(element, state.originalNextSibling);
  }

  private observeLayout(element: HTMLElement): void {
    if (!this.resizeObserver) return;
    const root = element.closest<HTMLElement>(".card__main");
    const toolbar = root?.querySelector<HTMLElement>(".toolbar, .block__icons");
    if (toolbar) this.resizeObserver.observe(toolbar);
    if (root) this.resizeObserver.observe(root);
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

  private densityFor(element: HTMLElement): "compact" | "expanded" {
    const layout = element.closest<HTMLElement>(".toolbar, .block__icons, .card__main") ?? element.parentElement ?? element;
    const width = layout.getBoundingClientRect().width;
    return width >= 1100 ? "expanded" : "compact";
  }

  private renderMarkup(
    counts: Map<ReviewPriorityBucket, number>,
    completedPriorities: Set<ReviewPriorityBucket>,
  ): string {
    const chips = PRIORITIES.map((priority) => {
      const count = counts.get(priority) ?? 0;
      const complete = completedPriorities.has(priority) || this.animated.has(priority);
      const active = this.queue.some((card) => card.cardID === this.activeCardID && card.priority === priority);
      const label = priority === "other" ? "其他" : priority;
      return `<span class="damophus-priority-chip" data-priority="${priority}" data-count="${count}" data-complete="${complete}" data-active="${active}" title="${label} ${count}" aria-label="${label} ${count}">
        <svg class="damophus-counter-icon" aria-hidden="true"><use href="#iconTags"></use></svg>
        <span class="damophus-priority-label">${label}</span><strong>${count}</strong>
      </span>`;
    }).join("");
    return `<span class="damophus-priority-segment">${chips}</span>`
      + `<span class="damophus-counter-details"><span class="damophus-priority-total" title="共 ${this.queue.length - this.completed.size}" aria-label="剩余闪卡"><svg class="damophus-counter-icon" aria-hidden="true"><use href="#iconRiffCard"></use></svg><span class="damophus-priority-total-label">共</span> <strong>${this.queue.length - this.completed.size}</strong></span>${this.renderStats()}</span>`;
  }

  private renderStats(): string {
    const settings = this.options.getStatsSettings?.() ?? DEFAULT_FLASHCARD_SETTINGS.reviewStats;
    const card = this.queue.find((candidate) => candidate.cardID === this.activeCardID);
    if (!settings.enabled || !card?.stats) return "";
    const keys = settings.order.filter((key) => settings.visible[key]);
    if (keys.length === 0) return "";
    return `<span class="damophus-review-stats" data-testid="damophus-review-stats">${keys.map((key) =>
      (() => {
        const display = reviewStatDisplay(key, card.stats!);
        const text = `${display.label} ${display.value}`;
        return `<span class="damophus-review-stat" data-stat-key="${key}" title="${text}" aria-label="${text}"><svg class="damophus-counter-icon" aria-hidden="true"><use href="#${STAT_ICONS[key]}"></use></svg><span class="damophus-review-stat-label">${display.label}</span><strong>${display.value}</strong></span>`;
      })(),
    ).join("")}</span>`;
  }
}

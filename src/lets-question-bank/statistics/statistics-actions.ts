import { getLogger } from "@/libs/logger";
const log = getLogger("question-bank.practice");
import { buildStatistics, type StatisticsQuestion, type StatisticsRange, type StatisticsSnapshot, type StatisticsSort } from "@/question-bank/core/statistics";
import {
  normalizeSubjectQuestionTotals,
  normalizeStatisticsLayout,
  type StatisticsLayout,
  type SubjectQuestionTotals,
} from "@/question-bank/core/subject-dashboard";
import type { TopicDictionaryDocument } from "@/question-bank/topic-dictionary";
import type { AttemptEvent } from "@/question-bank/core/types";
import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
import type { AttemptAggregate } from "@/question-bank/core/types";
import type { RiffCard } from "@/question-bank/adapters/siyuan/riff";
import type { AttemptImportPreview, AttemptImportResult } from "@/question-bank/application/recovery";
import type { QuestionBankUiController } from "../controller";

/** Live view of the component state the statistics actions read and write. */
export interface StatisticsActionsState {
  view: "practice" | "statistics" | "mapping";
  statisticsSnapshot: StatisticsSnapshot | undefined;
  statisticsTopicDictionary: TopicDictionaryDocument | undefined;
  subjectQuestionTotals: SubjectQuestionTotals;
  subjectTotalsSaveStatus: "idle" | "saving" | "saved" | "error";
  statisticsLayout: StatisticsLayout;
  statisticsLoading: boolean;
  statisticsRange: StatisticsRange;
  statisticsSort: StatisticsSort;
  importSource: string;
  importPreview: AttemptImportPreview | undefined;
  importResult: AttemptImportResult | undefined;
  preview: QuestionIndexPreview | undefined;
  syncComplete: boolean;
  aggregates: ReadonlyMap<string, AttemptAggregate>;
  dueCards: ReadonlyMap<string, RiffCard>;
  error: string;
  cachedStatisticsQuestions: StatisticsQuestion[] | undefined;
  cachedAttemptEvents: AttemptEvent[] | undefined;
}

export function createStatisticsActions(deps: {
  state: StatisticsActionsState;
  controller: QuestionBankUiController;
  loadTopicDictionary: (() => Promise<TopicDictionaryDocument>) | undefined;
  now: () => number;
  run: (operation: () => Promise<void>) => Promise<void>;
  applyIndexSync: (target: QuestionIndexPreview) => Promise<QuestionIndexPreview>;
}) {
  const { state, controller, run, now } = deps;

  function loadStatistics(forceRefresh = false): void {
    if (!controller.loadStatisticsQuestions || !controller.loadAttemptEvents) {
      state.statisticsSnapshot = undefined;
      return;
    }
    if (!forceRefresh && state.cachedStatisticsQuestions && state.cachedAttemptEvents) {
      state.statisticsSnapshot = buildStatistics(
        state.cachedStatisticsQuestions,
        state.cachedAttemptEvents,
        state.statisticsRange,
        now(),
        state.statisticsSort,
      );
      return;
    }
    void run(async () => {
      state.statisticsLoading = true;
      try {
        const [statisticsQuestions, attempts, dictionary] = await Promise.all([
          controller.loadStatisticsQuestions!(),
          controller.loadAttemptEvents!(),
          deps.loadTopicDictionary?.().catch((dictionaryError) => {
            log.warn("statistics.topic-dictionary-unavailable", dictionaryError);
            return undefined;
          }),
        ]);
        state.cachedStatisticsQuestions = statisticsQuestions;
        state.cachedAttemptEvents = attempts;
        state.statisticsTopicDictionary = dictionary;
        state.statisticsSnapshot = buildStatistics(
          statisticsQuestions,
          attempts,
          state.statisticsRange,
          now(),
          state.statisticsSort,
        );
      } finally {
        state.statisticsLoading = false;
      }
    });
  }

  function selectView(next: "practice" | "statistics" | "mapping"): void {
    state.view = next;
    if (next === "statistics") loadStatistics(true);
  }

  function changeStatisticsRange(value: StatisticsRange): void {
    state.statisticsRange = value;
    loadStatistics(false);
  }

  function changeStatisticsSort(value: StatisticsSort): void {
    state.statisticsSort = value;
    loadStatistics(false);
  }

  async function changeSubjectQuestionTotal(subjectId: string, rawValue: string): Promise<void> {
    const next = {...state.subjectQuestionTotals};
    const total = Number(rawValue);
    if (rawValue.trim() && Number.isFinite(total) && total > 0) next[subjectId] = Math.floor(total);
    else delete next[subjectId];
    state.subjectQuestionTotals = normalizeSubjectQuestionTotals(next);
    state.subjectTotalsSaveStatus = "saving";
    try {
      if (controller.saveSetting) await controller.saveSetting("statisticsSubjectQuestionTotals", state.subjectQuestionTotals);
      else await controller.setSetting?.("statisticsSubjectQuestionTotals", state.subjectQuestionTotals);
      state.subjectTotalsSaveStatus = "saved";
    } catch (saveError) {
      state.subjectTotalsSaveStatus = "error";
      state.error = saveError instanceof Error ? saveError.message : String(saveError);
    }
  }

  function changeStatisticsLayout(next: StatisticsLayout): void {
    state.statisticsLayout = normalizeStatisticsLayout(next);
    controller.setSetting?.("statisticsLayout", state.statisticsLayout);
  }

  function confirmSync(): void {
    if (!state.preview) return;
    void run(async () => {
      state.preview = await deps.applyIndexSync(state.preview!);
      if (state.syncComplete) {
        state.aggregates = await controller.loadAggregates();
        state.dueCards = await controller.loadDueCards(state.preview!.scan.blockIdsByQuestionId);
      }
    });
  }

  function exportAttempts(): void {
    void run(async () => {
      const source = await controller.exportAttempts();
      const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `damophus-attempts-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  async function selectImportFile(event: Event): Promise<void> {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    await run(async () => {
      state.importSource = await file.text();
      state.importResult = undefined;
      state.importPreview = await controller.previewImport(state.importSource);
    });
    input.value = "";
  }

  function confirmImport(): void {
    if (!state.importPreview) return;
    void run(async () => {
      state.importResult = await controller.confirmImport(state.importSource, state.importPreview!.token);
      state.importPreview = undefined;
      state.aggregates = await controller.loadAggregates();
    });
  }

  return {
    loadStatistics,
    selectView,
    changeStatisticsRange,
    changeStatisticsSort,
    changeSubjectQuestionTotal,
    changeStatisticsLayout,
    confirmSync,
    exportAttempts,
    selectImportFile,
    confirmImport,
  };
}

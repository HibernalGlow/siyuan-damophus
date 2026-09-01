import type { QuestionBankBinding, QuestionBankInitializationPreview, QuestionBankRebindingPreview } from "@/question-bank/adapters/siyuan/binding";
import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
import type { TopicRelationPreview } from "@/question-bank/adapters/siyuan/topic-index";
import type { Question, AttemptAggregate, QuestionBookmark } from "@/question-bank/core/types";
import type { RiffCard } from "@/question-bank/adapters/siyuan/riff";
import type { PracticeSessionSnapshot } from "@/question-bank/core";
import type { QuestionBankUiController, SourceBlockIdentity } from "../controller";
import { hasPendingSync } from "../mapping/mapping-actions";

/**
 * Live view of the component state driving document scanning, initialization
 * and rebinding. Timers for auto-scan live in this module's closure.
 */
export interface DocumentScanActionsState {
  documentId: string;
  autoScanDocument: boolean;
  includeSubdocuments: boolean;
  autoSyncIndex: boolean;
  busy: boolean;
  binding: QuestionBankBinding | undefined;
  initializationPreview: QuestionBankInitializationPreview | undefined;
  systemDocumentId: string;
  rebindingPreview: QuestionBankRebindingPreview | undefined;
  preview: QuestionIndexPreview | undefined;
  topicRelationPreview: TopicRelationPreview | undefined;
  sourceIdentity: SourceBlockIdentity | undefined;
  syncComplete: boolean;
  topicId: string;
  queue: Question[];
  currentQuestion: Question | undefined;
  complete: boolean;
  answerCardOpen: boolean;
  completedQuestionIndices: number[];
  recoverableSession: PracticeSessionSnapshot | undefined;
  scanPanelOpen: boolean;
  scanPanelUserControlled: boolean;
  aggregates: ReadonlyMap<string, AttemptAggregate>;
  bookmarks: ReadonlyMap<string, QuestionBookmark>;
  dueCards: ReadonlyMap<string, RiffCard>;
}

export function createDocumentScanActions(deps: {
  state: DocumentScanActionsState;
  controller: QuestionBankUiController;
  getCurrentDocumentId: (() => string | undefined) | undefined;
  run: (operation: () => Promise<void>) => Promise<void>;
  refreshStoredSessions: () => Promise<void>;
  runIndexSync: (target: QuestionIndexPreview) => Promise<QuestionIndexPreview>;
  clearTimer: () => void;
}) {
  const { state, controller, run } = deps;
  let autoScanTimer: ReturnType<typeof setTimeout> | undefined;

  function validDocument(): boolean {
    return /^\d{14}-[a-z0-9]{7}$/u.test(state.documentId);
  }

  function invalidateDocumentTarget(): void {
    deps.clearTimer();
    state.initializationPreview = undefined;
    state.preview = undefined;
    state.topicRelationPreview = undefined;
    state.sourceIdentity = undefined;
    state.syncComplete = false;
    state.topicId = "";
    state.queue = [];
    state.currentQuestion = undefined;
    state.complete = false;
    state.answerCardOpen = false;
    state.completedQuestionIndices = [];
    state.recoverableSession = undefined;
    state.scanPanelUserControlled = false;
    scheduleAutoScan();
  }

  function useCurrentDocument(): void {
    const currentDocumentId = deps.getCurrentDocumentId?.();
    if (!currentDocumentId || currentDocumentId === state.documentId) return;
    state.documentId = currentDocumentId;
    invalidateDocumentTarget();
  }

  function scheduleAutoScan(delay = 450): void {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = undefined;
    if (!state.autoScanDocument || !validDocument()) return;
    autoScanTimer = setTimeout(() => {
      autoScanTimer = undefined;
      if (state.busy) {
        scheduleAutoScan(250);
        return;
      }
      scanDocument(false);
    }, delay);
  }

  function invalidateSystemDocumentTarget(): void {
    state.rebindingPreview = undefined;
  }

  function previewInitialization(): void {
    void run(async () => {
      state.initializationPreview = await controller.previewInitialization(state.documentId);
    });
  }

  function confirmInitialization(): void {
    if (!state.initializationPreview) return;
    void run(async () => {
      state.binding = await controller.confirmInitialization(state.initializationPreview!);
      state.initializationPreview = undefined;
    });
  }

  function previewRebinding(): void {
    void run(async () => {
      state.rebindingPreview = await controller.previewRebinding(state.systemDocumentId);
    });
  }

  function confirmRebinding(): void {
    if (!state.rebindingPreview) return;
    void run(async () => {
      state.binding = await controller.confirmRebinding(state.systemDocumentId, state.rebindingPreview!.token);
      state.rebindingPreview = undefined;
    });
  }

  function scanDocument(revealScanSummary = true): void {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = undefined;
    if (revealScanSummary) {
      state.scanPanelUserControlled = true;
      state.scanPanelOpen = true;
    }
    void run(async () => {
      const [nextPreview, nextSourceIdentity, stored] = await Promise.all([
        state.includeSubdocuments
          ? controller.previewSync(state.documentId, true)
          : controller.previewSync(state.documentId),
        controller.loadSourceIdentity(state.documentId),
        controller.loadPracticeSession(state.documentId),
      ]);
      state.preview = nextPreview;
      state.topicRelationPreview = undefined;
      if (nextPreview.blockers.length > 0) state.scanPanelOpen = true;
      state.sourceIdentity = nextSourceIdentity;
      state.recoverableSession = stored?.status === "ok" ? stored.snapshot : undefined;
      state.syncComplete = false;
      if (state.autoSyncIndex && hasPendingSync(nextPreview) && nextPreview.blockers.length === 0) {
        state.preview = await deps.runIndexSync(nextPreview);
      }
      if (state.preview.bindingRepairs.length === 0) {
        [state.aggregates, state.bookmarks, state.dueCards] = await Promise.all([
          controller.loadAggregates(),
          controller.loadBookmarks(),
          controller.loadDueCards(state.preview.scan.blockIdsByQuestionId),
        ]);
      } else {
        state.aggregates = new Map();
        state.bookmarks = new Map();
        state.dueCards = new Map();
      }
      const saved = controller.getRecentScope();
      const savedHeadingBlockId = saved?.documentId === state.documentId ? saved.headingBlockId : undefined;
      const savedTopicId = savedHeadingBlockId
        ? [...state.preview.scan.topicBlockIdsByTopicId].find(([, blockId]) => blockId === savedHeadingBlockId)?.[0]
        : saved?.documentId === state.documentId ? saved.topicId : undefined;
      const topicExists = savedTopicId
        ? state.preview.scan.report.document.topics.some((topic) => topic.id === savedTopicId)
        : false;
      state.topicId = topicExists ? savedTopicId! : "";
      if ((savedHeadingBlockId || savedTopicId) && !topicExists) controller.saveRecentScope({ documentId: state.documentId });
      await deps.refreshStoredSessions();
    });
  }

  function cancelAutoScan(): void {
    if (autoScanTimer) clearTimeout(autoScanTimer);
    autoScanTimer = undefined;
  }

  function dispose(): void {
    if (autoScanTimer) clearTimeout(autoScanTimer);
  }

  return {
    validDocument,
    invalidateDocumentTarget,
    useCurrentDocument,
    scheduleAutoScan,
    cancelAutoScan,
    invalidateSystemDocumentTarget,
    previewInitialization,
    confirmInitialization,
    previewRebinding,
    confirmRebinding,
    scanDocument,
    dispose,
  };
}

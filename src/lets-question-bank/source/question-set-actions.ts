import type { FrozenQuestionSet, QuestionCatalogEntry, QuestionSetBlueprint } from "@/question-bank/assembly";
import type { QuestionIndexBatchPreview } from "@/question-bank/application/batch-indexing";
import type { QuestionSourceDocument } from "@/question-bank/adapters/siyuan/source-catalog";
import type { Question } from "@/question-bank/core/types";
import type { QuestionBankUiController } from "../controller";

/** Live view of the component state the question-set composer reads and writes. */
export interface QuestionSetActionsState {
  composerOpen: boolean;
  sourceDocuments: QuestionSourceDocument[];
  questionCatalog: QuestionCatalogEntry[];
  questionSetBlueprints: QuestionSetBlueprint[];
  assembledQuestions: Question[] | undefined;
  assembledBlockIdsByQuestionId: ReadonlyMap<string, string>;
  assembledSourceKey: string;
  assembledSourceLabel: string;
  pendingFrozenSetLabel: string;
}

export function createQuestionSetActions(deps: {
  state: QuestionSetActionsState;
  controller: QuestionBankUiController;
  run: (operation: () => Promise<void>) => Promise<void>;
  label: (key: string, fallback: string) => string;
  onFrozenSetAssembled: () => Promise<void>;
}) {
  const { state, controller, run } = deps;

  async function loadQuestionSetData(): Promise<void> {
    if (!controller.listQuestionSourceDocuments || !controller.loadQuestionCatalog || !controller.listQuestionSetBlueprints) return;
    [state.sourceDocuments, state.questionCatalog, state.questionSetBlueprints] = await Promise.all([
      controller.listQuestionSourceDocuments(),
      controller.loadQuestionCatalog(),
      controller.listQuestionSetBlueprints(),
    ]);
  }

  function openQuestionSetComposer(): void {
    state.composerOpen = true;
    void run(loadQuestionSetData);
  }

  async function previewSourceSync(documentIds: readonly string[]): Promise<QuestionIndexBatchPreview> {
    if (!controller.previewSyncBatch) throw new Error(deps.label("questionSetIndexUnavailable", "跨文档入库服务尚未连接"));
    return controller.previewSyncBatch(documentIds);
  }

  async function confirmSourceSync(target: QuestionIndexBatchPreview): Promise<QuestionIndexBatchPreview> {
    if (!controller.confirmSyncBatch) throw new Error(deps.label("questionSetIndexUnavailable", "跨文档入库服务尚未连接"));
    const confirmed = await controller.confirmSyncBatch(target.documentIds, target.token);
    await loadQuestionSetData();
    return confirmed;
  }

  function assembleBlueprint(blueprint: QuestionSetBlueprint): FrozenQuestionSet {
    if (!controller.assembleQuestionSet) throw new Error(deps.label("questionSetAssemblyUnavailable", "组卷服务尚未连接"));
    state.pendingFrozenSetLabel = blueprint.name;
    return controller.assembleQuestionSet({
      blueprint,
      catalog: state.questionCatalog,
      sourceRevision: state.questionCatalog.map((entry) => `${entry.questionId}:${entry.blockId}:${entry.indexedAt ?? ""}`).sort().join("|"),
      setId: crypto.randomUUID(),
      seed: crypto.randomUUID(),
    });
  }

  async function saveBlueprint(blueprint: QuestionSetBlueprint): Promise<void> {
    await controller.saveQuestionSetBlueprint?.(blueprint);
    state.questionSetBlueprints = await controller.listQuestionSetBlueprints?.() ?? state.questionSetBlueprints;
  }

  async function removeBlueprint(blueprintId: string): Promise<void> {
    await controller.removeQuestionSetBlueprint?.(blueprintId);
    state.questionSetBlueprints = await controller.listQuestionSetBlueprints?.() ?? [];
  }

  async function hydrateFrozenPracticeSet(frozen: FrozenQuestionSet): Promise<void> {
    if (!controller.hydrateQuestionSources) throw new Error(deps.label("questionSetHydrationUnavailable", "跨文档题源加载服务尚未连接"));
    const hydrated = await controller.hydrateQuestionSources(frozen.question_ids);
    state.assembledQuestions = frozen.question_ids
      .map((questionId) => hydrated.questions.find((question) => question.id === questionId))
      .filter((question): question is Question => Boolean(question));
    state.assembledBlockIdsByQuestionId = hydrated.blockIdsByQuestionId;
    state.assembledSourceKey = frozen.set_id;
    state.assembledSourceLabel = state.pendingFrozenSetLabel || deps.label("questionSet", "跨文档组卷");
    state.composerOpen = false;
    await deps.onFrozenSetAssembled();
  }

  function exportSessionDiagnostic(sourceKey: string): void {
    void run(async () => {
      const source = await controller.exportPracticeSessionDiagnostic(sourceKey);
      const url = URL.createObjectURL(new Blob([source], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `damophus-session-${sourceKey}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    });
  }

  return {
    loadQuestionSetData,
    openQuestionSetComposer,
    previewSourceSync,
    confirmSourceSync,
    assembleBlueprint,
    saveBlueprint,
    removeBlueprint,
    useFrozenPracticeSet: hydrateFrozenPracticeSet,
    exportSessionDiagnostic,
  };
}

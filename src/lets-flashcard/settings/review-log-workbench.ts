import type { FlashcardRuntime } from "@/flashcard/runtime";
import type { FlashcardSettings } from "@/flashcard/types";
import {
  createSiyuanReviewLogReader,
  downloadReviewLog,
  loadReviewLogArchive,
  monthlyReviewLogZip,
  groupReviewLogEntriesByMonth,
  reviewLogToCsv,
  type ReviewLogArchive,
  type ReviewLogCardContext,
} from "@/flashcard/review-log-export";
import type { FsrsOptimizationResult } from "@/flashcard/fsrs-optimizer-protocol";
import type { FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
import type { FsrsWeightHistoryEntry } from "@/flashcard/fsrs-weight-history";

type DocumentPickerValue = string | { id?: string; documentId?: string; blockId?: string; path?: string; hpath?: string; name?: string };

/** Live view of the settings-component state the review-log workbench drives. */
export interface ReviewLogWorkbenchState {
  config: FlashcardSettings;
  message: string;
  reviewLogArchive: ReviewLogArchive | undefined;
  reviewLogLoading: boolean;
  reviewLogContextLoading: boolean;
  reviewLogContextError: string;
  reviewLogContexts: ReviewLogCardContext[];
  reviewLogDocuments: Array<{ id: string; label: string }>;
  filteredReviewLogDocuments: Array<{ id: string; label: string }>;
  optimizerLoading: boolean;
  optimizerApplying: boolean;
  optimizerApplied: boolean;
  optimization: { result: FsrsOptimizationResult; preview: FsrsWeightPreview } | undefined;
  currentFsrsWeights: number[];
  fsrsHistory: FsrsWeightHistoryEntry[];
  fsrsHistoryLoading: boolean;
  fsrsUndoingId: string;
  selectedReviewLogEntries: ReviewLogArchive["entries"];
}

export function createReviewLogWorkbench(deps: {
  state: ReviewLogWorkbenchState;
  runtime: FlashcardRuntime;
  onOptimizeReviewLog: (entries: ReviewLogArchive["entries"]) => Promise<{
    result: FsrsOptimizationResult;
    preview: FsrsWeightPreview;
  }>;
  onApplyFsrsWeights: (weights: number[]) => Promise<boolean>;
  onGetFsrsWeights: () => number[];
  onLoadFsrsHistory: () => Promise<FsrsWeightHistoryEntry[]>;
  onUndoFsrsWeights: (entry: FsrsWeightHistoryEntry) => Promise<boolean>;
  onPickDocument: (value: DocumentPickerValue) => boolean;
}) {
  const { state, runtime } = deps;

  async function openOfficialDocumentPicker(): Promise<void> {
    const host = globalThis as unknown as { siyuan?: Record<string, unknown> };
    const siyuan = host.siyuan;
    const candidates = [
      siyuan?.openDocumentPicker,
      siyuan?.openDocPicker,
      siyuan?.openDocumentSelector,
      (siyuan?.app as Record<string, unknown> | undefined)?.openDocumentPicker,
      (siyuan?.layout as Record<string, unknown> | undefined)?.openDocumentPicker,
    ].filter((candidate): candidate is (...args: unknown[]) => unknown => typeof candidate === "function");
    const picker = candidates[0];
    if (!picker) {
      state.message = "当前思源未公开文档选择器，已提供搜索、文档 ID 和路径输入作为回退";
      return;
    }
    let selected = false;
    const onSelect = (value: unknown) => {
      if (selected || value === undefined || value === null) return;
      selected = true;
      if (typeof value === "string" || typeof value === "object") deps.onPickDocument(value as DocumentPickerValue);
    };
    try {
      const result = picker.call(siyuan, { multiple: false, onSelect, onConfirm: onSelect });
      const resolved = result && typeof (result as Promise<unknown>).then === "function" ? await result : result;
      if (resolved !== undefined && resolved !== null) onSelect(resolved);
    } catch (error) {
      state.message = `调用思源文档选择器失败，已保留搜索回退：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function loadReviewLogContexts(entries: readonly ReviewLogArchive["entries"][number][]): Promise<void> {
    state.reviewLogContextLoading = true;
    state.reviewLogContextError = "";
    try {
      const cardIds = [...new Set(entries.map((entry) => entry.cardId).filter(Boolean))];
      const directRows = await runtime.adapter.loadBlocks(cardIds);
      const blockByCardId = new Map(directRows.map((row) => [row.id, row]));
      const unresolved = cardIds.filter((cardId) => !blockByCardId.has(cardId));
      if (unresolved.length > 0) {
        try {
          const registered = await runtime.adapter.getAllCardsByDeckId(runtime.getSettings().deckId);
          const cardMap = new Map(registered.map((card) => [card.cardID, card.blockID]));
          const mappedBlockIds = unresolved.map((cardId) => cardMap.get(cardId)).filter((id): id is string => Boolean(id));
          const mappedRows = await runtime.adapter.loadBlocks(mappedBlockIds);
          for (const row of mappedRows) {
            const cardId = unresolved.find((candidate) => cardMap.get(candidate) === row.id);
            if (cardId) blockByCardId.set(cardId, row);
          }
        } catch (error) {
          state.reviewLogContextError = `部分旧卡无法反查文档范围：${error instanceof Error ? error.message : String(error)}`;
        }
      }
      const roots = [...new Set([...blockByCardId.values()].map((row) => row.root_id || row.id).filter(Boolean))];
      const rootRows = await runtime.adapter.loadBlocks(roots);
      const rootById = new Map(rootRows.map((row) => [row.id, row]));
      const notebooks = new Map<string, string>((window.siyuan?.notebooks ?? []).map((notebook) => [notebook.id, String(notebook.name ?? notebook.id)]));
      state.reviewLogContexts = cardIds.map((cardId) => {
        const row = blockByCardId.get(cardId);
        const documentId = row?.root_id || (row?.type === "d" ? row.id : undefined);
        const root = documentId ? rootById.get(documentId) : undefined;
        return {
          cardId,
          blockId: row?.id,
          documentId,
          documentPath: root?.hpath || undefined,
          notebookId: row?.box || root?.box,
          notebookName: (row?.box || root?.box) ? notebooks.get(row?.box || root?.box!) : undefined,
        };
      });
    } catch (error) {
      state.reviewLogContexts = [];
      state.reviewLogContextError = `读取卡片范围失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      state.reviewLogContextLoading = false;
    }
  }

  async function scanReviewLogs(): Promise<ReviewLogArchive | undefined> {
    state.reviewLogLoading = true;
    try {
      state.reviewLogArchive = await loadReviewLogArchive(createSiyuanReviewLogReader());
      await loadReviewLogContexts(state.reviewLogArchive.entries);
      state.message = state.reviewLogArchive.entries.length
        ? `已读取 ${state.reviewLogArchive.entries.length} 条复习记录`
        : "没有找到可导出的复习记录";
      return state.reviewLogArchive;
    } catch (error) {
      state.message = `读取复习记录失败：${error instanceof Error ? error.message : String(error)}`;
      return undefined;
    } finally {
      state.reviewLogLoading = false;
    }
  }

  async function exportMergedReviewLog(): Promise<void> {
    const archive = state.reviewLogArchive ?? await scanReviewLogs();
    if (!archive?.entries.length) return;
    try {
      downloadReviewLog(reviewLogToCsv(state.selectedReviewLogEntries), "revlog.csv", "text/csv;charset=utf-8");
      state.message = `已导出合并记录，共 ${state.selectedReviewLogEntries.length} 条`;
    } catch (error) {
      state.message = `导出合并记录失败：${error instanceof Error ? error.message : String(error)}`;
    }
  }

  async function exportMonthlyReviewLogs(): Promise<void> {
    const archive = state.reviewLogArchive ?? await scanReviewLogs();
    if (!archive?.entries.length) return;
    state.reviewLogLoading = true;
    try {
      const selected = state.selectedReviewLogEntries;
      const bytes = await monthlyReviewLogZip({
        ...archive,
        entries: selected,
        entriesByMonth: groupReviewLogEntriesByMonth(selected),
        files: [...groupReviewLogEntriesByMonth(selected).keys()].map((month) => ({ name: `${month}.msgpack`, month })),
      });
      downloadReviewLog(bytes as BlobPart, "siyuan-revlog-by-month.zip", "application/zip");
      state.message = `已导出 ${groupReviewLogEntriesByMonth(selected).size} 个月份和合并记录`;
    } catch (error) {
      state.message = `按月导出失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      state.reviewLogLoading = false;
    }
  }

  async function optimizeReviewLogs(): Promise<void> {
    const archive = state.reviewLogArchive ?? await scanReviewLogs();
    if (!archive?.entries.length || !state.selectedReviewLogEntries.length) {
      state.message = "当前筛选没有可用于训练的记录";
      return;
    }
    state.optimizerLoading = true;
    state.optimizerApplied = false;
    state.optimization = undefined;
    state.message = state.config.fsrsOptimizerMode === "internal" ? "正在思源插件内部训练 FSRS 参数" : "已打开系统浏览器，等待 FSRS 训练完成";
    try {
      state.optimization = await deps.onOptimizeReviewLog(state.selectedReviewLogEntries);
      state.message = `训练完成，用时 ${(state.optimization.result.durationMs / 1000).toFixed(1)} 秒；请预览后确认应用`;
    } catch (error) {
      state.message = `FSRS 优化失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      state.optimizerLoading = false;
    }
  }

  async function applyOptimization(): Promise<void> {
    if (!state.optimization) return;
    state.optimizerApplying = true;
    try {
      state.optimizerApplied = await deps.onApplyFsrsWeights(state.optimization.result.weights);
      if (state.optimizerApplied) {
        state.message = "已写入并回读验证 FSRS 参数";
        await loadFsrsHistory();
        state.currentFsrsWeights = deps.onGetFsrsWeights();
      }
    } catch (error) {
      state.message = `应用 FSRS 参数失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      state.optimizerApplying = false;
    }
  }

  async function loadFsrsHistory(): Promise<void> {
    state.fsrsHistoryLoading = true;
    try {
      state.fsrsHistory = await deps.onLoadFsrsHistory();
    } catch (error) {
      state.message = `读取 FSRS 参数历史失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      state.fsrsHistoryLoading = false;
    }
  }

  async function undoFsrsHistory(entry: FsrsWeightHistoryEntry): Promise<void> {
    if (state.fsrsUndoingId) return;
    state.fsrsUndoingId = entry.id;
    try {
      if (await deps.onUndoFsrsWeights(entry)) {
        state.message = "已撤销这次 FSRS 参数修改，并完成回读验证";
        await loadFsrsHistory();
        state.currentFsrsWeights = deps.onGetFsrsWeights();
      }
    } catch (error) {
      state.message = `撤销 FSRS 参数失败：${error instanceof Error ? error.message : String(error)}`;
    } finally {
      state.fsrsUndoingId = "";
    }
  }

  return {
    openOfficialDocumentPicker,
    scanReviewLogs,
    exportMergedReviewLog,
    exportMonthlyReviewLogs,
    optimizeReviewLogs,
    applyOptimization,
    loadFsrsHistory,
    undoFsrsHistory,
  };
}

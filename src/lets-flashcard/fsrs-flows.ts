import { confirm, showMessage } from "siyuan";
import { plugin } from "@/utils";
import { convertSfpConfig, fetchSfpConfig } from "@/flashcard/sfp-migration";
import { FsrsOptimizerLocalService, loadFsrsOptimizerAssets } from "@/flashcard/fsrs-optimizer-local-service";
import {
  buildFsrsTrainingDataset,
  type FsrsOptimizationResult,
} from "@/flashcard/fsrs-optimizer-protocol";
import { optimizeFsrsInPlugin } from "@/flashcard/fsrs-optimizer-internal";
import { applyFsrsWeights, previewFsrsWeights, type FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
import {
  appendFsrsWeightHistory,
  type FsrsWeightHistoryEntry,
  type FsrsWeightHistoryStorage,
} from "@/flashcard/fsrs-weight-history";
import type { RiffReviewLogEntry } from "@/flashcard/review-log-export";
import type { FlashcardRuntime } from "@/flashcard/runtime";

export interface FlashcardFsrsHost {
  readonly runtime: FlashcardRuntime;
  optimizerService: FsrsOptimizerLocalService | undefined;
  readonly fsrsHistoryStorage: FsrsWeightHistoryStorage;
  getFsrsWeightsFromSettings(): number[];
  reportError(message: string, error: unknown): void;
}

export async function optimizeReviewLog(
  host: FlashcardFsrsHost,
  entries: readonly RiffReviewLogEntry[],
): Promise<{
  result: FsrsOptimizationResult;
  preview: FsrsWeightPreview;
}> {
  const dataset = buildFsrsTrainingDataset(entries);
  if (host.runtime.getSettings().fsrsOptimizerMode === "internal") {
    const result = await optimizeFsrsInPlugin(dataset, { pluginName: plugin.name });
    return { result, preview: previewFsrsWeights(result.weights) };
  }
  const assets = await loadFsrsOptimizerAssets(plugin.name);
  host.optimizerService ??= new FsrsOptimizerLocalService();
  const result = await host.optimizerService.optimize(dataset, assets);
  return { result, preview: previewFsrsWeights(result.weights) };
}

export async function confirmAndApplyFsrsWeights(host: FlashcardFsrsHost, weights: number[]): Promise<boolean> {
  const approved = await new Promise<boolean>((resolve) => {
    confirm(
      "应用 FSRS 参数",
      "将仅替换思源全局闪卡设置中的 19 项 FSRS 权重；保留率、最大间隔、卡片上限和制卡开关保持不变。确认写入并回读验证？",
      () => resolve(true),
      () => resolve(false),
    );
  });
  if (!approved) return false;
  const applied = await applyFsrsWeights(weights);
  await appendFsrsWeightHistory(host.fsrsHistoryStorage, {
    source: "optimizer",
    previous: applied.current,
    next: applied.optimized,
  });
  showMessage("FSRS 参数已写入并回读验证", 4000, "info");
  return true;
}

export async function confirmAndUndoFsrsWeights(
  host: FlashcardFsrsHost,
  entry: FsrsWeightHistoryEntry,
): Promise<boolean> {
  const approved = await new Promise<boolean>((resolve) => {
    confirm(
      "撤销 FSRS 参数修改",
      "将恢复这条历史记录中的上一组 19 项权重，并回读验证。确认继续？",
      () => resolve(true),
      () => resolve(false),
    );
  });
  if (!approved) return false;
  const current = host.getFsrsWeightsFromSettings();
  if (current.length !== entry.next.length) throw new Error("当前 FSRS 参数不可用，无法撤销");
  const applied = await applyFsrsWeights(entry.previous);
  await appendFsrsWeightHistory(host.fsrsHistoryStorage, {
    source: "undo",
    previous: applied.current,
    next: applied.optimized,
  });
  showMessage("FSRS 参数已撤销并回读验证", 4000, "info");
  return true;
}

export async function importSfpConfig(host: FlashcardFsrsHost): Promise<void> {
  try {
    const preview = convertSfpConfig(await fetchSfpConfig(), host.runtime.getSettings());
    const approved = await new Promise<boolean>((resolve) => {
      confirm(
        "导入 SFP 配置",
        `将导入 ${preview.categoryCount} 个分类、${preview.groupCount} 个 SQL 分组（${preview.enabledGroupCount} 个启用），覆盖当前闪卡分组设置。缓存不会导入，确认继续？`,
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!approved) return;
    await host.runtime.importSfpSettings(preview.settings);
    host.runtime.startAutomation();
    showMessage("SFP 配置已导入；缓存将按 DAMO 规则重新生成", 5000);
  } catch (error) {
    host.reportError("导入 SFP 配置失败", error);
  }
}

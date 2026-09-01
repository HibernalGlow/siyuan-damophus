import { mount } from "svelte";
import { getLogger } from "@/libs/logger";
import FlashcardSettings from "./FlashcardSettings.svelte";
import type { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import type { FlashcardCategoryModule } from "@/flashcard/category-module";
import type { NativeReviewTimer } from "@/flashcard/native-review-timer";
import type { NativePriorityControls } from "@/flashcard/native-priority-controls";
import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";
import type { RiffReviewLogEntry } from "@/flashcard/review-log-export";
import type { OpenFlashcardDocument } from "@/flashcard/open-documents";
import type {
  FlashcardGroup,
  FlashcardReviewScope,
} from "@/flashcard/types";
import type {
  FsrsWeightHistoryEntry,
} from "@/flashcard/fsrs-weight-history";
import type { FsrsWeightPreview } from "@/flashcard/fsrs-settings-adapter";
import type { FsrsOptimizationResult } from "@/flashcard/fsrs-optimizer-protocol";

/** Surface of the plugin the central settings mount needs. */
export interface FlashcardSettingsSurfaceHost {
  readonly runtime: FlashcardRuntime;
  readonly categories: FlashcardCategoryModule;
  readonly reviewTimer: NativeReviewTimer;
  readonly priorityControls: NativePriorityControls;
  readonly compat: FlashcardRendererCompat;
  syncBreadcrumbButton(): void;
  reviewGroup(group: FlashcardGroup): Promise<void>;
  reviewAll(): Promise<void>;
  viewResults(group: FlashcardGroup, filtered: boolean): Promise<void>;
  openRawFlow(group: FlashcardGroup): void;
  openFilteredFlow(group: FlashcardGroup): Promise<void>;
  batchPriority(group: FlashcardGroup): Promise<void>;
  importSfpFromSettings(): void;
  reviewScopeCards(scope: FlashcardReviewScope, retryAfterRegistration?: boolean): Promise<void>;
  openMakeScope(scope: FlashcardReviewScope): Promise<void>;
  listOpenDocuments(): Promise<OpenFlashcardDocument[]>;
  locateCard(card: RiffCardRecord): Promise<void>;
  unregisterCard(card: RiffCardRecord): Promise<boolean>;
  optimizeReviewLogFromSettings(entries: readonly RiffReviewLogEntry[]): Promise<{
    result: FsrsOptimizationResult;
    preview: FsrsWeightPreview;
  }>;
  applyFsrsWeightsFromSettings(weights: number[]): Promise<boolean>;
  getFsrsWeightsFromSettings(): number[];
  loadFsrsHistoryFromSettings(): Promise<FsrsWeightHistoryEntry[]>;
  undoFsrsWeightsFromSettings(entry: FsrsWeightHistoryEntry): Promise<boolean>;
  documentPathHighlights(): string[];
  saveDocumentPathHighlights(value: string[]): Promise<void>;
}

export function mountFlashcardSettings(
  host: FlashcardSettingsSurfaceHost,
  target: HTMLElement,
): ReturnType<typeof mount> {
  target.classList.add("damophus-theme-root", "damophus-flashcard-settings-host", "h-full", "min-h-0");
  return mount(FlashcardSettings, {
    target,
    props: {
      runtime: host.runtime,
      onReviewGroup: (group: FlashcardGroup) => void host.reviewGroup(group),
      onMakeGroup: (group: FlashcardGroup) => void host.openMakeScope({
        id: `group:${group.id}`,
        type: "group",
        targetName: group.name,
        groupId: group.id,
        groupName: group.name,
      }),
      onReviewAll: () => void host.reviewAll(),
      onViewResults: (group: FlashcardGroup, filtered: boolean) => void host.viewResults(group, filtered),
      onOpenRaw: (group: FlashcardGroup) => host.openRawFlow(group),
      onOpenFiltered: (group: FlashcardGroup) => void host.openFilteredFlow(group),
      onBatchPriority: (group: FlashcardGroup) => void host.batchPriority(group),
      onImportSfp: () => host.importSfpFromSettings(),
      onReviewScope: (scope: FlashcardReviewScope) => void host.reviewScopeCards(scope),
      onMakeScope: (scope: FlashcardReviewScope) => void host.openMakeScope(scope),
      onLoadOpenDocuments: () => host.listOpenDocuments(),
      documentPathHighlights: host.documentPathHighlights(),
      onDocumentPathHighlightsChange: (value: string[]) => { void host.saveDocumentPathHighlights(value); },
      onLocateCard: (card: RiffCardRecord) => void host.locateCard(card),
      onUnregisterCard: (card: RiffCardRecord) => void host.unregisterCard(card),
      onSetCardPriority: (card: RiffCardRecord, priority: number) => void host.runtime.adapter.setPriority([card], priority),
      onOptimizeReviewLog: (entries: RiffReviewLogEntry[]) => host.optimizeReviewLogFromSettings(entries),
      onApplyFsrsWeights: (weights: number[]) => host.applyFsrsWeightsFromSettings(weights),
      onGetFsrsWeights: () => host.getFsrsWeightsFromSettings(),
      onLoadFsrsHistory: () => host.loadFsrsHistoryFromSettings(),
      onUndoFsrsWeights: (entry: FsrsWeightHistoryEntry) => host.undoFsrsWeightsFromSettings(entry),
      categoryConfig: host.categories.getConfig(),
      onSaveCategoryConfig: async (config) => {
        await host.categories.save(config);
        host.priorityControls.refresh();
      },
      onSettingsChanged: () => {
        host.reviewTimer?.refresh();
        host.priorityControls.refresh();
        if (host.runtime.getSettings().rendererInterceptionEnabled) {
          host.compat.setVisibility(host.runtime.getSettings().rendererVisibility);
          const status = host.compat.install();
          if (!status.installed) getLogger().warn("renderer-compat-unavailable", status.reason);
        } else {
          host.compat.uninstall();
        }
        host.syncBreadcrumbButton();
      },
    },
  });
}

import { showMessage } from "siyuan";
import type { FlashcardRendererCompat } from "@/flashcard/renderer-compat";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import { NativePriorityControls, type ReviewToolbarKey } from "@/flashcard/native-priority-controls";
import type { RiffCardRecord } from "@/flashcard/siyuan-adapter";
import type { FlashcardSettings as FlashcardSettingsConfig } from "@/flashcard/types";

/**
 * Members of the flashcard plugin the priority toolbar callbacks rely on.
 * Everything is public on the plugin; the interface just documents the
 * contract and keeps the toolbar constructible in isolation.
 */
export interface PriorityControlsHost {
  readonly runtime: FlashcardRuntime;
  readonly compat: FlashcardRendererCompat;
  readonly reviewCards: Map<string, RiffCardRecord>;
  currentReviewCard: RiffCardRecord | undefined;
  locateCard(card: RiffCardRecord): Promise<void>;
  unregisterCard(card: RiffCardRecord): Promise<boolean>;
  openSettings(): void;
  toggleRendererOverride(): Promise<void>;
}

export function createNativePriorityControls(host: PriorityControlsHost): NativePriorityControls {
  const controls = new NativePriorityControls({
    documentRef: document,
    getSettings: () => {
      const settings = host.runtime.getSettings();
      return {
        enabled: settings.reviewToolbarEnabled,
        locate: settings.reviewToolbarLocate,
        unregister: settings.reviewToolbarUnregister,
        priority: settings.reviewToolbarPriority,
        workbench: settings.reviewToolbarWorkbench,
        renderer: settings.reviewToolbarRenderer,
        skipBetween: settings.reviewToolbarSkipBetween,
        showExitFocus: settings.reviewToolbarShowExitFocus,
        showBrand: settings.reviewToolbarShowBrand,
        showFilter: settings.reviewToolbarShowFilter,
        showFullscreen: settings.reviewToolbarShowFullscreen,
        reviewToolbarActionOrder: settings.reviewToolbarActionOrder,
        reviewToolbarCustomCss: settings.reviewToolbarCustomCss,
        reviewToolbarStyle: settings.reviewToolbarStyle,
      };
    },
    getCurrentCard: () => host.currentReviewCard,
    resolveCard: async (blockId, root) => {
      const cached = host.reviewCards.get(blockId);
      if (cached) return cached;
      const ids = [
        blockId,
        ...(root ? [...root.querySelectorAll<HTMLElement>("[data-node-id]")].map((node) => node.dataset.nodeId ?? "") : []),
      ].filter(Boolean);
      const cards = await host.runtime.adapter.getCardsByBlockIds(ids);
      const card = cards.find((candidate) => ids.includes(candidate.blockID));
      if (card) host.reviewCards.set(card.blockID, card);
      return card;
    },
    setPriority: (card, priority) => host.runtime.adapter.setPriority([card], priority),
    locate: (card) => host.locateCard(card),
    unregister: (card) => host.unregisterCard(card),
    openWorkbench: () => host.openSettings(),
    isRendererOverrideEnabled: () => host.runtime.getSettings().rendererInterceptionEnabled,
    toggleRendererOverride: () => host.toggleRendererOverride(),
    getRendererVisibility: () => host.runtime.getSettings().rendererVisibility,
    toggleRendererVisibility: async (key) => {
      const settings = host.runtime.getSettings();
      const rendererVisibility = { ...settings.rendererVisibility, [key]: !settings.rendererVisibility[key] };
      await host.runtime.saveSettings({ ...settings, rendererVisibility });
      host.compat.setVisibility(rendererVisibility);
      controls.refresh();
      showMessage(`${key} 隐藏规则已${rendererVisibility[key] ? "启用" : "关闭"}`, 2500, "info");
    },
    toggleToolVisibility: async (key: ReviewToolbarKey) => {
      const settings = host.runtime.getSettings();
      const settingKeys: Record<ReviewToolbarKey, keyof FlashcardSettingsConfig> = {
        locate: "reviewToolbarLocate",
        unregister: "reviewToolbarUnregister",
        priority: "reviewToolbarPriority",
        renderer: "reviewToolbarRenderer",
        workbench: "reviewToolbarWorkbench",
        filter: "reviewToolbarShowFilter",
        fullscreen: "reviewToolbarShowFullscreen",
      };
      const settingKey = settingKeys[key];
      await host.runtime.saveSettings({ ...settings, [settingKey]: !Boolean(settings[settingKey]) });
      controls.refresh();
    },
  });
  return controls;
}

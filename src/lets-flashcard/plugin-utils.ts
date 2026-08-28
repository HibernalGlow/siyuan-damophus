import { plugin } from "@/utils";
import type { FlashcardGroup, FlashcardReviewScope } from "@/flashcard/types";

export const SETTINGS_TAB_TYPE = "damophus-flashcard-settings";

export function settingsTabId(): string {
  return `${plugin.name}${SETTINGS_TAB_TYPE}`;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/gu, "&amp;").replace(/</gu, "&lt;").replace(/>/gu, "&gt;").replace(/"/gu, "&quot;");
}

export interface UnregisterProgressDialog {
  setRemoving(): void;
  setWriting(completed: number, total: number): void;
  destroy(): void;
}

export function scopeActionLabel(scope: FlashcardReviewScope): string {
  if (scope.type === "group") return scope.groupName ?? scope.targetName;
  return scope.groupName ? `${scope.targetName} · ${scope.groupName}` : `${scope.targetName} · 全部闪卡`;
}

export function makeScope(
  type: "document" | "notebook",
  targetId: string,
  targetName: string,
  group?: FlashcardGroup,
): FlashcardReviewScope {
  return {
    id: `${type}:${targetId}:${group?.id ?? "all"}`,
    type,
    targetId,
    targetName,
    groupId: group?.id,
    groupName: group?.name,
  };
}

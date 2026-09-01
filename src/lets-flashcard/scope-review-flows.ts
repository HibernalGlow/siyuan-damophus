import { confirm, showMessage } from "siyuan";
import { openDocumentFlow } from "@/flashcard/document-flow";
import { priorityTag } from "@/flashcard/priority-tags";
import type { DueCardsData } from "@/flashcard/siyuan-adapter";
import type {
  FlashcardBlockRow,
  FlashcardGroup,
  FlashcardReviewScope,
  FlashcardRoot,
} from "@/flashcard/types";
import type { FlashcardRuntime } from "@/flashcard/runtime";
import type { RegistrationResultsOptions } from "./results-dialogs";

/**
 * The scope review flows only talk to the plugin through this surface so the
 * flows stay replaceable in tests (fake hosts stub these methods directly).
 */
export interface FlashcardScopeReviewHost {
  readonly runtime: FlashcardRuntime;
  reportError(message: string, error: unknown): void;
  openNativeReview(title: string, due: DueCardsData, scope?: FlashcardReviewScope): Promise<void>;
  openScopeRegistration(scope: FlashcardReviewScope, label: string, due: DueCardsData): Promise<void>;
  openRegistrationResults(options: RegistrationResultsOptions): Promise<void>;
  reviewScopeCards(scope: FlashcardReviewScope, retryAfterRegistration?: boolean): Promise<void>;
  reviewGroup(group: FlashcardGroup): Promise<void>;
}

export async function reviewAllCards(host: FlashcardScopeReviewHost): Promise<void> {
  try {
    const due = await host.runtime.buildAllDueCards();
    await host.openNativeReview("到期：所有闪卡", due);
  } catch (error) {
    host.reportError("获取全部到期闪卡失败", error);
  }
}

export async function reviewGroupCards(host: FlashcardScopeReviewHost, group: FlashcardGroup): Promise<void> {
  await host.reviewScopeCards({
    id: `group:${group.id}`,
    type: "group",
    targetName: group.name,
    groupId: group.id,
    groupName: group.name,
  });
}

export async function reviewScopeCardsFlow(
  host: FlashcardScopeReviewHost,
  scope: FlashcardReviewScope,
  retryAfterRegistration = false,
): Promise<void> {
  try {
    let due = await host.runtime.buildScopeDueCards(scope, true);
    if (retryAfterRegistration && due.cards.length === 0 && (due.candidateCount ?? 0) > 0 && (due.registeredCount ?? 0) > 0) {
      for (const delay of [120, 300, 700]) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, delay));
        due = await host.runtime.buildScopeDueCards(scope, true);
        if (due.cards.length > 0) break;
      }
    }
    const label = scope.groupName && scope.type !== "group"
      ? `${scope.targetName} · ${scope.groupName}`
      : scope.groupName ?? scope.targetName;
    if (due.cards.length === 0 && (due.candidateCount ?? 0) > 0) {
      const registered = due.registeredCount;
      if (registered === 0) {
        await host.openScopeRegistration(scope, label, due);
        return;
      }
      showMessage(
        registered === undefined
          ? `范围“${label}”找到 ${due.candidateCount} 个闪卡根块，但无法确认 Riff 登记状态`
          : registered === 0
          ? `范围“${label}”找到 ${due.candidateCount} 个闪卡根块，但尚未登记到 Riff`
          : `范围“${label}”已登记 ${registered} 张卡，但当前没有到期卡`,
        7000,
        "info",
      );
    }
    if (due.cards.length === 0 && (due.candidateCount ?? 0) === 0) {
      showMessage(`范围“${label}”未找到符合条件的到期闪卡`, 5000, "info");
    }
    if (due.cards.length === 0) return;
    await host.runtime.recordScope(scope);
    await host.openNativeReview(`复习：${label}`, due, scope);
  } catch (error) {
    host.reportError(`获取复习范围“${scope.targetName}”失败`, error);
  }
}

export async function openScopeRegistrationFlow(
  host: FlashcardScopeReviewHost,
  scope: FlashcardReviewScope,
  label: string,
  due: DueCardsData,
): Promise<void> {
  const ids = await host.runtime.provideScopeBlockIds(scope, true);
  const roots = await host.runtime.adapter.inspectRoots(ids, host.runtime.getSettings());
  const rows: FlashcardBlockRow[] = roots.map((root) => ({
    id: root.blockId,
    content: root.content,
    type: root.renderer,
    attributes: root.attributes,
  }));
  await host.openRegistrationResults({
    title: `${label} · 待登记闪卡`,
    rows,
    roots,
    due,
    onRegistered: async () => {
      await host.runtime.recordScope(scope);
      await host.reviewScopeCards(scope, true);
    },
  });
}

export async function openMakeScopeFlow(host: FlashcardScopeReviewHost, scope: FlashcardReviewScope): Promise<void> {
  try {
    const settings = host.runtime.getSettings();
    const autoReviewAfterRegistration = settings.autoReviewAfterRegistration !== false;
    const label = scope.groupName && scope.type !== "group"
      ? `${scope.targetName} · ${scope.groupName}`
      : scope.groupName ?? scope.targetName;
    let rows: FlashcardBlockRow[];
    let roots: FlashcardRoot[];
    const group = scope.groupId
      ? host.runtime.getGroups().find((candidate) => candidate.id === scope.groupId)
      : undefined;
    if (group) {
      const inspection = await host.runtime.inspectGroupCandidates(group);
      if (scope.type === "group") {
        ({ rows, roots } = inspection);
      } else {
        const rootRows = await host.runtime.adapter.loadBlocks(inspection.roots.map((root) => root.blockId));
        const allowed = new Set(rootRows.filter((row) => scope.type === "document"
          ? row.id === scope.targetId || row.root_id === scope.targetId
          : row.box === scope.targetId,
        ).map((row) => row.id));
        roots = inspection.roots.filter((root) => allowed.has(root.blockId));
        rows = rootRows.filter((row) => allowed.has(row.id));
      }
    } else {
      const ids = await host.runtime.provideScopeBlockIds(scope);
      roots = await host.runtime.adapter.inspectRoots(ids, settings);
      rows = roots.map((root) => ({
        id: root.blockId,
        content: root.content,
        type: root.renderer,
        attributes: root.attributes,
      }));
    }
    if (roots.length === 0) {
      showMessage(`范围“${label}”未找到符合条件的闪卡根块`, 5000, "info");
      return;
    }
    await host.openRegistrationResults({
      title: `${label} · 制卡检测`,
      rows,
      roots,
      continueToReview: autoReviewAfterRegistration,
      onRegistered: async () => {
        await host.runtime.recordScope(scope);
        if (autoReviewAfterRegistration) await host.reviewScopeCards(scope, true);
      },
    });
  } catch (error) {
    host.reportError(`检测制卡范围“${scope.targetName}”失败`, error);
  }
}

export async function reviewContainerSelectionFlow(
  host: FlashcardScopeReviewHost,
  ids: readonly string[],
  label: string,
): Promise<void> {
  try {
    const blockIds = await host.runtime.adapter.getContainerBlockIds(ids);
    const due = await host.runtime.adapter.buildDueCardsData(
      host.runtime.getSettings().deckId,
      blockIds,
      host.runtime.getSettings().maxReviewCards,
    );
    if (due.cards.length === 0) {
      showMessage(`${label}没有可复习的已登记闪卡`, 5000, "info");
      return;
    }
    await host.openNativeReview(`复习：${label}`, due);
  } catch (error) {
    host.reportError("获取容器闪卡失败", error);
  }
}

export async function reviewDocumentTreeFlow(
  host: FlashcardScopeReviewHost,
  ids: readonly string[],
  notebook: boolean,
  label: string,
): Promise<void> {
  try {
    const dueList = notebook
      ? await Promise.all(ids.map((id) => host.runtime.adapter.getNotebookDueCards(id)))
      : await Promise.all(ids.map((id) => host.runtime.adapter.getTreeDueCards(id)));
    const cards = [...new Map(dueList.flatMap((due) => due.cards).map((card) => [card.blockID, card])).values()]
      .slice(0, Math.max(1, host.runtime.getSettings().maxReviewCards));
    if (cards.length === 0) {
      showMessage(`${label}没有可复习的已登记闪卡`, 5000, "info");
      return;
    }
    const due: DueCardsData = {
      cards,
      unreviewedCount: cards.length,
      unreviewedNewCardCount: cards.filter((card) => card.state === 0).length,
      unreviewedOldCardCount: cards.filter((card) => card.state !== 0).length,
    };
    await host.openNativeReview(`复习：${label}`, due);
  } catch (error) {
    host.reportError("获取文档范围闪卡失败", error);
  }
}

export function openRawFlow(group: FlashcardGroup): void {
  openDocumentFlow("SQL", group.sqlQuery, `${group.name}-SQL查询`);
}

export async function openFilteredFlow(host: FlashcardScopeReviewHost, group: FlashcardGroup): Promise<void> {
  try {
    const roots = await host.runtime.provideGroupBlockIds(group);
    if (roots.length === 0) {
      showMessage(`分组 "${group.name}" 未找到闪卡块`);
      return;
    }
    openDocumentFlow("IdList", roots, `${group.name}-闪卡块查询`);
  } catch (error) {
    host.reportError("打开过滤结果失败", error);
  }
}

export async function batchPriorityFlow(host: FlashcardScopeReviewHost, group: FlashcardGroup): Promise<void> {
  try {
    const selected = window.prompt("输入优先级标签（P1、P2、P3 或 P4）", "P2")?.trim().toUpperCase();
    const priority = ({ P1: 100, P2: 75, P3: 50, P4: 25 } as Record<string, number>)[selected ?? ""];
    if (!priority) return;
    const preview = await host.runtime.previewBatchPriority(group, priority);
    if (preview.cards.length === 0) {
      showMessage(`分组 "${group.name}" 未找到对应的闪卡`);
      return;
    }
    const approved = await new Promise<boolean>((resolve) => {
      confirm(
        "批量设置优先级",
        `将对 ${preview.cards.length} 张卡设置优先级 ${priorityTag(preview.priority)}（${preview.priority}），并同步 Markdown 标签。该操作可能影响已有调度，确认继续？`,
        () => resolve(true),
        () => resolve(false),
      );
    });
    if (!approved) return;
    const result = await host.runtime.applyBatchPriority(group, priority);
    showMessage(`已处理 ${result.count} 张卡（${result.status === "pending" ? "待运行时同步" : "已提交"}）`, 5000, result.status === "pending" ? "error" : "info");
  } catch (error) {
    host.reportError("批量设置优先级失败", error);
  }
}

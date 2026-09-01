import { siyuanKernelClient } from "@/question-bank/adapters/siyuan/client";
import {
  describeProjectionResult,
  resolveMappingTarget,
  runQuestionIndexSync,
  type QuestionIndexSyncTarget,
} from "@/question-bank/application/projection";
import {
  listQuestionIndexTargets,
  markQuestionIndexTarget,
} from "@/question-bank/application/index-targets";
import type { QuestionIndexPreview } from "@/question-bank/application/indexing";
import type { QuestionBankUiController } from "../controller";

/** Live view of the component state the mapping actions read and write. */
export interface MappingActionsState {
  questionIndexProjectionBlockId: string;
  pruneStaleMappingRows: boolean;
  includeUnansweredMappingRows: boolean;
  mappingStatus: "idle" | "checking" | "ready" | "syncing" | "success" | "error";
  mappingMessage: string;
  mappingTarget: { avId: string; blockId: string } | undefined;
  markedIndexTargets: Array<{ blockId: string; avId?: string }>;
}

export function createMappingActions(deps: {
  state: MappingActionsState;
  controller: QuestionBankUiController;
  reviewThreshold: number;
}) {
  const { state, controller } = deps;

  function setPruneStaleMappingRows(value: boolean): void {
    state.pruneStaleMappingRows = value;
    controller.setSetting?.("projectionPruneStaleRows", value);
  }

  function setIncludeUnansweredMappingRows(value: boolean): void {
    state.includeUnansweredMappingRows = value;
    controller.setSetting?.("projectionIncludeUnanswered", value);
  }

  function setMappingTarget(value: string): void {
    state.questionIndexProjectionBlockId = value.trim();
    controller.setSetting?.("questionIndexProjectionBlockId", value.trim());
  }

  async function refreshMarkedIndexTargets(): Promise<void> {
    try {
      const records = await listQuestionIndexTargets(siyuanKernelClient);
      state.markedIndexTargets = records.map((record) => ({ blockId: record.blockId, avId: record.mark.avId || undefined }));
    } catch {
      state.markedIndexTargets = [];
    }
  }

  function projectionOptions() {
    return {
      pruneStale: state.pruneStaleMappingRows,
      includeUnanswered: state.includeUnansweredMappingRows,
    };
  }

  async function selectCurrentMappingTarget(): Promise<void> {
    const selected = document.querySelector<HTMLElement>('.protyle-wysiwyg--select[data-node-id][data-type="NodeAttributeView"], .protyle-wysiwyg [data-node-id].protyle-wysiwyg--select[data-type="NodeAttributeView"]');
    if (!selected) { state.mappingStatus = "error"; state.mappingMessage = "未找到选中的属性视图块"; return; }
    const blockId = selected.dataset.nodeId ?? "";
    setMappingTarget(blockId);
    state.mappingStatus = "idle";
    try {
      const resolved = await resolveMappingTarget(siyuanKernelClient, blockId);
      await markQuestionIndexTarget(siyuanKernelClient, resolved.blockId, resolved.avId, projectionOptions());
      state.mappingMessage = `已选择并标记为索引数据库：${resolved.name || resolved.avId}，后续可直接右键该数据库同步`;
    } catch {
      state.mappingMessage = "已选择目标，点击检查连接";
    }
    void refreshMarkedIndexTargets();
  }

  async function checkMappingTarget(): Promise<boolean> {
    const id = state.questionIndexProjectionBlockId;
    if (!id) return false;
    state.mappingStatus = "checking";
    try {
      const resolved = await resolveMappingTarget(siyuanKernelClient, id);
      state.mappingTarget = { avId: resolved.avId, blockId: resolved.blockId };
      state.mappingStatus = "ready";
      state.mappingMessage = `连接正常：${resolved.name || resolved.avId} · 块 ${resolved.blockId}`;
      return true;
    } catch (error) {
      state.mappingStatus = "error";
      state.mappingMessage = error instanceof Error ? error.message : String(error);
      return false;
    }
  }

  async function syncMappingTarget(): Promise<void> {
    if (!state.questionIndexProjectionBlockId && state.markedIndexTargets.length === 0) {
      state.mappingStatus = "error";
      state.mappingMessage = "请先指定 Question Index 目标，或右键数据库块标记索引";
      return;
    }

    let prompt = state.includeUnansweredMappingRows
      ? "确认将题库统计同步投射到选中的 Question Index 数据库？"
      : "确认将题库中【已作答】题目的统计同步投射到选中的 Question Index 数据库？";
    if (state.pruneStaleMappingRows) {
      prompt += "\n（已勾选“删除失效数据行”：目标数据库中不存在或未作答的旧条目将被清理）";
    }

    if (!window.confirm(prompt)) {
      return;
    }

    state.mappingStatus = "syncing";
    state.mappingMessage = "正在检查目标数据库连接...";
    try {
      const targets: QuestionIndexSyncTarget[] = [];
      if (state.questionIndexProjectionBlockId) {
        if (!await checkMappingTarget()) return;
        targets.push({
          blockId: state.mappingTarget!.blockId,
          avId: state.mappingTarget!.avId,
          label: state.questionIndexProjectionBlockId,
          options: projectionOptions(),
        });
      }
      for (const marked of state.markedIndexTargets) {
        if (state.questionIndexProjectionBlockId && marked.blockId === state.mappingTarget?.blockId) continue;
        targets.push({ blockId: marked.blockId, avId: marked.avId, label: marked.avId || marked.blockId, options: projectionOptions() });
      }
      if (targets.length === 0) {
        state.mappingStatus = "error";
        state.mappingMessage = "没有可同步的目标数据库";
        return;
      }
      const outcomes = await runQuestionIndexSync(
        {
          client: siyuanKernelClient,
          loadCatalog: () => {
            if (!controller.loadQuestionCatalog) throw new Error("当前题库没有可执行的索引同步上下文");
            return controller.loadQuestionCatalog();
          },
          loadAggregates: () => controller.loadAggregates(),
          reviewThreshold: deps.reviewThreshold,
        },
        targets,
        { onProgress: (message) => { state.mappingMessage = message; } },
      );
      const okOutcomes = outcomes.filter((outcome) => outcome.ok);
      if (okOutcomes.length === 0) {
        state.mappingStatus = "error";
        state.mappingMessage = outcomes.map((outcome) => `${outcome.label}: ${outcome.message}`).join("；");
        return;
      }
      const totals = okOutcomes.reduce((acc, outcome) => ({
        added: acc.added + (outcome.result?.added ?? 0),
        updated: acc.updated + (outcome.result?.updated ?? 0),
        deleted: acc.deleted + (outcome.result?.deleted ?? 0),
        columns: acc.columns + (outcome.result?.columns ?? 0),
      }), { added: 0, updated: 0, deleted: 0, columns: 0 });
      const detail = okOutcomes.length === 1
        ? describeProjectionResult(okOutcomes[0].result!)
        : targets.map((target, index) => `${target.label}: ${outcomes[index].message}`).join("；");
      state.mappingStatus = "success";
      state.mappingMessage = `同步完成（${targets.length} 个库）：新增 ${totals.added}，更新 ${totals.updated}${totals.deleted ? `，删除失效 ${totals.deleted}` : ""} —— ${detail}`;
      const failures = outcomes.filter((outcome) => !outcome.ok);
      if (failures.length > 0) {
        state.mappingMessage += `；失败: ${failures.map((outcome) => `${outcome.label}: ${outcome.message}`).join("；")}`;
      }
    } catch (error) {
      state.mappingStatus = "error";
      state.mappingMessage = error instanceof Error ? error.message : String(error);
    }
    void refreshMarkedIndexTargets();
  }

  return {
    setPruneStaleMappingRows,
    setIncludeUnansweredMappingRows,
    setMappingTarget,
    refreshMarkedIndexTargets,
    selectCurrentMappingTarget,
    checkMappingTarget,
    syncMappingTarget,
  };
}

export function hasPendingSync(target: QuestionIndexPreview): boolean {
  return target.actions.length > 0
    || target.bindingRepairs.length > 0
    || target.ialWriteActions.length > 0;
}

export async function applyIndexSync(deps: {
  controller: QuestionBankUiController;
  getDocumentId(): string;
  isIncludeSubdocuments(): boolean;
  setSyncComplete(value: boolean): void;
  setError(value: string): void;
}, target: QuestionIndexPreview): Promise<QuestionIndexPreview> {
  const documentId = deps.getDocumentId();
  const synced = deps.isIncludeSubdocuments()
    ? await deps.controller.confirmSync(documentId, target.token, true)
    : await deps.controller.confirmSync(documentId, target.token);
  const failures = synced.results.filter((result) => result.status === "failed");
  deps.setSyncComplete(failures.length === 0);
  if (failures.length > 0) {
    deps.setError(failures.map((failure) => `${failure.questionId}: ${failure.message ?? "failed"}`).join("; "));
  }
  return synced;
}

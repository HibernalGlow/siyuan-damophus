import type { AttemptAggregate, QuestionBookmark } from "../core/types";
import type { QuestionCatalogEntry } from "../assembly";
import {
  numberCell,
  selectCell,
  setAttributeViewCell,
  setAttributeViewCells,
  textCell,
  dateCell,
  type AttributeViewCellWrite,
} from "../adapters/siyuan/cells";
import { readAttributeView } from "../adapters/siyuan/binding";
import type { SiyuanKernelClient, AttributeViewKeyType } from "../adapters/siyuan/types";

export interface QuestionIndexProjectionOptions {
  pruneStale?: boolean;
  includeUnanswered?: boolean;
  /** Active (non-archived) bookmarked question IDs; drives the 收藏 checkbox column. */
  bookmarkedQuestionIds?: ReadonlySet<string>;
}

export interface QuestionIndexProjectionResult {
  added: number;
  updated: number;
  deleted: number;
  columns: number;
  /** Rows whose cell writes failed; the sync kept going for the remaining rows. */
  failedRows?: number;
  /** Rows carrying a Question ID value but no primary-key value, so the kernel rejects any cell write ("item not found"). */
  orphanRows?: number;
}

const columns = [
  ["Question ID", "question_id", "text"],
  ["题目", "title", "text"],
  ["状态", "status", "select"],
  ["次数", "attempts", "number"],
  ["正确", "correct", "number"],
  ["正确率", "accuracy", "number"],
  ["需复习", "needs_review", "checkbox"],
  ["收藏", "bookmarked", "checkbox"],
  ["最近评级", "latest_rating", "select"],
  ["最近作答", "last_answered_at", "date"],
] as const;

function id(): string {
  return `${new Date().toISOString().replace(/\D/gu, "").slice(0, 14)}-${Math.random().toString(36).slice(2, 9).padEnd(7, "0")}`;
}

function valueText(value: { text?: { content?: string }; mSelect?: Array<{ content: string }> } | undefined): string {
  return value?.text?.content ?? value?.mSelect?.[0]?.content ?? "";
}

export async function projectQuestionIndex(
  client: SiyuanKernelClient,
  target: { avId: string; blockId: string },
  questions: readonly QuestionCatalogEntry[],
  aggregates: ReadonlyMap<string, AttemptAggregate>,
  reviewThreshold = 2,
  options: QuestionIndexProjectionOptions = {},
): Promise<QuestionIndexProjectionResult> {
  const includeUnanswered = options.includeUnanswered ?? true;
  const targetQuestions = includeUnanswered
    ? questions
    : questions.filter((q) => (aggregates.get(q.questionId)?.attempts ?? 0) > 0);
  const av = await readAttributeView(client, target.avId);
  const byName = new Map(av.keyValues.map((entry) => [entry.key.name.trim().toLowerCase(), entry.key]));
  let previous = av.keyValues.at(-1)?.key.id;
  let addedColumns = 0;
  const keys: Record<string, { id: string; type: AttributeViewKeyType }> = {};
  for (const [name, field, type] of columns) {
    const existing = byName.get(name.toLowerCase());
    if (existing) { keys[field] = existing; continue; }
    if (!previous) throw new Error("目标数据库没有主列，无法添加映射列");
    const keyId = id();
    await client.request("/api/av/addAttributeViewKey", {
      avID: target.avId, keyID: keyId, keyName: name, keyType: type, keyIcon: "", previousKeyID: previous,
    });
    keys[field] = { id: keyId, type };
    previous = keyId;
    addedColumns += 1;
  }
  const refreshed = await readAttributeView(client, target.avId);
  const blockKeyValues = refreshed.keyValues.find((entry) => entry.key.type === "block")?.values ?? [];
  // The kernel refuses any cell write for a row without a primary-key value ("item not found"),
  // so only rows present in the block key are writable; the rest are orphans to report or prune.
  const writableItems = new Set(blockKeyValues.map((value) => value.blockID));
  const primaryValuesByItem = new Map(blockKeyValues.map((value) => [value.blockID, value]));
  const questionValues = refreshed.keyValues.find((entry) => entry.key.id === keys.question_id.id)?.values ?? [];
  const validQuestionIds = new Set(targetQuestions.map((q) => q.questionId));
  const rowByQuestion = new Map<string, string>();
  const staleItemIds: string[] = [];
  const orphanItemIds = new Set<string>();

  for (const value of questionValues) {
    const qId = valueText(value).trim();
    if (qId && validQuestionIds.has(qId) && writableItems.has(value.blockID)) {
      if (!rowByQuestion.has(qId)) {
        rowByQuestion.set(qId, value.blockID);
      } else {
        staleItemIds.push(value.blockID);
      }
    } else {
      staleItemIds.push(value.blockID);
      if (qId && validQuestionIds.has(qId)) orphanItemIds.add(value.blockID);
    }
  }

  const allItemIds = new Set(refreshed.keyValues.flatMap((entry) => (entry.values ?? []).map((v) => v.blockID)));
  for (const itemId of allItemIds) {
    if (!questionValues.some((v) => v.blockID === itemId)) {
      staleItemIds.push(itemId);
    }
  }

  const uniqueStaleItemIds = [...new Set(staleItemIds)];
  let deleted = 0;
  if (options.pruneStale && uniqueStaleItemIds.length > 0) {
    await client.request("/api/av/removeAttributeViewBlocks", {
      avID: target.avId,
      srcIDs: uniqueStaleItemIds,
    });
    deleted = uniqueStaleItemIds.length;
  }

  let added = 0;
  let updated = 0;
  let failedRows = 0;
  const knownItemIds = new Set(blockKeyValues.map((value) => value.blockID));
  for (const question of targetQuestions) {
    const isNewRow = !rowByQuestion.has(question.questionId);
    try {
      let itemId = rowByQuestion.get(question.questionId);
      if (!itemId) {
        if (question.blockId && /^\d{14}-[a-z0-9]{7}$/u.test(question.blockId)) {
          try {
            await client.request("/api/av/addAttributeViewBlocks", {
              avID: target.avId, blockID: target.blockId, viewID: "", groupID: "", previousID: "",
              srcs: [{ id: question.blockId, isDetached: false, content: question.questionTitle ?? question.questionId }],
              ignoreDefaultFill: true,
            });
            const ids = await client.request<Record<string, string>>("/api/av/getAttributeViewItemIDsByBoundIDs", {
              avID: target.avId, blockIDs: [question.blockId],
            });
            itemId = ids?.[question.blockId] || undefined;
            if (itemId) knownItemIds.add(itemId);
          } catch {
            // Fall back to detached row
          }
        }
        if (!itemId) {
          itemId = id();
          const detachedContent = question.questionTitle ?? question.questionId;
          await client.request("/api/av/addAttributeViewBlocks", {
            avID: target.avId, blockID: target.blockId, viewID: "", groupID: "", previousID: "",
            srcs: [{ itemID: itemId, id: itemId, isDetached: true, content: detachedContent }],
            ignoreDefaultFill: true,
          });
          itemId = await verifyDetachedRowId(client, target.avId, itemId, detachedContent, knownItemIds);
        }
      } else {
        const primaryValue = primaryValuesByItem.get(itemId);
        if (
          question.blockId &&
          /^\d{14}-[a-z0-9]{7}$/u.test(question.blockId) &&
          primaryValue &&
          (primaryValue.isDetached || !primaryValue.block?.id || primaryValue.block?.id !== question.blockId)
        ) {
          await client.request("/api/transactions", {
            session: "siyuan-damophus",
            app: "siyuan-damophus",
            reqId: Date.now(),
            transactions: [{
              doOperations: [{
                action: "replaceAttrViewBlock",
                avID: target.avId,
                previousID: itemId,
                nextID: question.blockId,
              }],
              undoOperations: [],
            }],
          }).catch(() => undefined);
        }
      }
      const aggregate = aggregates.get(question.questionId);
      const attempts = aggregate?.attempts ?? 0;
      const correct = aggregate?.objectiveCorrect ?? 0;
      const objectiveAttempts = aggregate?.objectiveAttempts ?? 0;
      const accuracy = objectiveAttempts ? Math.round((correct / objectiveAttempts) * 1000) / 10 : 0;
      const cells: AttributeViewCellWrite[] = [
        { keyId: keys.question_id.id, itemId, value: textCell(question.questionId) },
        { keyId: keys.title.id, itemId, value: textCell(question.questionTitle) },
        { keyId: keys.status.id, itemId, value: selectCell(attempts ? "已作答" : "未作答") },
        { keyId: keys.attempts.id, itemId, value: numberCell(attempts) },
        { keyId: keys.correct.id, itemId, value: numberCell(correct) },
        { keyId: keys.accuracy.id, itemId, value: numberCell(accuracy) },
        { keyId: keys.needs_review.id, itemId, value: { type: "checkbox", checkbox: { checked: (aggregate?.consecutiveReviewCount ?? 0) >= reviewThreshold } } },
        { keyId: keys.bookmarked.id, itemId, value: { type: "checkbox", checkbox: { checked: options.bookmarkedQuestionIds?.has(question.questionId) ?? false } } },
        { keyId: keys.latest_rating.id, itemId, value: selectCell(aggregate?.latestRating) },
        { keyId: keys.last_answered_at.id, itemId, value: dateCell(aggregate?.lastAnsweredAt ? Date.parse(aggregate.lastAnsweredAt) : undefined) },
      ];
      try {
        await setAttributeViewCells(client, target.avId, cells);
      } catch {
        // Older kernels without the batch endpoint: fall back to per-cell writes.
        await Promise.all(cells.map((cell) => setAttributeViewCell(client, target.avId, cell.keyId, cell.itemId, cell.value)));
      }
      if (isNewRow) added += 1;
      else updated += 1;
    } catch {
      failedRows += 1;
    }
  }
  return {
    added,
    updated,
    deleted,
    columns: addedColumns,
    failedRows: failedRows || undefined,
    orphanRows: orphanItemIds.size || undefined,
  };
}

async function verifyDetachedRowId(
  client: SiyuanKernelClient,
  avId: string,
  preferredId: string,
  expectedContent: string,
  knownItemIds: Set<string>,
): Promise<string> {
  const av = await readAttributeView(client, avId);
  const blockValues = av.keyValues.find((entry) => entry.key.type === "block")?.values ?? [];
  if (blockValues.some((value) => value.blockID === preferredId)) {
    knownItemIds.add(preferredId);
    return preferredId;
  }
  // The kernel generated its own row ID: adopt the row with the expected content,
  // or whatever appeared since the last read as a last resort.
  const byContent = blockValues.find((value) => value.block?.content === expectedContent && !knownItemIds.has(value.blockID));
  const adopted = byContent ?? blockValues.find((value) => !knownItemIds.has(value.blockID));
  if (adopted) {
    knownItemIds.add(adopted.blockID);
    return adopted.blockID;
  }
  knownItemIds.add(preferredId);
  return preferredId;
}

export interface QuestionIndexSyncDeps {
  client: SiyuanKernelClient;
  loadCatalog: () => Promise<QuestionCatalogEntry[]>;
  loadAggregates: () => Promise<ReadonlyMap<string, AttemptAggregate>>;
  loadBookmarks?: () => Promise<ReadonlyMap<string, QuestionBookmark>>;
  reviewThreshold?: number;
}

export interface QuestionIndexSyncTarget {
  blockId: string;
  avId?: string;
  label?: string;
  options?: QuestionIndexProjectionOptions;
}

export interface QuestionIndexSyncOutcome {
  label: string;
  ok: boolean;
  message: string;
  result?: QuestionIndexProjectionResult;
}

export interface QuestionIndexSyncHooks {
  onProgress?: (message: string) => void;
  includeUnanswered?: boolean;
  pruneStale?: boolean;
}

export function describeProjectionResult(result: QuestionIndexProjectionResult): string {
  const parts = [`新增 ${result.added}`, `更新 ${result.updated}`];
  if (result.deleted) parts.push(`删除失效 ${result.deleted}`);
  if (result.columns) parts.push(`补充列 ${result.columns}`);
  if (result.orphanRows) parts.push(`孤立行 ${result.orphanRows}（开启“删除失效数据行”可清理）`);
  if (result.failedRows) parts.push(`失败 ${result.failedRows}`);
  return parts.join("，");
}

export async function runQuestionIndexSync(
  deps: QuestionIndexSyncDeps,
  targets: readonly QuestionIndexSyncTarget[],
  hooks: QuestionIndexSyncHooks = {},
): Promise<QuestionIndexSyncOutcome[]> {
  const outcomes: QuestionIndexSyncOutcome[] = [];
  for (const target of targets) {
    const label = target.label ?? target.blockId;
    try {
      if (!target.avId) {
        const resolved = await resolveMappingTarget(deps.client, target.blockId);
        target.avId = resolved.avId;
        target.blockId = resolved.blockId;
      }
      hooks.onProgress?.(`正在同步 ${label}...`);
      const [catalog, aggregates, bookmarks] = await Promise.all([
        deps.loadCatalog(),
        deps.loadAggregates(),
        deps.loadBookmarks?.() ?? Promise.resolve(undefined),
      ]);
      const bookmarkedQuestionIds = bookmarks
        ? new Set([...bookmarks.values()].filter((bookmark) => !bookmark.isArchived).map((bookmark) => bookmark.questionId))
        : undefined;
      const result = await projectQuestionIndex(
        deps.client,
        { avId: target.avId, blockId: target.blockId },
        catalog,
        aggregates,
        deps.reviewThreshold ?? 2,
        {
          ...(target.options ?? {
            pruneStale: hooks.pruneStale,
            includeUnanswered: hooks.includeUnanswered ?? true,
          }),
          bookmarkedQuestionIds,
        },
      );
      outcomes.push({ label, ok: true, message: describeProjectionResult(result), result });
    } catch (error) {
      outcomes.push({ label, ok: false, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return outcomes;
}

export async function resolveMappingTarget(
  client: SiyuanKernelClient,
  id: string,
): Promise<{ avId: string; blockId: string; name?: string; resolvedId: string }> {
  const escapedId = id.replace(/'/gu, "''");
  const rows = await client.request<Array<{ id?: string; type?: string; content?: string }>>("/api/query/sql", {
    stmt: `SELECT id, type, content FROM blocks WHERE id = '${escapedId}' LIMIT 1`,
  });
  const row = rows[0];
  const attrs = row
    ? await client.request<Record<string, string>>("/api/attr/getBlockAttrs", { id }).catch(() => ({}))
    : {};
  const candidates = [
    id,
    attrs["custom-sy-av-id"],
    attrs["custom-sy-av-view"],
    row?.content?.match(/(?:custom-sy-av-id|custom-sy-av-view)=["']([^"']+)["']/u)?.[1],
  ].filter((candidate, index, all): candidate is string => Boolean(candidate) && all.indexOf(candidate) === index);
  let resolved: { id?: string; name?: string } | undefined;
  let resolvedId = "";
  for (const candidate of candidates) {
    try {
      const response = await client.request<{ av?: { id?: string; name?: string } }>("/api/av/getAttributeView", { id: candidate });
      if (response?.av?.id) {
        resolved = response.av;
        resolvedId = candidate;
        break;
      }
    } catch {
      // Try the next interpretation: database ID, then containing block ID metadata.
    }
  }
  if (!resolved?.id) throw new Error("未找到属性视图数据库；请输入数据库 ID 或数据库块 ID");
  const escapedAvId = resolved.id.replace(/'/gu, "''");
  const targetBlock = row?.id ?? (await client.request<Array<{ id?: string }>>("/api/query/sql", {
    stmt: `SELECT id FROM blocks WHERE ial LIKE '%${escapedAvId}%' OR markdown LIKE '%${escapedAvId}%' LIMIT 1`,
  }))[0]?.id;
  if (!targetBlock) throw new Error("已找到数据库，但找不到对应的数据库块；请改填数据库块 ID");
  return { avId: resolved.id, blockId: String(targetBlock), name: resolved.name, resolvedId };
}

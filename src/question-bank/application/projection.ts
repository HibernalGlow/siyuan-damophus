import type { AttemptAggregate } from "../core/types";
import type { QuestionCatalogEntry } from "../assembly";
import { numberCell, selectCell, setAttributeViewCell, textCell, dateCell } from "../adapters/siyuan/cells";
import { readAttributeView } from "../adapters/siyuan/binding";
import type { SiyuanKernelClient, AttributeViewKeyType } from "../adapters/siyuan/types";

export interface QuestionIndexProjectionOptions {
  pruneStale?: boolean;
  includeUnanswered?: boolean;
}

export interface QuestionIndexProjectionResult {
  added: number;
  updated: number;
  deleted: number;
  columns: number;
}

const columns = [
  ["Question ID", "question_id", "text"],
  ["题目", "title", "text"],
  ["状态", "status", "select"],
  ["次数", "attempts", "number"],
  ["正确", "correct", "number"],
  ["正确率", "accuracy", "number"],
  ["需复习", "needs_review", "checkbox"],
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
  const primaryValues = refreshed.keyValues.find((entry) => entry.key.type === "block")?.values ?? [];
  const primaryValuesByItem = new Map(primaryValues.map((v) => [v.blockID, v]));
  const questionValues = refreshed.keyValues.find((entry) => entry.key.id === keys.question_id.id)?.values ?? [];
  const validQuestionIds = new Set(targetQuestions.map((q) => q.questionId));
  const rowByQuestion = new Map<string, string>();
  const staleItemIds: string[] = [];

  for (const value of questionValues) {
    const qId = valueText(value).trim();
    if (qId && validQuestionIds.has(qId)) {
      if (!rowByQuestion.has(qId)) {
        rowByQuestion.set(qId, value.blockID);
      } else {
        staleItemIds.push(value.blockID);
      }
    } else {
      staleItemIds.push(value.blockID);
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
  for (const question of targetQuestions) {
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
          itemId = ids?.[question.blockId];
        } catch {
          // Fall back to detached row
        }
      }
      if (!itemId) {
        itemId = id();
        await client.request("/api/av/addAttributeViewBlocks", {
          avID: target.avId, blockID: target.blockId, viewID: "", groupID: "", previousID: "",
          srcs: [{ itemID: itemId, id: itemId, isDetached: true, content: question.questionTitle ?? question.questionId }],
          ignoreDefaultFill: true,
        });
      }
      added += 1;
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
      updated += 1;
    }
    const aggregate = aggregates.get(question.questionId);
    const attempts = aggregate?.attempts ?? 0;
    const correct = aggregate?.objectiveCorrect ?? 0;
    const objectiveAttempts = aggregate?.objectiveAttempts ?? 0;
    const accuracy = objectiveAttempts ? Math.round((correct / objectiveAttempts) * 1000) / 10 : 0;
    const values = [
      [keys.question_id, textCell(question.questionId)],
      [keys.title, textCell(question.questionTitle)],
      [keys.status, selectCell(attempts ? "已作答" : "未作答")],
      [keys.attempts, numberCell(attempts)],
      [keys.correct, numberCell(correct)],
      [keys.accuracy, numberCell(accuracy)],
      [keys.needs_review, { type: "checkbox", checkbox: { checked: (aggregate?.consecutiveReviewCount ?? 0) >= reviewThreshold } }],
      [keys.latest_rating, selectCell(aggregate?.latestRating)],
      [keys.last_answered_at, dateCell(aggregate?.lastAnsweredAt ? Date.parse(aggregate.lastAnsweredAt) : undefined)],
    ] as const;
    await Promise.all(values.map(([key, value]) => setAttributeViewCell(client, target.avId, key.id, itemId, value)));
  }
  return { added, updated, deleted, columns: addedColumns };
}

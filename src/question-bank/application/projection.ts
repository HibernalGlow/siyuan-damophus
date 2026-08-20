import type { AttemptAggregate } from "../core/types";
import type { QuestionCatalogEntry } from "../assembly";
import { numberCell, selectCell, setAttributeViewCell, textCell, dateCell } from "../adapters/siyuan/cells";
import { readAttributeView } from "../adapters/siyuan/binding";
import type { SiyuanKernelClient, AttributeViewKeyType } from "../adapters/siyuan/types";

export interface QuestionIndexProjectionResult { added: number; updated: number; columns: number; }

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
): Promise<QuestionIndexProjectionResult> {
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
  const questionValues = refreshed.keyValues.find((entry) => entry.key.id === keys.question_id.id)?.values ?? [];
  const rowByQuestion = new Map(questionValues.map((value) => [valueText(value), value.blockID]));
  let added = 0;
  let updated = 0;
  for (const question of questions) {
    let itemId = rowByQuestion.get(question.questionId);
    if (!itemId) {
      itemId = id();
      await client.request("/api/av/addAttributeViewBlocks", {
        avID: target.avId, blockID: target.blockId, viewID: "", groupID: "", previousID: "",
        srcs: [{ itemID: itemId, id: itemId, isDetached: true, content: question.questionTitle ?? question.questionId }],
        ignoreDefaultFill: true,
      });
      added += 1;
    } else updated += 1;
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
    for (const [key, value] of values) await setAttributeViewCell(client, target.avId, key.id, itemId, value);
  }
  return { added, updated, columns: addedColumns };
}

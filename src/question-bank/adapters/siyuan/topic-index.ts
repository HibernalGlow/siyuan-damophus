import type { Question, ScanMessage } from "../../core/types";
import { rebuildAttemptStatistics } from "./attempt-store";
import { readAttributeView, requireQuestionBankBinding, type QuestionBankBinding } from "./binding";
import { numberCell, relationCells, setAttributeViewCell } from "./cells";
import { hashToken } from "./binding-utils";
import { questionRowIdentityMaps } from "./row-identity";
import type { AttributeViewValue, RawAttributeView, SiyuanKernelClient } from "./types";

export type TopicStatus = "active" | "archived";

export interface TopicResource {
  content: string;
  name: string;
  type: "file" | "image";
}

export interface TopicRecord {
  itemId: string;
  topicId: string;
  name: string;
  subject?: string;
  laws: string[];
  categories: string[];
  resources: TopicResource[];
  status: TopicStatus;
  questionIds: string[];
  attemptCount?: number;
  wrongCount?: number;
  wrongRate?: number;
}

export interface ReadTopicIndexResult {
  topics: TopicRecord[];
  issues: ScanMessage[];
}

export interface QuestionTopicAssignment {
  questionId: string;
  topicIds: string[];
}

export type TopicRelationSyncMode = "merge" | "diff";

export interface TopicRelationAction {
  questionId: string;
  currentTopicIds: string[];
  incomingTopicIds: string[];
  addedTopicIds: string[];
  removedTopicIds: string[];
  finalTopicIds: string[];
}

export interface TopicRelationPreview {
  token: string;
  generatedAt: string;
  mode: TopicRelationSyncMode;
  assignments: QuestionTopicAssignment[];
  actions: TopicRelationAction[];
  issues: ScanMessage[];
  results: TopicRelationWriteResult[];
}

export interface TopicRelationWriteResult {
  questionId: string;
  status: "synced" | "failed";
  message?: string;
}

export interface TopicStatistic {
  topicId: string;
  questionCount: number;
  attemptCount: number;
  wrongCount: number;
  wrongRate?: number;
}

export interface TopicStatisticWriteResult {
  topicId: string;
  status: "synced" | "failed";
  message?: string;
}

export interface TopicResourceProjection {
  topicId: string;
  topicName: string;
  status: TopicStatus;
  resource: TopicResource;
}

const stableTopicIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

function fieldValues(av: RawAttributeView, keyId: string): Map<string, AttributeViewValue> {
  const values = av.keyValues.find((entry) => entry.key.id === keyId)?.values ?? [];
  return new Map(values.map((value) => [value.blockID, value]));
}

function textValue(value: AttributeViewValue | undefined): string | undefined {
  const content = value?.mSelect?.[0]?.content ?? value?.text?.content;
  return content ? content : undefined;
}

function numberValue(value: AttributeViewValue | undefined): number | undefined {
  return value?.number?.isNotEmpty === false ? undefined : value?.number?.content;
}

function multiValue(value: AttributeViewValue | undefined): string[] {
  return value?.mSelect?.map((item) => item.content) ?? [];
}

function questionIdsByItemId(av: RawAttributeView, binding: QuestionBankBinding): Map<string, string> {
  const identities = questionRowIdentityMaps(av, binding.questionIndex.keys.block_id);
  const questionIds = fieldValues(av, binding.questionIndex.keys.question_id);
  const result = new Map<string, string>();
  for (const row of identities.rows) {
    const value = questionIds.get(row.itemId)
      ?? (row.sourceBlockId ? questionIds.get(row.sourceBlockId) : undefined);
    const questionId = textValue(value);
    if (questionId) result.set(row.itemId, questionId);
  }
  return result;
}

async function readTopicState(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<{ result: ReadTopicIndexResult; topicAv: RawAttributeView; questionAv: RawAttributeView }> {
  await requireQuestionBankBinding(client, binding);
  const [topicAv, questionAv] = await Promise.all([
    readAttributeView(client, binding.topicIndex.avId),
    readAttributeView(client, binding.questionIndex.avId),
  ]);
  const primary = fieldValues(topicAv, binding.topicIndex.keys.entry);
  const topicIds = fieldValues(topicAv, binding.topicIndex.keys.topic_id);
  const names = fieldValues(topicAv, binding.topicIndex.keys.name);
  const subjects = fieldValues(topicAv, binding.topicIndex.keys.subject);
  const laws = fieldValues(topicAv, binding.topicIndex.keys.laws);
  const categories = fieldValues(topicAv, binding.topicIndex.keys.categories);
  const resources = fieldValues(topicAv, binding.topicIndex.keys.resource);
  const statuses = fieldValues(topicAv, binding.topicIndex.keys.status);
  const questions = fieldValues(topicAv, binding.topicIndex.keys.questions_relation);
  const attempts = fieldValues(topicAv, binding.topicIndex.keys.attempt_count);
  const wrong = fieldValues(topicAv, binding.topicIndex.keys.wrong_count);
  const rates = fieldValues(topicAv, binding.topicIndex.keys.wrong_rate);
  const questionIdByItemId = questionIdsByItemId(questionAv, binding);
  const issues: ScanMessage[] = [];
  const topics: TopicRecord[] = [];
  const seen = new Set<string>();

  for (const [itemId, entry] of primary) {
    const topicId = textValue(topicIds.get(itemId));
    if (!topicId) {
      issues.push({ code: "missing-topic-index-id", message: `Topic row '${itemId}' has no Topic ID` });
      continue;
    }
    if (!stableTopicIdPattern.test(topicId)) {
      issues.push({
        code: "invalid-topic-index-id",
        message: `Topic ID '${topicId}' must use lowercase ASCII kebab-case`,
      });
      continue;
    }
    if (seen.has(topicId)) {
      issues.push({ code: "duplicate-topic-index-id", message: `Topic ID '${topicId}' appears more than once` });
      continue;
    }
    seen.add(topicId);
    const rawStatus = textValue(statuses.get(itemId));
    if (rawStatus && rawStatus !== "active" && rawStatus !== "archived") {
      issues.push({ code: "invalid-topic-status", message: `Topic '${topicId}' has invalid status '${rawStatus}'` });
    }
    topics.push({
      itemId,
      topicId,
      name: textValue(names.get(itemId)) ?? entry.block?.content ?? topicId,
      subject: textValue(subjects.get(itemId)),
      laws: multiValue(laws.get(itemId)),
      categories: multiValue(categories.get(itemId)),
      resources: resources.get(itemId)?.mAsset?.map((resource) => ({ ...resource })) ?? [],
      status: rawStatus === "archived" ? "archived" : "active",
      questionIds: (questions.get(itemId)?.relation?.blockIDs ?? [])
        .map((questionItemId) => questionIdByItemId.get(questionItemId))
        .filter((questionId): questionId is string => Boolean(questionId)),
      attemptCount: numberValue(attempts.get(itemId)),
      wrongCount: numberValue(wrong.get(itemId)),
      wrongRate: numberValue(rates.get(itemId)),
    });
  }
  return { result: { topics, issues }, topicAv, questionAv };
}

export async function readTopicIndex(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<ReadTopicIndexResult> {
  return (await readTopicState(client, binding)).result;
}

export function portableTopicAssignments(questions: readonly Question[]): QuestionTopicAssignment[] {
  return questions
    .filter((question) => (question.metadata.topicIds?.length ?? 0) > 0)
    .map((question) => ({
      questionId: question.id,
      topicIds: [...new Set(question.metadata.topicIds ?? [])],
    }));
}

function topicRelationToken(value: Omit<TopicRelationPreview, "token" | "generatedAt">): string {
  return hashToken(value);
}

export async function previewTopicRelationSync(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  assignments: readonly QuestionTopicAssignment[],
  mode: TopicRelationSyncMode,
): Promise<TopicRelationPreview> {
  const { result, questionAv } = await readTopicState(client, binding);
  const issues = [...result.issues];
  const topicItemById = new Map(result.topics.map((topic) => [topic.topicId, topic.itemId]));
  const topicIdByItem = new Map(result.topics.map((topic) => [topic.itemId, topic.topicId]));
  const questionIdByItem = questionIdsByItemId(questionAv, binding);
  const questionItemById = new Map([...questionIdByItem].map(([itemId, questionId]) => [questionId, itemId]));
  const relations = fieldValues(questionAv, binding.questionIndex.keys.topics_relation);
  const normalizedAssignments = assignments.map((assignment) => ({
    questionId: assignment.questionId,
    topicIds: [...new Set(assignment.topicIds)],
  }));
  const seenQuestionIds = new Set<string>();
  const actions: TopicRelationAction[] = [];

  for (const assignment of normalizedAssignments) {
    if (seenQuestionIds.has(assignment.questionId)) {
      issues.push({
        code: "duplicate-topic-relation-question",
        message: `Question '${assignment.questionId}' appears more than once in the topic relation input`,
        questionId: assignment.questionId,
      });
      continue;
    }
    seenQuestionIds.add(assignment.questionId);
    const questionItemId = questionItemById.get(assignment.questionId);
    if (!questionItemId) {
      issues.push({
        code: "unknown-topic-relation-question",
        message: `Question '${assignment.questionId}' is not present in Question Index`,
        questionId: assignment.questionId,
      });
      continue;
    }
    const unknownTopicIds = assignment.topicIds.filter((topicId) => !topicItemById.has(topicId));
    for (const topicId of unknownTopicIds) {
      issues.push({
        code: "unknown-topic-relation-topic",
        message: `Topic '${topicId}' is not present in Topic Index`,
        questionId: assignment.questionId,
      });
    }
    const incomingTopicIds = assignment.topicIds.filter((topicId) => topicItemById.has(topicId));
    const currentTopicIds = (relations.get(questionItemId)?.relation?.blockIDs ?? [])
      .map((itemId) => topicIdByItem.get(itemId))
      .filter((topicId): topicId is string => Boolean(topicId));
    const finalTopicIds = mode === "merge"
      ? [...currentTopicIds, ...incomingTopicIds.filter((topicId) => !currentTopicIds.includes(topicId))]
      : incomingTopicIds;
    if (JSON.stringify(currentTopicIds) === JSON.stringify(finalTopicIds)) continue;
    actions.push({
      questionId: assignment.questionId,
      currentTopicIds,
      incomingTopicIds,
      addedTopicIds: finalTopicIds.filter((topicId) => !currentTopicIds.includes(topicId)),
      removedTopicIds: currentTopicIds.filter((topicId) => !finalTopicIds.includes(topicId)),
      finalTopicIds,
    });
  }

  const body = { mode, assignments: normalizedAssignments, actions, issues, results: [] };
  return {
    ...body,
    token: topicRelationToken(body),
    generatedAt: new Date().toISOString(),
  };
}

export async function confirmTopicRelationSync(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  assignments: readonly QuestionTopicAssignment[],
  mode: TopicRelationSyncMode,
  expectedToken: string,
): Promise<TopicRelationPreview> {
  const preview = await previewTopicRelationSync(client, binding, assignments, mode);
  if (preview.token !== expectedToken) throw new Error("Topic relation preview is stale; preview it again");
  if (preview.issues.length > 0) {
    throw new Error(`Topic relation sync is blocked: ${preview.issues.map((issue) => issue.message).join("; ")}`);
  }
  const { result, questionAv } = await readTopicState(client, binding);
  const topicItemById = new Map(result.topics.map((topic) => [topic.topicId, topic.itemId]));
  const questionItemById = new Map(
    [...questionIdsByItemId(questionAv, binding)].map(([itemId, questionId]) => [questionId, itemId]),
  );
  const results: TopicRelationWriteResult[] = [];
  const pendingActions: TopicRelationAction[] = [];
  let wroteRelation = false;
  for (const action of preview.actions) {
    const questionItemId = questionItemById.get(action.questionId);
    try {
      if (!questionItemId) throw new Error(`Question '${action.questionId}' disappeared before topic sync`);
      await setAttributeViewCell(
        client,
        binding.questionIndex.avId,
        binding.questionIndex.keys.topics_relation,
        questionItemId,
        relationCells(action.finalTopicIds.map((topicId) => topicItemById.get(topicId)!).filter(Boolean)),
      );
      wroteRelation = true;
      results.push({ questionId: action.questionId, status: "synced" });
    } catch (reason) {
      pendingActions.push(action);
      results.push({ questionId: action.questionId, status: "failed", message: errorMessage(reason) });
    }
  }
  const issues = [...preview.issues];
  if (wroteRelation) {
    const rebuilt = await rebuildTopicStatistics(client, binding);
    issues.push(...rebuilt.issues);
  }
  return { ...preview, actions: pendingActions, issues, results };
}

export async function rebuildTopicStatistics(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<{
  statistics: TopicStatistic[];
  issues: ScanMessage[];
  results: TopicStatisticWriteResult[];
}> {
  const [{ topics, issues }, attempts] = await Promise.all([
    readTopicIndex(client, binding),
    rebuildAttemptStatistics(client, binding),
  ]);
  const statistics: TopicStatistic[] = [];
  const results: TopicStatisticWriteResult[] = [];
  const writeIssues: ScanMessage[] = [];
  for (const topic of topics) {
    let attemptCount = 0;
    let wrongCount = 0;
    for (const questionId of topic.questionIds) {
      const aggregate = attempts.aggregates.get(questionId);
      attemptCount += aggregate?.attempts ?? 0;
      wrongCount += aggregate?.objectiveIncorrect ?? 0;
    }
    const wrongRate = attemptCount > 0 ? wrongCount / attemptCount : undefined;
    const statistic = {
      topicId: topic.topicId,
      questionCount: topic.questionIds.length,
      attemptCount,
      wrongCount,
      wrongRate,
    };
    statistics.push(statistic);
    try {
      await setAttributeViewCell(
        client,
        binding.topicIndex.avId,
        binding.topicIndex.keys.attempt_count,
        topic.itemId,
        numberCell(attemptCount),
      );
      await setAttributeViewCell(
        client,
        binding.topicIndex.avId,
        binding.topicIndex.keys.wrong_count,
        topic.itemId,
        numberCell(wrongCount),
      );
      await setAttributeViewCell(
        client,
        binding.topicIndex.avId,
        binding.topicIndex.keys.wrong_rate,
        topic.itemId,
        numberCell(wrongRate),
      );
      results.push({ topicId: topic.topicId, status: "synced" });
    } catch (reason) {
      const message = errorMessage(reason);
      results.push({ topicId: topic.topicId, status: "failed", message });
      writeIssues.push({
        code: "topic-statistics-write-failed",
        message: `Topic '${topic.topicId}' statistics were not fully written: ${message}`,
      });
    }
  }
  return { statistics, issues: [...issues, ...attempts.issues, ...writeIssues], results };
}

export async function resolveQuestionTopicResources(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  questionId: string,
): Promise<{ resources: TopicResourceProjection[]; issues: ScanMessage[] }> {
  const { result, questionAv } = await readTopicState(client, binding);
  const questionItemId = [...questionIdsByItemId(questionAv, binding)]
    .find(([, currentQuestionId]) => currentQuestionId === questionId)?.[0];
  if (!questionItemId) {
    return {
      resources: [],
      issues: [...result.issues, {
        code: "unknown-topic-resource-question",
        message: `Question '${questionId}' is not present in Question Index`,
        questionId,
      }],
    };
  }
  const relation = fieldValues(questionAv, binding.questionIndex.keys.topics_relation).get(questionItemId);
  const topicsByItem = new Map(result.topics.map((topic) => [topic.itemId, topic]));
  const seen = new Set<string>();
  const resources: TopicResourceProjection[] = [];
  for (const topicItemId of relation?.relation?.blockIDs ?? []) {
    const topic = topicsByItem.get(topicItemId);
    if (!topic) continue;
    for (const resource of topic.resources) {
      const identity = `${resource.type}:${resource.content}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      resources.push({ topicId: topic.topicId, topicName: topic.name, status: topic.status, resource });
    }
  }
  return { resources, issues: result.issues };
}

import type { SiyuanKernelClient } from "../types";
import type { QuestionBankBinding } from "../binding-schema";

export async function configureQuestionRelation(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  await client.request("/api/transactions", {
    session: "siyuan-damophus",
    app: "siyuan-damophus",
    reqId: Date.now(),
    transactions: [{
      doOperations: [{
        action: "updateAttrViewColRelation",
        avID: binding.attemptLog.avId,
        keyID: binding.attemptLog.keys.question_relation,
        id: binding.questionIndex.avId,
        backRelationKeyID: binding.questionIndex.keys.attempts_relation,
        isTwoWay: true,
        name: "Attempts",
        format: "Question",
      }],
    }],
  });
}

export async function configureTopicRelation(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  await client.request("/api/transactions", {
    session: "siyuan-damophus",
    app: "siyuan-damophus",
    reqId: Date.now(),
    transactions: [{
      doOperations: [{
        action: "updateAttrViewColRelation",
        avID: binding.questionIndex.avId,
        keyID: binding.questionIndex.keys.topics_relation,
        id: binding.topicIndex.avId,
        backRelationKeyID: binding.topicIndex.keys.questions_relation,
        isTwoWay: true,
        name: "Questions",
        format: "Topics",
      }],
    }],
  });
}

export const rollupDefinitions = [
  { field: "attempt_count", target: "attempt_id", operator: "Count all" },
  { field: "wrong_count", target: "wrong_value", operator: "Sum" },
  { field: "total_duration_ms", target: "duration_ms", operator: "Sum" },
] as const;

export const topicRollupDefinitions = [
  { field: "question_count", target: "question_id", operator: "Count all" },
] as const;

export async function configureQuestionRollups(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  await client.request("/api/transactions", {
    session: "siyuan-damophus",
    app: "siyuan-damophus",
    reqId: Date.now(),
    transactions: [{
      doOperations: rollupDefinitions.map((definition) => ({
        action: "updateAttrViewColRollup",
        id: binding.questionIndex.keys[definition.field],
        avID: binding.questionIndex.avId,
        parentID: binding.questionIndex.keys.attempts_relation,
        keyID: binding.attemptLog.keys[definition.target],
        data: { calc: { operator: definition.operator } },
      })),
    }],
  });
}

export async function configureTopicRollups(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  await client.request("/api/transactions", {
    session: "siyuan-damophus",
    app: "siyuan-damophus",
    reqId: Date.now(),
    transactions: [{
      doOperations: topicRollupDefinitions.map((definition) => ({
        action: "updateAttrViewColRollup",
        id: binding.topicIndex.keys[definition.field],
        avID: binding.topicIndex.avId,
        parentID: binding.topicIndex.keys.questions_relation,
        keyID: binding.questionIndex.keys[definition.target],
        data: { calc: { operator: definition.operator } },
      })),
    }],
  });
}

import {
  QuestionBankBindingSchema,
  attemptColumns,
  questionColumns,
  topicColumns,
  type AttemptField,
  type ColumnDefinition,
  type QuestionBankBinding,
  type QuestionField,
  type TopicField,
} from "../binding-schema";
import { questionRowIdentityMaps } from "../row-identity";
import type {
  AttributeViewKeyType,
  AttributeViewValue,
  RawAttributeView,
  SiyuanKernelClient,
} from "../types";
import { getAttributeView, valueText, valuesByItemId } from "./attribute-view";
import { rollupDefinitions, topicRollupDefinitions } from "./relations";

export interface BindingVerification {
  ok: boolean;
  errors: string[];
  fatalErrors: string[];
  missingManagedKeys: ManagedKeyRepair[];
}

export interface ManagedKeyRepair {
  kind: "add" | "changeType" | "normalizeValues" | "configureRelation" | "configureRollup"
    | "createDatabase" | "convertDurationUnit" | "rebindPrimary";
  database: "questionIndex" | "topicIndex" | "attemptLog";
  field: QuestionField | TopicField | AttemptField;
  keyId: string;
  name: string;
  type: AttributeViewKeyType;
  currentType?: AttributeViewKeyType;
  previousKeyId?: string;
}

export function pushRepair(repairs: ManagedKeyRepair[], repair: ManagedKeyRepair): void {
  if (!repairs.some((item) => item.kind === repair.kind
    && item.database === repair.database
    && item.field === repair.field)) repairs.push(repair);
}

function hasLegacyPayload(value: AttributeViewValue, type: AttributeViewKeyType): boolean {
  if (type === "select" || type === "mSelect") {
    return (value.text?.content !== undefined || value.number?.content !== undefined)
      && value.mSelect === undefined;
  }
  if (type === "number") {
    return value.text?.content !== undefined && value.number === undefined;
  }
  if (type === "date") {
    return value.text?.content !== undefined && value.date === undefined;
  }
  return false;
}

function verifyKeys<Field extends string>(
  av: RawAttributeView,
  expected: Record<Field, string>,
  columns: readonly ColumnDefinition<Field>[],
  primaryField: Field,
  database: ManagedKeyRepair["database"],
  fatalErrors: string[],
  missingManagedKeys: ManagedKeyRepair[],
): string | undefined {
  const byId = new Map(av.keyValues.map((value) => [value.key.id, value.key]));
  const expectedPrimaryId = expected[primaryField];
  const primary = byId.get(expectedPrimaryId);
  let recoveredPrimaryId: string | undefined;
  if (!primary || primary.type !== "block") {
    const nativePrimaryKeys = av.keyValues.filter((value) => value.key.type === "block");
    if (nativePrimaryKeys.length === 1) {
      const recovered = nativePrimaryKeys[0]!.key;
      expected[primaryField] = recovered.id;
      recoveredPrimaryId = recovered.id;
      pushRepair(missingManagedKeys, {
        kind: "rebindPrimary",
        database,
        field: primaryField as QuestionField | TopicField | AttemptField,
        keyId: recovered.id,
        previousKeyId: expectedPrimaryId,
        name: recovered.name,
        type: "block",
      });
    } else {
      fatalErrors.push(`Missing primary key '${primaryField}' in AV ${av.id}`);
    }
  }
  for (const column of columns) {
    const key = byId.get(expected[column.field as Field]);
    if (!key) {
      pushRepair(missingManagedKeys, {
        kind: "add",
        database,
        field: column.field as QuestionField | TopicField | AttemptField,
        keyId: expected[column.field as Field],
        name: column.name,
        type: column.type,
      });
    }
    else if (key.type !== column.type) {
      pushRepair(missingManagedKeys, {
        kind: "changeType",
        database,
        field: column.field as QuestionField | TopicField | AttemptField,
        keyId: expected[column.field as Field],
        name: key.name,
        type: column.type,
        currentType: key.type,
      });
    }
    else {
      const values = av.keyValues.find((item) => item.key.id === key.id)?.values ?? [];
      // Year is derived from the stable question ID. Its legacy numeric/text
      // payload is repaired by Question Index maintenance, so do not route it
      // through the generic value normalizer during binding repair.
      if (!(database === "questionIndex" && column.field === "year")
        && values.some((value) => hasLegacyPayload(value, column.type))) {
        pushRepair(missingManagedKeys, {
          kind: "normalizeValues",
          database,
          field: column.field as QuestionField | TopicField | AttemptField,
          keyId: key.id,
          name: key.name,
          type: column.type,
        });
      }
    }
  }
  return recoveredPrimaryId;
}

function relationNeedsBackfill(
  questionAv: RawAttributeView,
  attemptAv: RawAttributeView,
  binding: QuestionBankBinding,
): boolean {
  const identities = questionRowIdentityMaps(questionAv, binding.questionIndex.keys.block_id);
  const questionIds = valuesByItemId(questionAv, binding.questionIndex.keys.question_id);
  const rowByQuestionId = new Map<string, string>();
  for (const [valueBlockId, value] of questionIds) {
    const questionId = valueText(value);
    const itemId = identities.itemIdByValueBlockId.get(valueBlockId);
    if (questionId && itemId) rowByQuestionId.set(questionId, itemId);
  }
  const attemptIds = valuesByItemId(attemptAv, binding.attemptLog.keys.question_id);
  const relations = valuesByItemId(attemptAv, binding.attemptLog.keys.question_relation);
  for (const [itemId, value] of attemptIds) {
    const questionId = valueText(value);
    const expected = questionId ? rowByQuestionId.get(questionId) : undefined;
    if (!expected) continue;
    const actual = relations.get(itemId)?.relation?.blockIDs ?? [];
    if (actual.length !== 1 || actual[0] !== expected) return true;
  }
  return false;
}

export async function verifyQuestionBankBinding(
  client: SiyuanKernelClient,
  bindingInput: QuestionBankBinding,
): Promise<BindingVerification> {
  const parsed = QuestionBankBindingSchema.safeParse(bindingInput);
  if (!parsed.success) {
    const fatalErrors = parsed.error.issues.map((issue) => issue.message);
    return { ok: false, errors: fatalErrors, fatalErrors, missingManagedKeys: [] };
  }
  const binding = parsed.data as QuestionBankBinding;
  const fatalErrors: string[] = [];
  const missingManagedKeys: ManagedKeyRepair[] = [];
  try {
    const document = await client.request<{ kramdown: string }>("/api/block/getBlockKramdown", {
      id: binding.systemDocumentId,
    });
    for (const database of [binding.questionIndex, binding.attemptLog]) {
      if (!document.kramdown.includes(database.blockId) || !document.kramdown.includes(database.avId)) {
        fatalErrors.push(`System document no longer contains AV block ${database.blockId}`);
      }
    }
    const topicDatabasePresent = document.kramdown.includes(binding.topicIndex.blockId)
      && document.kramdown.includes(binding.topicIndex.avId);
    if (!topicDatabasePresent) {
      pushRepair(missingManagedKeys, {
        kind: "createDatabase",
        database: "topicIndex",
        field: "entry",
        keyId: binding.topicIndex.avId,
        name: "Topic Index",
        type: "block",
      });
    }
    const [questionAv, attemptAv] = await Promise.all([
      getAttributeView(client, binding.questionIndex.avId),
      getAttributeView(client, binding.attemptLog.avId),
    ]);
    let topicAv: RawAttributeView | undefined;
    if (topicDatabasePresent) {
      try {
        topicAv = await getAttributeView(client, binding.topicIndex.avId);
      } catch {
        pushRepair(missingManagedKeys, {
          kind: "createDatabase",
          database: "topicIndex",
          field: "entry",
          keyId: binding.topicIndex.avId,
          name: "Topic Index",
          type: "block",
        });
      }
    }
    const recoveredQuestionPrimary = verifyKeys(
      questionAv,
      binding.questionIndex.keys,
      questionColumns,
      "block_id",
      "questionIndex",
      fatalErrors,
      missingManagedKeys,
    );
    if (recoveredQuestionPrimary) bindingInput.questionIndex.keys.block_id = recoveredQuestionPrimary;
    const durationKey = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.duration_ms,
    )?.key;
    if (durationKey?.name === "Duration (ms)") {
      pushRepair(missingManagedKeys, {
        kind: "convertDurationUnit",
        database: "attemptLog",
        field: "duration_ms",
        keyId: durationKey.id,
        name: "Duration (min)",
        type: "number",
      });
    }
    const totalDurationKey = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.total_duration_ms,
    )?.key;
    if (totalDurationKey?.name === "Total Duration (ms)") {
      pushRepair(missingManagedKeys, {
        kind: "convertDurationUnit",
        database: "questionIndex",
        field: "total_duration_ms",
        keyId: totalDurationKey.id,
        name: "Total Duration (min)",
        type: "rollup",
      });
    }
    const recoveredAttemptPrimary = verifyKeys(
      attemptAv,
      binding.attemptLog.keys,
      attemptColumns,
      "entry",
      "attemptLog",
      fatalErrors,
      missingManagedKeys,
    );
    if (recoveredAttemptPrimary) bindingInput.attemptLog.keys.entry = recoveredAttemptPrimary;
    if (topicAv) {
      const recoveredTopicPrimary = verifyKeys(
        topicAv,
        binding.topicIndex.keys,
        topicColumns,
        "entry",
        "topicIndex",
        fatalErrors,
        missingManagedKeys,
      );
      if (recoveredTopicPrimary) bindingInput.topicIndex.keys.entry = recoveredTopicPrimary;
    }
    const relationKey = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.question_relation,
    )?.key;
    const backRelationKey = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.attempts_relation,
    )?.key;
    if (relationKey && backRelationKey
      && (relationKey.relation?.avID !== binding.questionIndex.avId
        || relationKey.relation.isTwoWay !== true
        || relationKey.relation.backKeyID !== binding.questionIndex.keys.attempts_relation
        || backRelationKey.relation?.avID !== binding.attemptLog.avId
        || backRelationKey.relation.isTwoWay !== true
        || backRelationKey.relation.backKeyID !== binding.attemptLog.keys.question_relation)) {
      pushRepair(missingManagedKeys, {
        kind: "configureRelation",
        database: "attemptLog",
        field: "question_relation",
        keyId: binding.attemptLog.keys.question_relation,
        name: relationKey.name,
        type: "relation",
      });
    }
    if (relationKey && relationNeedsBackfill(questionAv, attemptAv, binding)) {
      pushRepair(missingManagedKeys, {
        kind: "normalizeValues",
        database: "attemptLog",
        field: "question_relation",
        keyId: binding.attemptLog.keys.question_relation,
        name: relationKey.name,
        type: "relation",
      });
    }
    const topicRelationKey = questionAv.keyValues.find(
      (value) => value.key.id === binding.questionIndex.keys.topics_relation,
    )?.key;
    const topicBackRelationKey = topicAv?.keyValues.find(
      (value) => value.key.id === binding.topicIndex.keys.questions_relation,
    )?.key;
    if (topicRelationKey && topicBackRelationKey
      && (topicRelationKey.relation?.avID !== binding.topicIndex.avId
        || topicRelationKey.relation.isTwoWay !== true
        || topicRelationKey.relation.backKeyID !== binding.topicIndex.keys.questions_relation
        || topicBackRelationKey.relation?.avID !== binding.questionIndex.avId
        || topicBackRelationKey.relation.isTwoWay !== true
        || topicBackRelationKey.relation.backKeyID !== binding.questionIndex.keys.topics_relation)) {
      pushRepair(missingManagedKeys, {
        kind: "configureRelation",
        database: "questionIndex",
        field: "topics_relation",
        keyId: binding.questionIndex.keys.topics_relation,
        name: topicRelationKey.name,
        type: "relation",
      });
    }
    const primaryAttemptRows = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.entry,
    )?.values ?? [];
    const wrongValues = valuesByItemId(attemptAv, binding.attemptLog.keys.wrong_value);
    const wrongKey = attemptAv.keyValues.find(
      (value) => value.key.id === binding.attemptLog.keys.wrong_value,
    )?.key;
    if (wrongKey && primaryAttemptRows.some((row) => wrongValues.get(row.blockID)?.number?.isNotEmpty !== true)) {
      pushRepair(missingManagedKeys, {
        kind: "normalizeValues",
        database: "attemptLog",
        field: "wrong_value",
        keyId: wrongKey.id,
        name: wrongKey.name,
        type: "number",
      });
    }
    for (const definition of rollupDefinitions) {
      const key = questionAv.keyValues.find(
        (value) => value.key.id === binding.questionIndex.keys[definition.field],
      )?.key;
      if (!key) continue;
      if (key.rollup?.relationKeyID !== binding.questionIndex.keys.attempts_relation
        || key.rollup.keyID !== binding.attemptLog.keys[definition.target]
        || key.rollup.calc?.operator !== definition.operator) {
        pushRepair(missingManagedKeys, {
          kind: "configureRollup",
          database: "questionIndex",
          field: definition.field,
          keyId: key.id,
          name: key.name,
          type: "rollup",
        });
      }
    }
    if (topicAv) {
      for (const definition of topicRollupDefinitions) {
        const key = topicAv.keyValues.find(
          (value) => value.key.id === binding.topicIndex.keys[definition.field],
        )?.key;
        if (!key) continue;
        if (key.rollup?.relationKeyID !== binding.topicIndex.keys.questions_relation
          || key.rollup.keyID !== binding.questionIndex.keys[definition.target]
          || key.rollup.calc?.operator !== definition.operator) {
          pushRepair(missingManagedKeys, {
            kind: "configureRollup",
            database: "topicIndex",
            field: definition.field,
            keyId: key.id,
            name: key.name,
            type: "rollup",
          });
        }
      }
    }
  } catch (error) {
    fatalErrors.push(error instanceof Error ? error.message : String(error));
  }
  const repairErrors = missingManagedKeys.map((repair) => {
    if (repair.kind === "add") return `Missing managed key '${String(repair.field)}' in ${repair.database}`;
    if (repair.kind === "changeType") {
      return `Managed key '${String(repair.field)}' has type '${repair.currentType}', expected '${repair.type}'`;
    }
    return `Managed key '${String(repair.field)}' requires ${repair.kind}`;
  });
  const errors = [...fatalErrors, ...repairErrors];
  return {
    ok: errors.length === 0,
    errors,
    fatalErrors,
    missingManagedKeys,
  };
}

export async function requireQuestionBankBinding(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  const verification = await verifyQuestionBankBinding(client, binding);
  if (!verification.ok) {
    throw new Error(`Question bank binding is invalid: ${verification.errors.join("; ")}`);
  }
}

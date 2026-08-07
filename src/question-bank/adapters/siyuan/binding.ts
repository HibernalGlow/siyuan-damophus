import { z } from "zod";
import {
  dateCell,
  durationMinutesFromMilliseconds,
  multiSelectCell,
  numberCell,
  relationCell,
  selectCell,
  setAttributeViewCell,
} from "./cells";
import type {
  AttributeViewCellInput,
} from "./cells";
import type {
  AttributeViewKeyType,
  AttributeViewValue,
  RawAttributeView,
  SiyuanKernelClient,
} from "./types";
import { questionRowIdentityMaps } from "./row-identity";
import {
  attemptColumns,
  QuestionBankBindingSchema,
  QuestionBankBindingV3Schema,
  QuestionBankBindingV2Schema,
  LegacyQuestionBankBindingSchema,
  questionColumns,
  topicColumns,
  type AttemptField,
  type ColumnDefinition,
  type InitializeQuestionBankInput,
  type PlannedColumn,
  type QuestionBankBinding,
  type QuestionBankInitializationPreview,
  type QuestionField,
  type TopicField,
} from "./binding-schema";
import { databaseMarkdown, hashToken, migratedKeyId, primaryKeyId } from "./binding-utils";

export {
  QuestionBankBindingSchema,
  questionFields,
  topicFields,
  attemptFields,
} from "./binding-schema";
export type {
  AttemptField,
  AttributeViewBinding,
  InitializeQuestionBankInput,
  PlannedColumn,
  QuestionBankBinding,
  QuestionBankInitializationPreview,
  QuestionField,
  TopicField,
} from "./binding-schema";

async function getAttributeView(client: SiyuanKernelClient, avId: string): Promise<RawAttributeView> {
  const response = await client.request<{ av: RawAttributeView }>("/api/av/getAttributeView", { id: avId });
  return response.av;
}

async function initializeAttributeView<Field extends string>(
  client: SiyuanKernelClient,
  avId: string,
  blockId: string,
  primaryField: Field,
  columns: readonly PlannedColumn<Field>[],
): Promise<Record<Field, string>> {
  await client.request("/api/av/renderAttributeView", {
    id: avId,
    blockID: blockId,
    viewID: "",
    page: 1,
    pageSize: 1,
    query: "",
    groupPaging: {},
    createIfNotExist: true,
  });
  const av = await getAttributeView(client, avId);
  const keys = { [primaryField]: primaryKeyId(av) } as Record<Field, string>;
  let previousKeyID = keys[primaryField];
  for (const column of columns) {
    await client.request("/api/av/addAttributeViewKey", {
      avID: avId,
      keyID: column.keyId,
      keyName: column.name,
      keyType: column.type,
      keyIcon: "",
      previousKeyID,
    });
    keys[column.field as Field] = column.keyId;
    previousKeyID = column.keyId;
  }
  return keys;
}

type VersionThreeBinding = z.infer<typeof QuestionBankBindingV3Schema>;

function upgradeVersionThreeBinding(binding: VersionThreeBinding): QuestionBankBinding {
  const topicKeys = Object.fromEntries([
    "entry",
    ...topicColumns.map((column) => column.field),
  ].map((field) => [field, migratedKeyId(binding, `topic-index:${field}`)])) as Record<TopicField, string>;
  return {
    schemaVersion: 4,
    notebookId: binding.notebookId,
    systemDocumentId: binding.systemDocumentId,
    questionIndex: {
      ...binding.questionIndex,
      keys: {
        ...binding.questionIndex.keys,
        topics_relation: migratedKeyId(binding, "topics_relation"),
      },
    },
    topicIndex: {
      blockId: migratedKeyId(binding, "topic-index:block"),
      avId: migratedKeyId(binding, "topic-index:av"),
      keys: topicKeys,
    },
    attemptLog: binding.attemptLog,
  };
}

export function migrateQuestionBankBinding(value: unknown): QuestionBankBinding | undefined {
  const current = QuestionBankBindingSchema.safeParse(value);
  if (current.success) return current.data as QuestionBankBinding;
  const versionThree = QuestionBankBindingV3Schema.safeParse(value);
  if (versionThree.success) return upgradeVersionThreeBinding(versionThree.data);
  const versionTwo = QuestionBankBindingV2Schema.safeParse(value);
  if (versionTwo.success) {
    const binding = versionTwo.data;
    return upgradeVersionThreeBinding({
      schemaVersion: 3,
      notebookId: binding.notebookId,
      systemDocumentId: binding.systemDocumentId,
      questionIndex: binding.questionIndex,
      attemptLog: {
        ...binding.attemptLog,
        keys: {
          ...binding.attemptLog.keys,
          event_kind: migratedKeyId(binding, "event_kind"),
          session_mode: migratedKeyId(binding, "session_mode"),
          rating_source: migratedKeyId(binding, "rating_source"),
          exam_status: migratedKeyId(binding, "exam_status"),
          exam_score: migratedKeyId(binding, "exam_score"),
          exam_max_score: migratedKeyId(binding, "exam_max_score"),
          exam_duration_ms: migratedKeyId(binding, "exam_duration_ms"),
          exam_payload: migratedKeyId(binding, "exam_payload"),
        },
      },
    } as VersionThreeBinding);
  }
  const legacy = LegacyQuestionBankBindingSchema.safeParse(value);
  if (!legacy.success) return undefined;
  const binding = legacy.data;
  return upgradeVersionThreeBinding({
    schemaVersion: 3,
    notebookId: binding.notebookId,
    systemDocumentId: binding.systemDocumentId,
    questionIndex: {
      ...binding.questionIndex,
      keys: {
        ...binding.questionIndex.keys,
        attempts_relation: migratedKeyId(binding, "attempts_relation"),
        attempt_count: migratedKeyId(binding, "attempt_count"),
        wrong_count: migratedKeyId(binding, "wrong_count"),
        total_duration_ms: migratedKeyId(binding, "total_duration_ms"),
      },
    },
    attemptLog: {
      ...binding.attemptLog,
      keys: {
        ...binding.attemptLog.keys,
        wrong_value: migratedKeyId(binding, "wrong_value"),
        event_kind: migratedKeyId(binding, "event_kind"),
        session_mode: migratedKeyId(binding, "session_mode"),
        rating_source: migratedKeyId(binding, "rating_source"),
        exam_status: migratedKeyId(binding, "exam_status"),
        exam_score: migratedKeyId(binding, "exam_score"),
        exam_max_score: migratedKeyId(binding, "exam_max_score"),
        exam_duration_ms: migratedKeyId(binding, "exam_duration_ms"),
        exam_payload: migratedKeyId(binding, "exam_payload"),
      },
    },
  } as VersionThreeBinding);
}

function initializationToken(preview: Omit<QuestionBankInitializationPreview, "token">): string {
  return hashToken(preview);
}

const bindingAttribute = "custom-damophus-question-bank-binding";

async function configureQuestionRelation(
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

async function persistQuestionBankBinding(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<void> {
  await client.request("/api/attr/setBlockAttrs", {
    id: binding.systemDocumentId,
    attrs: { [bindingAttribute]: JSON.stringify(binding) },
  });
}

export function previewQuestionBankInitialization(
  input: InitializeQuestionBankInput,
): QuestionBankInitializationPreview {
  const questionBlockId = input.idGenerator();
  const questionAvId = input.idGenerator();
  const topicBlockId = input.idGenerator();
  const topicAvId = input.idGenerator();
  const attemptBlockId = input.idGenerator();
  const attemptAvId = input.idGenerator();
  const preview = {
    notebookId: input.notebookId,
    path: input.path,
    questionBlockId,
    questionAvId,
    topicBlockId,
    topicAvId,
    attemptBlockId,
    attemptAvId,
    questionColumns: questionColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
    topicColumns: topicColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
    attemptColumns: attemptColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
  };
  return { ...preview, token: initializationToken(preview) };
}

export async function confirmQuestionBankInitialization(
  client: SiyuanKernelClient,
  preview: QuestionBankInitializationPreview,
  expectedToken: string,
): Promise<QuestionBankBinding> {
  const { token: _token, ...plan } = preview;
  if (expectedToken !== preview.token || initializationToken(plan) !== preview.token) {
    throw new Error("Question bank initialization preview is stale or modified");
  }
  const existing = await client.request<string[]>("/api/filetree/getIDsByHPath", {
    notebook: preview.notebookId,
    path: preview.path,
  });
  if (existing.length > 0) {
    throw new Error(`A Damophus system document already exists (${existing[0]}); reconnect it instead`);
  }
  const markdown = [
    "# Damophus",
    "",
    "## Question Index",
    databaseMarkdown(preview.questionBlockId, preview.questionAvId),
    "",
    "## Topic Index",
    databaseMarkdown(preview.topicBlockId, preview.topicAvId),
    "",
    "## Attempt Log",
    databaseMarkdown(preview.attemptBlockId, preview.attemptAvId),
  ].join("\n");
  const systemDocumentId = await client.request<string>("/api/filetree/createDocWithMd", {
    notebook: preview.notebookId,
    path: preview.path,
    markdown,
  });
  const createdDocument = await client.request<{ kramdown: string }>("/api/block/getBlockKramdown", {
    id: systemDocumentId,
  });
  if (!createdDocument.kramdown.includes(preview.questionBlockId)
    || !createdDocument.kramdown.includes(preview.questionAvId)
    || !createdDocument.kramdown.includes(preview.topicBlockId)
    || !createdDocument.kramdown.includes(preview.topicAvId)
    || !createdDocument.kramdown.includes(preview.attemptBlockId)
    || !createdDocument.kramdown.includes(preview.attemptAvId)) {
    throw new Error("The /Damophus path was occupied during initialization; reconnect the existing document");
  }
  try {
    const questionKeys = await initializeAttributeView(
      client,
      preview.questionAvId,
      preview.questionBlockId,
      "block_id" as QuestionField,
      preview.questionColumns,
    );
    const attemptKeys = await initializeAttributeView(
      client,
      preview.attemptAvId,
      preview.attemptBlockId,
      "entry" as AttemptField,
      preview.attemptColumns,
    );
    const topicKeys = await initializeAttributeView(
      client,
      preview.topicAvId,
      preview.topicBlockId,
      "entry" as TopicField,
      preview.topicColumns,
    );
    const binding: QuestionBankBinding = {
      schemaVersion: 4,
      notebookId: preview.notebookId,
      systemDocumentId,
      questionIndex: {
        avId: preview.questionAvId,
        blockId: preview.questionBlockId,
        keys: questionKeys,
      },
      topicIndex: { avId: preview.topicAvId, blockId: preview.topicBlockId, keys: topicKeys },
      attemptLog: { avId: preview.attemptAvId, blockId: preview.attemptBlockId, keys: attemptKeys },
    };
    await configureQuestionRelation(client, binding);
    await configureTopicRelation(client, binding);
    await configureQuestionRollups(client, binding);
    await configureTopicRollups(client, binding);
    const verification = await verifyQuestionBankBinding(client, binding);
    if (!verification.ok) {
      throw new Error(`Question bank initialization verification failed: ${verification.errors.join("; ")}`);
    }
    await persistQuestionBankBinding(client, binding);
    return binding;
  } catch (error) {
    try {
      await client.request("/api/filetree/removeDocByID", { id: systemDocumentId });
    } catch (cleanupError) {
      throw new Error(
        `Question bank initialization failed and cleanup also failed: ${error instanceof Error ? error.message : String(error)}; ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`,
      );
    }
    throw error;
  }
}

export interface QuestionBankRebindingPreview {
  token: string;
  systemDocumentId: string;
  binding: QuestionBankBinding;
  bindingRepairs: ManagedKeyRepair[];
}

function rebindingToken(binding: QuestionBankBinding, bindingRepairs: readonly ManagedKeyRepair[]): string {
  return hashToken({ binding, bindingRepairs });
}

export async function previewQuestionBankRebinding(
  client: SiyuanKernelClient,
  systemDocumentId: string,
): Promise<QuestionBankRebindingPreview> {
  const attrs = await client.request<Record<string, string>>("/api/attr/getBlockAttrs", {
    id: systemDocumentId,
  });
  const source = attrs[bindingAttribute];
  if (!source) {
    throw new Error("This document has no Damophus question-bank binding manifest");
  }
  let value: unknown;
  try {
    value = JSON.parse(source);
  } catch {
    throw new Error("The Damophus question-bank binding manifest is invalid JSON");
  }
  const binding = migrateQuestionBankBinding(value);
  if (!binding) throw new Error("The Damophus question-bank binding manifest is invalid");
  if (binding.systemDocumentId !== systemDocumentId) {
    throw new Error("The binding manifest belongs to a different system document");
  }
  const verification = await verifyQuestionBankBinding(client, binding);
  if (verification.fatalErrors.length > 0) {
    throw new Error(`Question bank binding is invalid: ${verification.fatalErrors.join("; ")}`);
  }
  return {
    token: rebindingToken(binding, verification.missingManagedKeys),
    systemDocumentId,
    binding,
    bindingRepairs: verification.missingManagedKeys,
  };
}

export async function confirmQuestionBankRebinding(
  client: SiyuanKernelClient,
  systemDocumentId: string,
  expectedToken: string,
): Promise<QuestionBankBinding> {
  const preview = await previewQuestionBankRebinding(client, systemDocumentId);
  if (preview.token !== expectedToken) {
    throw new Error("Question bank rebinding preview is stale; preview it again");
  }
  await repairQuestionBankBinding(client, preview.binding, preview.bindingRepairs);
  return preview.binding;
}

export interface BindingVerification {
  ok: boolean;
  errors: string[];
  fatalErrors: string[];
  missingManagedKeys: ManagedKeyRepair[];
}

export interface ManagedKeyRepair {
  kind: "add" | "changeType" | "normalizeValues" | "configureRelation" | "configureRollup"
    | "createDatabase" | "convertDurationUnit";
  database: "questionIndex" | "topicIndex" | "attemptLog";
  field: QuestionField | TopicField | AttemptField;
  keyId: string;
  name: string;
  type: AttributeViewKeyType;
  currentType?: AttributeViewKeyType;
}

async function configureTopicRelation(
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

function pushRepair(repairs: ManagedKeyRepair[], repair: ManagedKeyRepair): void {
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

const rollupDefinitions = [
  { field: "attempt_count", target: "attempt_id", operator: "Count all" },
  { field: "wrong_count", target: "wrong_value", operator: "Sum" },
  { field: "total_duration_ms", target: "duration_ms", operator: "Sum" },
] as const;

const topicRollupDefinitions = [
  { field: "question_count", target: "question_id", operator: "Count all" },
] as const;

async function configureQuestionRollups(
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

async function configureTopicRollups(
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

function verifyKeys<Field extends string>(
  av: RawAttributeView,
  expected: Record<Field, string>,
  columns: readonly ColumnDefinition<Field>[],
  primaryField: Field,
  database: ManagedKeyRepair["database"],
  fatalErrors: string[],
  missingManagedKeys: ManagedKeyRepair[],
): void {
  const byId = new Map(av.keyValues.map((value) => [value.key.id, value.key]));
  const primary = byId.get(expected[primaryField]);
  if (!primary || primary.type !== "block") fatalErrors.push(`Missing primary key '${primaryField}' in AV ${av.id}`);
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
}

function valuesByItemId(av: RawAttributeView, keyId: string): Map<string, AttributeViewValue> {
  const values = av.keyValues.find((item) => item.key.id === keyId)?.values ?? [];
  return new Map(values.map((value) => [value.blockID, value]));
}

function valueText(value: AttributeViewValue | undefined): string | undefined {
  return value?.mSelect?.[0]?.content ?? value?.text?.content;
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
    verifyKeys(
      questionAv,
      binding.questionIndex.keys,
      questionColumns,
      "block_id",
      "questionIndex",
      fatalErrors,
      missingManagedKeys,
    );
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
    verifyKeys(
      attemptAv,
      binding.attemptLog.keys,
      attemptColumns,
      "entry",
      "attemptLog",
      fatalErrors,
      missingManagedKeys,
    );
    if (topicAv) {
      verifyKeys(
        topicAv,
        binding.topicIndex.keys,
        topicColumns,
        "entry",
        "topicIndex",
        fatalErrors,
        missingManagedKeys,
      );
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

function repairIdentity(repair: ManagedKeyRepair): string {
  return `${repair.kind}:${repair.database}:${String(repair.field)}:${repair.keyId}:${repair.currentType ?? ""}->${repair.type}`;
}

async function createMissingTopicIndex(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  repairs: readonly ManagedKeyRepair[],
): Promise<void> {
  if (!repairs.some((repair) => repair.kind === "createDatabase" && repair.database === "topicIndex")) return;
  const document = await client.request<{ kramdown: string }>("/api/block/getBlockKramdown", {
    id: binding.systemDocumentId,
  });
  if (!document.kramdown.includes(binding.topicIndex.blockId)
    || !document.kramdown.includes(binding.topicIndex.avId)) {
    await client.request("/api/block/appendBlock", {
      dataType: "markdown",
      data: [
        "## Topic Index",
        databaseMarkdown(binding.topicIndex.blockId, binding.topicIndex.avId),
      ].join("\n"),
      parentID: binding.systemDocumentId,
    });
  }
  binding.topicIndex.keys = await initializeAttributeView(
    client,
    binding.topicIndex.avId,
    binding.topicIndex.blockId,
    "entry" as TopicField,
    topicColumns.map((column) => ({
      ...column,
      keyId: binding.topicIndex.keys[column.field],
    })),
  );
}

async function addMissingManagedKeys(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  database: ManagedKeyRepair["database"],
  repairs: readonly ManagedKeyRepair[],
): Promise<void> {
  const databaseRepairs = repairs.filter((item) => item.database === database && item.kind === "add");
  if (databaseRepairs.length === 0) return;
  const target = binding[database];
  const av = await getAttributeView(client, target.avId);
  let previousKeyID = av.keyValues.at(-1)?.key.id;
  if (!previousKeyID) throw new Error(`Attribute view ${target.avId} has no keys`);
  for (const repair of databaseRepairs) {
    await client.request("/api/av/addAttributeViewKey", {
      avID: target.avId,
      keyID: repair.keyId,
      keyName: repair.name,
      keyType: repair.type,
      keyIcon: "",
      previousKeyID,
    });
    previousKeyID = repair.keyId;
  }
}

async function changeManagedKeyTypes(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  database: ManagedKeyRepair["database"],
  repairs: readonly ManagedKeyRepair[],
): Promise<void> {
  const databaseRepairs = repairs.filter(
    (item) => item.database === database && item.kind === "changeType",
  );
  if (databaseRepairs.length === 0) return;
  const target = binding[database];
  const av = await getAttributeView(client, target.avId);
  const keysById = new Map(av.keyValues.map((keyValues) => [keyValues.key.id, keyValues.key]));
  await client.request("/api/transactions", {
    session: "siyuan-damophus",
    app: "siyuan-damophus",
    reqId: Date.now(),
    transactions: [{
      doOperations: databaseRepairs.map((repair) => {
        const key = keysById.get(repair.keyId);
        if (!key) throw new Error(`Managed key '${String(repair.field)}' disappeared before repair`);
        return {
          action: "updateAttrViewCol",
          avID: target.avId,
          id: repair.keyId,
          name: key.name,
          type: repair.type,
        };
      }),
    }],
  });
}

function selectColor(field: string, content: string): string {
  const semantic: Record<string, Record<string, string>> = {
    question_type: { single: "8", multiple: "6", indefinite: "13", "true-false": "4", subjective: "2", group: "12" },
    objective_correct: { true: "6", false: "1" },
    mastery_rating: { again: "1", hard: "2", good: "6", easy: "8" },
  };
  return semantic[field]?.[content] ?? String((Math.abs([...content].reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(0), 16777619),
    2166136261,
  )) % 13) + 1);
}

function valueNumber(value: AttributeViewValue | undefined): number | undefined {
  if (value?.number?.isNotEmpty !== false && value?.number?.content !== undefined) {
    return value.number.content;
  }
  const text = valueText(value);
  if (!text) return undefined;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function valueDate(value: AttributeViewValue | undefined): number | undefined {
  if (value?.date?.isNotEmpty !== false && value?.date?.content !== undefined) return value.date.content;
  const text = valueText(value);
  if (!text) return undefined;
  const numeric = Number(text);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(text);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function valueArray(value: AttributeViewValue | undefined): string[] {
  if (value?.mSelect) return value.mSelect.map((item) => item.content);
  const text = value?.text?.content;
  if (!text) return [];
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) return parsed;
  } catch {
    // Legacy hand-edited rows may contain comma-separated values.
  }
  return text.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizedCell(
  field: string,
  value: AttributeViewValue,
  convertDurationUnit: boolean,
): AttributeViewCellInput | undefined {
  if (["question_type", "year", "subject", "category", "collection", "source", "status", "objective_correct", "mastery_rating"]
    .includes(field)) {
    const content = field === "year" && value.number?.content !== undefined
      ? String(value.number.content)
      : valueText(value);
    return selectCell(content, content ? selectColor(field, content) : "1");
  }
  if (["option_order", "selected_option_ids", "laws", "categories"].includes(field)) {
    return multiSelectCell(valueArray(value), "8");
  }
  if (["schema_version", "subjective_score", "duration_ms", "attempt_count", "wrong_count", "wrong_rate"]
    .includes(field)) {
    const content = valueNumber(value);
    return numberCell(field === "duration_ms" && convertDurationUnit
      ? durationMinutesFromMilliseconds(content)
      : content);
  }
  if (field === "last_scanned_at" || field === "answered_at") return dateCell(valueDate(value));
  return undefined;
}

async function normalizeManagedValues(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  repairs: readonly ManagedKeyRepair[],
): Promise<void> {
  const [questionAv, attemptAv] = await Promise.all([
    getAttributeView(client, binding.questionIndex.avId),
    getAttributeView(client, binding.attemptLog.avId),
  ]);
  for (const database of ["questionIndex", "topicIndex", "attemptLog"] as const) {
    const target = binding[database];
    const av = database === "questionIndex"
      ? questionAv
      : database === "topicIndex"
        ? await getAttributeView(client, binding.topicIndex.avId)
        : attemptAv;
    const fields = new Set(repairs
      .filter((repair) => repair.database === database
        && ["add", "changeType", "normalizeValues", "convertDurationUnit"].includes(repair.kind))
      .map((repair) => String(repair.field)));
    for (const field of fields) {
      if (field === "wrong_value" || field === "question_relation") continue;
      const keyId = target.keys[field as keyof typeof target.keys];
      const values = av.keyValues.find((item) => item.key.id === keyId)?.values ?? [];
      const convertDurationUnit = repairs.some((repair) => repair.database === database
        && repair.field === field && repair.kind === "convertDurationUnit");
      for (const value of values) {
        const cell = normalizedCell(field, value, convertDurationUnit);
        if (cell) await setAttributeViewCell(client, target.avId, keyId, value.blockID, cell);
      }
    }
  }

  const attemptPrimary = attemptAv.keyValues.find(
    (item) => item.key.id === binding.attemptLog.keys.entry,
  )?.values ?? [];
  if (repairs.some((repair) => repair.database === "attemptLog" && repair.field === "wrong_value")) {
    const objectiveValues = valuesByItemId(attemptAv, binding.attemptLog.keys.objective_correct);
    for (const row of attemptPrimary) {
      const objective = valueText(objectiveValues.get(row.blockID));
      await setAttributeViewCell(
        client,
        binding.attemptLog.avId,
        binding.attemptLog.keys.wrong_value,
        row.blockID,
        numberCell(objective === "false" ? 1 : 0),
      );
    }
  }

  if (repairs.some((repair) => repair.database === "attemptLog"
    && repair.field === "question_relation")) {
    const identities = questionRowIdentityMaps(questionAv, binding.questionIndex.keys.block_id);
    const questionIds = valuesByItemId(questionAv, binding.questionIndex.keys.question_id);
    const rowByQuestionId = new Map<string, string>();
    for (const [valueBlockId, value] of questionIds) {
      const questionId = valueText(value);
      const itemId = identities.itemIdByValueBlockId.get(valueBlockId);
      if (questionId && itemId) rowByQuestionId.set(questionId, itemId);
    }
    const attemptQuestionIds = valuesByItemId(attemptAv, binding.attemptLog.keys.question_id);
    for (const row of attemptPrimary) {
      const questionId = valueText(attemptQuestionIds.get(row.blockID));
      const questionRowId = questionId ? rowByQuestionId.get(questionId) : undefined;
      if (!questionRowId) continue;
      await setAttributeViewCell(
        client,
        binding.attemptLog.avId,
        binding.attemptLog.keys.question_relation,
        row.blockID,
        relationCell(questionRowId),
      );
    }
  }
}

async function updateDurationUnitLabels(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  repairs: readonly ManagedKeyRepair[],
): Promise<void> {
  for (const database of ["questionIndex", "topicIndex", "attemptLog"] as const) {
    const databaseRepairs = repairs.filter(
      (repair) => repair.database === database && repair.kind === "convertDurationUnit",
    );
    if (databaseRepairs.length === 0) continue;
    const target = binding[database];
    await client.request("/api/transactions", {
      session: "siyuan-damophus",
      app: "siyuan-damophus",
      reqId: Date.now(),
      transactions: [{
        doOperations: databaseRepairs.map((repair) => ({
          action: "updateAttrViewCol",
          avID: target.avId,
          id: repair.keyId,
          name: repair.name,
          type: repair.type,
        })),
      }],
    });
  }
}

export async function repairQuestionBankBinding(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  expectedRepairs: readonly ManagedKeyRepair[],
): Promise<void> {
  const verification = await verifyQuestionBankBinding(client, binding);
  if (verification.fatalErrors.length > 0) {
    throw new Error(`Question bank binding is invalid: ${verification.fatalErrors.join("; ")}`);
  }
  const actual = verification.missingManagedKeys.map(repairIdentity).sort();
  const expected = expectedRepairs.map(repairIdentity).sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Question bank binding repair preview is stale; scan again before confirming");
  }
  await createMissingTopicIndex(client, binding, verification.missingManagedKeys);
  await addMissingManagedKeys(client, binding, "questionIndex", verification.missingManagedKeys);
  await addMissingManagedKeys(client, binding, "topicIndex", verification.missingManagedKeys);
  await addMissingManagedKeys(client, binding, "attemptLog", verification.missingManagedKeys);
  await changeManagedKeyTypes(client, binding, "questionIndex", verification.missingManagedKeys);
  await changeManagedKeyTypes(client, binding, "topicIndex", verification.missingManagedKeys);
  await changeManagedKeyTypes(client, binding, "attemptLog", verification.missingManagedKeys);
  await normalizeManagedValues(client, binding, verification.missingManagedKeys);
  await updateDurationUnitLabels(client, binding, verification.missingManagedKeys);
  if (verification.missingManagedKeys.some((repair) => repair.kind === "configureRelation"
    || repair.field === "attempts_relation")) {
    await configureQuestionRelation(client, binding);
  }
  if (verification.missingManagedKeys.some((repair) => repair.kind === "createDatabase"
    || repair.kind === "configureRelation" && repair.field === "topics_relation"
    || repair.field === "topics_relation" || repair.field === "questions_relation")) {
    await configureTopicRelation(client, binding);
  }
  if (verification.missingManagedKeys.some((repair) => repair.kind === "configureRollup"
    || rollupDefinitions.some((definition) => definition.field === repair.field))) {
    await configureQuestionRollups(client, binding);
  }
  if (verification.missingManagedKeys.some((repair) => repair.kind === "createDatabase"
    || repair.kind === "configureRollup" && repair.database === "topicIndex"
    || topicRollupDefinitions.some((definition) => definition.field === repair.field))) {
    await configureTopicRollups(client, binding);
  }
  await persistQuestionBankBinding(client, binding);
  const repaired = await verifyQuestionBankBinding(client, binding);
  if (!repaired.ok) {
    throw new Error(`Question bank binding repair failed: ${repaired.errors.join("; ")}`);
  }
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

export async function readAttributeView(
  client: SiyuanKernelClient,
  avId: string,
): Promise<RawAttributeView> {
  return getAttributeView(client, avId);
}

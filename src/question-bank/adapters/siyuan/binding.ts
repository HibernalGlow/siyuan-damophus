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
  NodeIdGenerator,
  RawAttributeView,
  SiyuanKernelClient,
} from "./types";
import { questionRowIdentityMaps } from "./row-identity";

const legacyQuestionFields = [
  "block_id",
  "question_id",
  "question_type",
  "year",
  "subject",
  "category",
  "collection",
  "source",
  "topic_id",
  "parent_id",
  "last_scanned_at",
] as const;

const legacyAttemptFields = [
  "entry",
  "schema_version",
  "attempt_id",
  "question_id",
  "question_relation",
  "session_id",
  "answered_at",
  "question_type",
  "option_order",
  "selected_option_ids",
  "objective_correct",
  "mastery_rating",
  "subjective_score",
  "duration_ms",
] as const;

const versionTwoAttemptFields = [
  ...legacyAttemptFields,
  "wrong_value",
] as const;

export const questionFields = [
  "block_id",
  "question_id",
  "question_type",
  "year",
  "subject",
  "category",
  "collection",
  "source",
  "topic_id",
  "parent_id",
  "last_scanned_at",
  "attempts_relation",
  "attempt_count",
  "wrong_count",
  "total_duration_ms",
] as const;

export const attemptFields = [
  "entry",
  "event_kind",
  "schema_version",
  "attempt_id",
  "question_id",
  "question_relation",
  "session_id",
  "answered_at",
  "question_type",
  "option_order",
  "selected_option_ids",
  "objective_correct",
  "wrong_value",
  "mastery_rating",
  "subjective_score",
  "duration_ms",
  "session_mode",
  "rating_source",
  "exam_status",
  "exam_score",
  "exam_max_score",
  "exam_duration_ms",
  "exam_payload",
] as const;

export type QuestionField = typeof questionFields[number];
export type AttemptField = typeof attemptFields[number];

export interface AttributeViewBinding<Field extends string> {
  avId: string;
  blockId: string;
  keys: Record<Field, string>;
}

export interface QuestionBankBinding {
  schemaVersion: 3;
  notebookId: string;
  systemDocumentId: string;
  questionIndex: AttributeViewBinding<QuestionField>;
  attemptLog: AttributeViewBinding<AttemptField>;
}

const nodeId = z.string().regex(/^\d{14}-[a-z0-9]{7}$/u);
const questionKeySchema = z.object(Object.fromEntries(
  questionFields.map((field) => [field, nodeId]),
) as Record<QuestionField, typeof nodeId>);
const attemptKeySchema = z.object(Object.fromEntries(
  attemptFields.map((field) => [field, nodeId]),
) as Record<AttemptField, typeof nodeId>);

export const QuestionBankBindingSchema = z.object({
  schemaVersion: z.literal(3),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({ avId: nodeId, blockId: nodeId, keys: questionKeySchema }),
  attemptLog: z.object({ avId: nodeId, blockId: nodeId, keys: attemptKeySchema }),
});

const QuestionBankBindingV2Schema = z.object({
  schemaVersion: z.literal(2),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({ avId: nodeId, blockId: nodeId, keys: questionKeySchema }),
  attemptLog: z.object({
    avId: nodeId,
    blockId: nodeId,
    keys: z.object(Object.fromEntries(
      versionTwoAttemptFields.map((field) => [field, nodeId]),
    ) as Record<typeof versionTwoAttemptFields[number], typeof nodeId>),
  }),
});

const LegacyQuestionBankBindingSchema = z.object({
  schemaVersion: z.literal(1),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({
    avId: nodeId,
    blockId: nodeId,
    keys: z.object(Object.fromEntries(
      legacyQuestionFields.map((field) => [field, nodeId]),
    ) as Record<typeof legacyQuestionFields[number], typeof nodeId>),
  }),
  attemptLog: z.object({
    avId: nodeId,
    blockId: nodeId,
    keys: z.object(Object.fromEntries(
      legacyAttemptFields.map((field) => [field, nodeId]),
    ) as Record<typeof legacyAttemptFields[number], typeof nodeId>),
  }),
});

interface ColumnDefinition<Field extends string> {
  field: Field;
  name: string;
  type: AttributeViewKeyType;
}

interface PlannedColumn<Field extends string> extends ColumnDefinition<Field> {
  keyId: string;
}

const questionColumns: readonly ColumnDefinition<Exclude<QuestionField, "block_id">>[] = [
  { field: "question_id", name: "Question ID", type: "text" },
  { field: "question_type", name: "Question Type", type: "select" },
  { field: "year", name: "Year", type: "number" },
  { field: "subject", name: "Subject", type: "select" },
  { field: "category", name: "Category", type: "select" },
  { field: "collection", name: "Collection", type: "select" },
  { field: "source", name: "Source", type: "select" },
  { field: "topic_id", name: "Topic ID", type: "text" },
  { field: "parent_id", name: "Parent ID", type: "text" },
  { field: "last_scanned_at", name: "Last Scanned", type: "date" },
  { field: "attempts_relation", name: "Attempts", type: "relation" },
  { field: "attempt_count", name: "Attempt Count", type: "rollup" },
  { field: "wrong_count", name: "Wrong Count", type: "rollup" },
  { field: "total_duration_ms", name: "Total Duration (min)", type: "rollup" },
];

const attemptColumns: readonly ColumnDefinition<Exclude<AttemptField, "entry">>[] = [
  { field: "event_kind", name: "Event Kind", type: "select" },
  { field: "schema_version", name: "Schema Version", type: "number" },
  { field: "attempt_id", name: "Attempt ID", type: "text" },
  { field: "question_id", name: "Question ID", type: "text" },
  { field: "question_relation", name: "Question", type: "relation" },
  { field: "session_id", name: "Session ID", type: "text" },
  { field: "answered_at", name: "Answered At", type: "date" },
  { field: "question_type", name: "Question Type", type: "select" },
  { field: "option_order", name: "Option Order", type: "mSelect" },
  { field: "selected_option_ids", name: "Selected Options", type: "mSelect" },
  { field: "objective_correct", name: "Objective Correct", type: "select" },
  { field: "wrong_value", name: "Wrong Value", type: "number" },
  { field: "mastery_rating", name: "Mastery Rating", type: "select" },
  { field: "subjective_score", name: "Subjective Score", type: "number" },
  { field: "duration_ms", name: "Duration (min)", type: "number" },
  { field: "session_mode", name: "Session Mode", type: "select" },
  { field: "rating_source", name: "Rating Source", type: "select" },
  { field: "exam_status", name: "Exam Status", type: "select" },
  { field: "exam_score", name: "Exam Score", type: "number" },
  { field: "exam_max_score", name: "Exam Max Score", type: "number" },
  { field: "exam_duration_ms", name: "Exam Duration (min)", type: "number" },
  { field: "exam_payload", name: "Exam Payload", type: "text" },
];

export interface InitializeQuestionBankInput {
  notebookId: string;
  path: string;
  idGenerator: NodeIdGenerator;
}

export interface QuestionBankInitializationPreview {
  token: string;
  notebookId: string;
  path: string;
  questionBlockId: string;
  questionAvId: string;
  attemptBlockId: string;
  attemptAvId: string;
  questionColumns: PlannedColumn<Exclude<QuestionField, "block_id">>[];
  attemptColumns: PlannedColumn<Exclude<AttemptField, "entry">>[];
}

function databaseMarkdown(blockId: string, avId: string): string {
  return `<div data-type="NodeAttributeView" data-av-id="${avId}" data-av-type="table"></div>\n{: id="${blockId}"}`;
}

function primaryKeyId(av: RawAttributeView): string {
  const key = av.keyValues.find((value) => value.key.type === "block")?.key.id;
  if (!key) throw new Error(`Attribute view ${av.id} has no block primary key`);
  return key;
}

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

function hashToken(value: unknown): string {
  const source = JSON.stringify(value);
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function migratedKeyId(
  binding: { systemDocumentId: string; questionIndex: { avId: string }; attemptLog: { avId: string } },
  field: string,
): string {
  const prefix = binding.systemDocumentId.slice(0, 14);
  return `${prefix}-${hashToken(`${binding.questionIndex.avId}:${binding.attemptLog.avId}:${field}`)
    .padStart(7, "0")}`;
}

export function migrateQuestionBankBinding(value: unknown): QuestionBankBinding | undefined {
  const current = QuestionBankBindingSchema.safeParse(value);
  if (current.success) return current.data as QuestionBankBinding;
  const versionTwo = QuestionBankBindingV2Schema.safeParse(value);
  if (versionTwo.success) {
    const binding = versionTwo.data;
    return {
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
    } as QuestionBankBinding;
  }
  const legacy = LegacyQuestionBankBindingSchema.safeParse(value);
  if (!legacy.success) return undefined;
  const binding = legacy.data;
  return {
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
  };
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
  const attemptBlockId = input.idGenerator();
  const attemptAvId = input.idGenerator();
  const preview = {
    notebookId: input.notebookId,
    path: input.path,
    questionBlockId,
    questionAvId,
    attemptBlockId,
    attemptAvId,
    questionColumns: questionColumns.map((column) => ({ ...column, keyId: input.idGenerator() })),
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
    const binding: QuestionBankBinding = {
      schemaVersion: 3,
      notebookId: preview.notebookId,
      systemDocumentId,
      questionIndex: {
        avId: preview.questionAvId,
        blockId: preview.questionBlockId,
        keys: questionKeys,
      },
      attemptLog: { avId: preview.attemptAvId, blockId: preview.attemptBlockId, keys: attemptKeys },
    };
    await configureQuestionRelation(client, binding);
    await configureQuestionRollups(client, binding);
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
    | "convertDurationUnit";
  database: "questionIndex" | "attemptLog";
  field: QuestionField | AttemptField;
  keyId: string;
  name: string;
  type: AttributeViewKeyType;
  currentType?: AttributeViewKeyType;
}

function pushRepair(repairs: ManagedKeyRepair[], repair: ManagedKeyRepair): void {
  if (!repairs.some((item) => item.kind === repair.kind
    && item.database === repair.database
    && item.field === repair.field)) repairs.push(repair);
}

function hasLegacyPayload(value: AttributeViewValue, type: AttributeViewKeyType): boolean {
  if (type === "select" || type === "mSelect") {
    return value.text?.content !== undefined && value.mSelect === undefined;
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
        field: column.field as QuestionField | AttemptField,
        keyId: expected[column.field as Field],
        name: column.name,
        type: column.type,
      });
    }
    else if (key.type !== column.type) {
      pushRepair(missingManagedKeys, {
        kind: "changeType",
        database,
        field: column.field as QuestionField | AttemptField,
        keyId: expected[column.field as Field],
        name: key.name,
        type: column.type,
        currentType: key.type,
      });
    }
    else {
      const values = av.keyValues.find((item) => item.key.id === key.id)?.values ?? [];
      if (values.some((value) => hasLegacyPayload(value, column.type))) {
        pushRepair(missingManagedKeys, {
          kind: "normalizeValues",
          database,
          field: column.field as QuestionField | AttemptField,
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
    const [questionAv, attemptAv] = await Promise.all([
      getAttributeView(client, binding.questionIndex.avId),
      getAttributeView(client, binding.attemptLog.avId),
    ]);
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
  if (["question_type", "subject", "category", "collection", "source", "objective_correct", "mastery_rating"]
    .includes(field)) {
    const content = valueText(value);
    return selectCell(content, content ? selectColor(field, content) : "1");
  }
  if (field === "option_order" || field === "selected_option_ids") {
    return multiSelectCell(valueArray(value), "8");
  }
  if (["year", "schema_version", "subjective_score", "duration_ms"].includes(field)) {
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
  for (const database of ["questionIndex", "attemptLog"] as const) {
    const target = binding[database];
    const av = database === "questionIndex" ? questionAv : attemptAv;
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
  for (const database of ["questionIndex", "attemptLog"] as const) {
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
  await addMissingManagedKeys(client, binding, "questionIndex", verification.missingManagedKeys);
  await addMissingManagedKeys(client, binding, "attemptLog", verification.missingManagedKeys);
  await changeManagedKeyTypes(client, binding, "questionIndex", verification.missingManagedKeys);
  await changeManagedKeyTypes(client, binding, "attemptLog", verification.missingManagedKeys);
  await normalizeManagedValues(client, binding, verification.missingManagedKeys);
  await updateDurationUnitLabels(client, binding, verification.missingManagedKeys);
  if (verification.missingManagedKeys.some((repair) => repair.kind === "configureRelation"
    || repair.field === "attempts_relation")) {
    await configureQuestionRelation(client, binding);
  }
  if (verification.missingManagedKeys.some((repair) => repair.kind === "configureRollup"
    || rollupDefinitions.some((definition) => definition.field === repair.field))) {
    await configureQuestionRollups(client, binding);
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

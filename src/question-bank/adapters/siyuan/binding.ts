import { z } from "zod";
import type { AttributeViewKeyType, NodeIdGenerator, RawAttributeView, SiyuanKernelClient } from "./types";

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
] as const;

export const attemptFields = [
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

export type QuestionField = typeof questionFields[number];
export type AttemptField = typeof attemptFields[number];

export interface AttributeViewBinding<Field extends string> {
  avId: string;
  blockId: string;
  keys: Record<Field, string>;
}

export interface QuestionBankBinding {
  schemaVersion: 1;
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
  schemaVersion: z.literal(1),
  notebookId: nodeId,
  systemDocumentId: nodeId,
  questionIndex: z.object({ avId: nodeId, blockId: nodeId, keys: questionKeySchema }),
  attemptLog: z.object({ avId: nodeId, blockId: nodeId, keys: attemptKeySchema }),
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
  { field: "question_type", name: "Question Type", type: "text" },
  { field: "year", name: "Year", type: "text" },
  { field: "subject", name: "Subject", type: "text" },
  { field: "category", name: "Category", type: "text" },
  { field: "collection", name: "Collection", type: "text" },
  { field: "source", name: "Source", type: "text" },
  { field: "topic_id", name: "Topic ID", type: "text" },
  { field: "parent_id", name: "Parent ID", type: "text" },
  { field: "last_scanned_at", name: "Last Scanned", type: "date" },
];

const attemptColumns: readonly ColumnDefinition<Exclude<AttemptField, "entry">>[] = [
  { field: "schema_version", name: "Schema Version", type: "number" },
  { field: "attempt_id", name: "Attempt ID", type: "text" },
  { field: "question_id", name: "Question ID", type: "text" },
  { field: "question_relation", name: "Question", type: "relation" },
  { field: "session_id", name: "Session ID", type: "text" },
  { field: "answered_at", name: "Answered At", type: "date" },
  { field: "question_type", name: "Question Type", type: "text" },
  { field: "option_order", name: "Option Order", type: "text" },
  { field: "selected_option_ids", name: "Selected Options", type: "text" },
  { field: "objective_correct", name: "Objective Correct", type: "text" },
  { field: "mastery_rating", name: "Mastery Rating", type: "text" },
  { field: "subjective_score", name: "Subjective Score", type: "number" },
  { field: "duration_ms", name: "Duration (ms)", type: "number" },
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
        backRelationKeyID: "",
        isTwoWay: false,
        name: "",
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
      schemaVersion: 1,
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
  const parsed = QuestionBankBindingSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`The Damophus question-bank binding manifest is invalid: ${parsed.error.issues.map((issue) => issue.message).join("; ")}`);
  }
  const binding = parsed.data as QuestionBankBinding;
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
  database: "questionIndex" | "attemptLog";
  field: QuestionField | AttemptField;
  keyId: string;
  name: string;
  type: AttributeViewKeyType;
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
      missingManagedKeys.push({
        database,
        field: column.field as QuestionField | AttemptField,
        keyId: expected[column.field as Field],
        name: column.name,
        type: column.type,
      });
    }
    else if (key.type !== column.type) {
      fatalErrors.push(`Managed key '${String(column.field)}' has type '${key.type}', expected '${column.type}'`);
    }
  }
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
    if (relationKey
      && (relationKey.relation?.avID !== binding.questionIndex.avId || relationKey.relation.isTwoWay)) {
      fatalErrors.push("Managed key 'question_relation' does not target the question index as a one-way relation");
    }
  } catch (error) {
    fatalErrors.push(error instanceof Error ? error.message : String(error));
  }
  const repairErrors = missingManagedKeys.map(
    (repair) => `Missing managed key '${String(repair.field)}' in ${repair.database}`,
  );
  const errors = [...fatalErrors, ...repairErrors];
  return {
    ok: errors.length === 0,
    errors,
    fatalErrors,
    missingManagedKeys,
  };
}

function repairIdentity(repair: ManagedKeyRepair): string {
  return `${repair.database}:${String(repair.field)}:${repair.keyId}`;
}

async function addMissingManagedKeys(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  database: ManagedKeyRepair["database"],
  repairs: readonly ManagedKeyRepair[],
): Promise<void> {
  const databaseRepairs = repairs.filter((item) => item.database === database);
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
  if (verification.missingManagedKeys.some((repair) => repair.field === "question_relation")) {
    await configureQuestionRelation(client, binding);
  }
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

import {
  dateCell,
  durationMinutesFromMilliseconds,
  multiSelectCell,
  numberCell,
  relationCell,
  selectCell,
  setAttributeViewCell,
} from "../cells";
import type { AttributeViewCellInput } from "../cells";
import {
  topicColumns,
  type QuestionBankBinding,
  type TopicField,
} from "../binding-schema";
import { databaseMarkdown } from "../binding-utils";
import { questionRowIdentityMaps } from "../row-identity";
import type {
  AttributeViewValue,
  SiyuanKernelClient,
} from "../types";
import {
  getAttributeView,
  initializeAttributeView,
  valueText,
  valuesByItemId,
} from "./attribute-view";
import { persistQuestionBankBinding } from "./initialize";
import {
  configureQuestionRelation,
  configureQuestionRollups,
  configureTopicRelation,
  configureTopicRollups,
  rollupDefinitions,
  topicRollupDefinitions,
} from "./relations";
import { verifyQuestionBankBinding, type ManagedKeyRepair } from "./verify";

function repairIdentity(repair: ManagedKeyRepair): string {
  return `${repair.kind}:${repair.database}:${String(repair.field)}:${repair.previousKeyId ?? ""}->${repair.keyId}:${repair.currentType ?? ""}->${repair.type}`;
}

interface TopicMigrationInvariantSnapshot {
  sourceDocuments: Array<{ id: string; kramdown: string }>;
  attemptValues: Array<{ keyId: string; values: AttributeViewValue[] }>;
}

async function captureTopicMigrationInvariants(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  repairs: readonly ManagedKeyRepair[],
): Promise<TopicMigrationInvariantSnapshot> {
  const questionAv = await getAttributeView(client, binding.questionIndex.avId);
  const primary = questionAv.keyValues.find((value) => value.key.type === "block");
  const blockIds = [...new Set((primary?.values ?? [])
    .map((value) => value.block?.id)
    .filter((id): id is string => Boolean(id)))];
  const roots = blockIds.length === 0
    ? []
    : await client.request<Array<{ root_id?: string }>>("/api/query/sql", {
      stmt: `SELECT root_id FROM blocks WHERE id IN (${blockIds.map((id) => `'${id}'`).join(",")})`,
    });
  const rootIds = [...new Set(roots.map((row) => row.root_id).filter(
    (id): id is string => Boolean(id) && id !== binding.systemDocumentId,
  ))].sort();
  const sourceDocuments = await Promise.all(rootIds.map(async (id) => ({
    id,
    kramdown: (await client.request<{ kramdown: string }>("/api/block/getBlockKramdown", { id })).kramdown,
  })));

  const repairedAttemptKeyIds = new Set(
    repairs.filter((repair) => repair.database === "attemptLog").map((repair) => repair.keyId),
  );
  const attemptAv = await getAttributeView(client, binding.attemptLog.avId);
  const attemptValues = attemptAv.keyValues
    .filter((value) => !repairedAttemptKeyIds.has(value.key.id))
    .map((value) => ({ keyId: value.key.id, values: structuredClone(value.values) }))
    .sort((left, right) => left.keyId.localeCompare(right.keyId));
  return { sourceDocuments, attemptValues };
}

function assertTopicMigrationInvariants(
  before: TopicMigrationInvariantSnapshot,
  after: TopicMigrationInvariantSnapshot,
): void {
  if (JSON.stringify(before.sourceDocuments) !== JSON.stringify(after.sourceDocuments)) {
    throw new Error("Topic Index migration changed question content, stable IDs, or block references");
  }
  if (JSON.stringify(before.attemptValues) !== JSON.stringify(after.attemptValues)) {
    throw new Error("Topic Index migration changed existing Attempt Log event values");
  }
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
  const actual = verification.missingManagedKeys
    .filter((repair) => repair.kind !== "rebindPrimary")
    .map(repairIdentity)
    .sort();
  const expected = expectedRepairs
    .filter((repair) => repair.kind !== "rebindPrimary")
    .map(repairIdentity)
    .sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Question bank binding repair preview is stale; scan again before confirming");
  }
  const verifiesTopicMigration = verification.missingManagedKeys.some(
    (repair) => repair.kind === "createDatabase" && repair.database === "topicIndex",
  );
  const invariantSnapshot = verifiesTopicMigration
    ? await captureTopicMigrationInvariants(client, binding, verification.missingManagedKeys)
    : undefined;
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
  if (invariantSnapshot) {
    assertTopicMigrationInvariants(
      invariantSnapshot,
      await captureTopicMigrationInvariants(client, binding, verification.missingManagedKeys),
    );
  }
}

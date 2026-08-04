import { AttemptEventSchema } from "../../core/schema";
import { aggregateAttemptEvents } from "../../core/attempts";
import type { AttemptAggregate, AttemptEvent, ScanMessage } from "../../core/types";
import {
  readAttributeView,
  requireQuestionBankBinding,
  type AttemptField,
  type QuestionBankBinding,
} from "./binding";
import { dateCell, numberCell, setAttributeViewCell, textCell } from "./cells";
import type { AttributeViewValue, NodeIdGenerator, RawAttributeView, SiyuanKernelClient } from "./types";

function fieldValues(
  av: RawAttributeView,
  binding: QuestionBankBinding,
  field: AttemptField,
): Map<string, AttributeViewValue> {
  const keyID = binding.attemptLog.keys[field];
  const values = av.keyValues.find((keyValues) => keyValues.key.id === keyID)?.values ?? [];
  return new Map(values.map((value) => [value.blockID, value]));
}

function textValue(value: AttributeViewValue | undefined): string | undefined {
  const content = value?.text?.content;
  return content === "" ? undefined : content;
}

function numberValue(value: AttributeViewValue | undefined): number | undefined {
  return value?.number?.isNotEmpty === false ? undefined : value?.number?.content;
}

function parseStringArray(value: string | undefined): string[] {
  if (!value) return [];
  const parsed: unknown = JSON.parse(value);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error("Expected a JSON string array");
  }
  return parsed;
}

function parseObjectiveResult(value: string | undefined): boolean | null {
  if (value === undefined) return null;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error("Expected objective result to be 'true', 'false', or empty");
}

export interface ReadAttemptsResult {
  events: AttemptEvent[];
  issues: ScanMessage[];
}

export interface RebuildAttemptStatisticsResult extends ReadAttemptsResult {
  aggregates: ReadonlyMap<string, AttemptAggregate>;
}

export async function readAttemptEvents(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<ReadAttemptsResult> {
  await requireQuestionBankBinding(client, binding);
  const av = await readAttributeView(client, binding.attemptLog.avId);
  const primary = fieldValues(av, binding, "entry");
  const fields = Object.fromEntries(
    ([
      "schema_version",
      "attempt_id",
      "question_id",
      "session_id",
      "answered_at",
      "question_type",
      "option_order",
      "selected_option_ids",
      "objective_correct",
      "mastery_rating",
      "subjective_score",
      "duration_ms",
    ] as const).map((field) => [field, fieldValues(av, binding, field)]),
  ) as Record<Exclude<AttemptField, "entry">, Map<string, AttributeViewValue>>;
  const events: AttemptEvent[] = [];
  const issues: ScanMessage[] = [];

  for (const itemID of primary.keys()) {
    try {
      const answeredAt = fields.answered_at.get(itemID)?.date?.content;
      const objective = textValue(fields.objective_correct.get(itemID));
      const parsed = AttemptEventSchema.safeParse({
        schema_version: numberValue(fields.schema_version.get(itemID)),
        attempt_id: textValue(fields.attempt_id.get(itemID)),
        question_id: textValue(fields.question_id.get(itemID)),
        session_id: textValue(fields.session_id.get(itemID)),
        answered_at: answeredAt === undefined ? undefined : new Date(answeredAt).toISOString(),
        question_type: textValue(fields.question_type.get(itemID)),
        option_order: parseStringArray(textValue(fields.option_order.get(itemID))),
        selected_option_ids: parseStringArray(textValue(fields.selected_option_ids.get(itemID))),
        objective_correct: parseObjectiveResult(objective),
        mastery_rating: textValue(fields.mastery_rating.get(itemID)),
        subjective_score: numberValue(fields.subjective_score.get(itemID)),
        duration_ms: numberValue(fields.duration_ms.get(itemID)),
      });
      if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join("; "));
      events.push(parsed.data as AttemptEvent);
    } catch (error) {
      issues.push({
        code: "invalid-attempt-row",
        message: `Attempt row '${itemID}' is invalid: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }
  return { events, issues };
}

export async function rebuildAttemptStatistics(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<RebuildAttemptStatisticsResult> {
  const result = await readAttemptEvents(client, binding);
  return { ...result, aggregates: aggregateAttemptEvents(result.events) };
}

export type AppendAttemptResult = { status: "created"; itemId: string } | { status: "duplicate" };

export async function appendAttemptEvent(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
  event: AttemptEvent,
  idGenerator: NodeIdGenerator,
): Promise<AppendAttemptResult> {
  const attempt = AttemptEventSchema.parse(event) as AttemptEvent;
  await requireQuestionBankBinding(client, binding);
  const av = await readAttributeView(client, binding.attemptLog.avId);
  const attemptIds = fieldValues(av, binding, "attempt_id");
  if ([...attemptIds.values()].some((value) => value.text?.content === attempt.attempt_id)) {
    return { status: "duplicate" };
  }

  const itemId = idGenerator();
  await client.request("/api/av/addAttributeViewBlocks", {
    avID: binding.attemptLog.avId,
    blockID: binding.attemptLog.blockId,
    viewID: "",
    groupID: "",
    previousID: "",
    srcs: [{ itemID: itemId, isDetached: true, content: attempt.attempt_id }],
    ignoreDefaultFill: true,
  });

  const values = {
    schema_version: numberCell(attempt.schema_version),
    attempt_id: textCell(attempt.attempt_id),
    question_id: textCell(attempt.question_id),
    session_id: textCell(attempt.session_id),
    answered_at: dateCell(Date.parse(attempt.answered_at)),
    question_type: textCell(attempt.question_type),
    option_order: textCell(JSON.stringify(attempt.option_order)),
    selected_option_ids: textCell(JSON.stringify(attempt.selected_option_ids)),
    objective_correct: textCell(attempt.objective_correct === null ? undefined : String(attempt.objective_correct)),
    mastery_rating: textCell(attempt.mastery_rating),
    subjective_score: numberCell(attempt.subjective_score),
    duration_ms: numberCell(attempt.duration_ms),
  };
  try {
    for (const [field, value] of Object.entries(values)) {
      await setAttributeViewCell(
        client,
        binding.attemptLog.avId,
        binding.attemptLog.keys[field as keyof typeof values],
        itemId,
        value,
      );
    }
  } catch (error) {
    await client.request("/api/av/removeAttributeViewBlocks", {
      avID: binding.attemptLog.avId,
      srcIDs: [itemId],
    });
    throw error;
  }
  return { status: "created", itemId };
}

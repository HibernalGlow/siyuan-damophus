import { z } from "zod";
import {
  QuestionBankBindingSchema,
  QuestionBankBindingV4Schema,
  QuestionBankBindingV3Schema,
  QuestionBankBindingV2Schema,
  LegacyQuestionBankBindingSchema,
  topicColumns,
  type QuestionBankBinding,
  type TopicField,
} from "../binding-schema";
import { migratedKeyId } from "../binding-utils";

type VersionThreeBinding = z.infer<typeof QuestionBankBindingV3Schema>;
type VersionFourBinding = z.infer<typeof QuestionBankBindingV4Schema>;

function upgradeVersionFourBinding(binding: VersionFourBinding): QuestionBankBinding {
  return {
    ...binding,
    schemaVersion: 5,
    topicIndex: {
      ...binding.topicIndex,
      keys: {
        ...binding.topicIndex.keys,
        question_ids_snapshot: migratedKeyId(binding, "topic-index:question_ids_snapshot"),
      },
    },
  };
}

function upgradeVersionThreeBinding(binding: VersionThreeBinding): QuestionBankBinding {
  const topicKeys = Object.fromEntries([
    "entry",
    ...topicColumns.map((column) => column.field),
  ].map((field) => [field, migratedKeyId(binding, `topic-index:${field}`)])) as Record<TopicField, string>;
  return upgradeVersionFourBinding({
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
  });
}

export function migrateQuestionBankBinding(value: unknown): QuestionBankBinding | undefined {
  const current = QuestionBankBindingSchema.safeParse(value);
  if (current.success) return current.data as QuestionBankBinding;
  const versionFour = QuestionBankBindingV4Schema.safeParse(value);
  if (versionFour.success) return upgradeVersionFourBinding(versionFour.data);
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

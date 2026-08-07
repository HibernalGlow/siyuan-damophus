import type {TablesSchema, ValuesSchema} from "tinybase";
import { createMergeableStore, type MergeableStore } from "tinybase";

export const TABLE = {
  sourceDocuments: "source_documents",
  questions: "questions",
  questionTopics: "question_topics",
  topicAnchors: "topic_anchors",
  questionAggregates: "question_aggregates",
  questionSetBlueprints: "question_set_blueprints",
  practiceSessionVersions: "practice_session_versions",
  examSessionVersions: "exam_session_versions",
  attemptEvents: "attempt_events",
  examEvents: "exam_events",
} as const;

const stringCell = {type: "string" as const};
const numberCell = {type: "number" as const};
const booleanCell = {type: "boolean" as const};

export const DAMOPHUS_TABLES_SCHEMA: TablesSchema = {
  [TABLE.sourceDocuments]: {
    notebook_id: stringCell, title: stringCell, path: stringCell, hpath: stringCell,
    source_updated_at: stringCell, content_signature: stringCell, scan_status: stringCell,
    issue_count: numberCell, indexed_at: stringCell,
  },
  [TABLE.questions]: {
    block_id: stringCell, document_id: stringCell, notebook_id: stringCell,
    question_type: stringCell, title: stringCell, year: stringCell, subject: stringCell,
    category: stringCell, collection: stringCell, source: stringCell, parent_id: stringCell,
    content_signature: stringCell, indexed_at: stringCell, available: booleanCell,
  },
  [TABLE.questionTopics]: {
    question_id: stringCell, topic_id: stringCell, document_id: stringCell,
  },
  [TABLE.topicAnchors]: {
    topic_id: stringCell, document_id: stringCell, notebook_id: stringCell,
    title: stringCell, path: stringCell, hpath: stringCell, source_updated_at: stringCell,
    available: booleanCell,
  },
  [TABLE.questionAggregates]: {
    question_id: stringCell, attempts: numberCell, timed_attempts: numberCell,
    total_duration_ms: numberCell, objective_attempts: numberCell, objective_correct: numberCell,
    objective_incorrect: numberCell, consecutive_review_count: numberCell,
    consecutive_again_count: numberCell, consecutive_hard_count: numberCell,
    latest_rating: stringCell, last_answered_at: stringCell, previous_duration_ms: numberCell,
    last_duration_ms: numberCell, last_attempt_id: stringCell,
  },
  [TABLE.questionSetBlueprints]: {
    revision: numberCell, updated_at: stringCell, snapshot_json: stringCell,
  },
  [TABLE.practiceSessionVersions]: {
    source_key: stringCell, device_id: stringCell, session_id: stringCell,
    revision: numberCell, updated_at: stringCell, snapshot_json: stringCell,
  },
  [TABLE.examSessionVersions]: {
    exam_id: stringCell, device_id: stringCell, revision: numberCell, status: stringCell,
    updated_at: stringCell, snapshot_json: stringCell,
  },
  [TABLE.attemptEvents]: {
    schema_version: numberCell, event_kind: stringCell, attempt_id: stringCell,
    question_id: stringCell, question_relation: stringCell, session_id: stringCell,
    answered_at: stringCell, question_type: stringCell, option_order: stringCell,
    selected_option_ids: stringCell, objective_correct: stringCell, mastery_rating: stringCell,
    session_mode: stringCell, rating_source: stringCell, subjective_score: numberCell,
    duration_ms: numberCell,
  },
  [TABLE.examEvents]: {
    schema_version: numberCell, event_kind: stringCell, attempt_id: stringCell,
    session_id: stringCell, answered_at: stringCell, session_mode: stringCell,
    exam_status: stringCell, exam_score: numberCell, exam_max_score: numberCell,
    exam_duration_ms: numberCell, exam_payload: stringCell,
  },
};

export const DAMOPHUS_VALUES_SCHEMA: ValuesSchema = {
  schema_version: numberCell,
  migration_version: numberCell,
  last_catalog_scan_at: stringCell,
  last_aggregate_rebuild_at: stringCell,
  last_successful_merge_at: stringCell,
};

export function createDamophusStore(uniqueId?: string): MergeableStore {
  return createMergeableStore(uniqueId)
    .setTablesSchema(DAMOPHUS_TABLES_SCHEMA)
    .setValuesSchema(DAMOPHUS_VALUES_SCHEMA);
}

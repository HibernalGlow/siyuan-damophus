export type QuestionType =
  | "single"
  | "multiple"
  | "indefinite"
  | "true-false"
  | "subjective"
  | "group";

export type MasteryRating = "again" | "hard" | "good" | "easy";
export type SessionMode = "practice" | "exam";
export type RatingSource = "user" | "exam-auto";
export type EventKind = "question_attempt" | "exam_submitted" | "exam_finalized" | "exam_abandoned";

export interface QuestionOption {
  id: string;
  markdown: string;
}

export type ObjectiveAnswer =
  | { kind: "options"; optionIds: string[] }
  | { kind: "boolean"; value: boolean };

export interface QuestionMetadata {
  year?: string;
  subject?: string;
  category?: string;
  collection?: string;
  source?: string;
  /** Stable topic identity from explicit portable IAL. */
  topicId?: string;
  /** Scan-local heading scope used when no stable topic identity exists. */
  scopeTopicId?: string;
  topicPath: string[];
  parentId?: string;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  stemMarkdown: string;
  options: QuestionOption[];
  answer?: ObjectiveAnswer;
  solutionMarkdown: string;
  metadata: QuestionMetadata;
}

export interface QuestionGroup {
  id: string;
  materialMarkdown: string;
  questionIds: string[];
}

export interface TopicNode {
  id: string;
  title: string;
  level: number;
  sourceLine?: number;
  parentId?: string;
  childIds: string[];
  explicit: boolean;
}

export interface QuestionDocument {
  questions: Question[];
  groups: QuestionGroup[];
  topics: TopicNode[];
}

export interface ScanMessage {
  code: string;
  message: string;
  questionId?: string;
  line?: number;
  title?: string;
  sourceMarkdown?: string;
}

export interface QuestionScanReport {
  document: QuestionDocument;
  inferences: ScanMessage[];
  conflicts: ScanMessage[];
  issues: ScanMessage[];
}

export interface AttemptEvent {
  schema_version: 1;
  event_kind?: "question_attempt";
  attempt_id: string;
  question_id: string;
  question_relation?: string;
  session_id: string;
  answered_at: string;
  question_type: QuestionType;
  option_order: string[];
  selected_option_ids: string[];
  objective_correct: boolean | null;
  mastery_rating: MasteryRating;
  session_mode?: SessionMode;
  rating_source?: RatingSource;
  subjective_score?: number;
  duration_ms?: number;
}

export interface ExamSummaryEvent {
  schema_version: 1;
  event_kind: "exam_submitted" | "exam_finalized" | "exam_abandoned";
  attempt_id: string;
  session_id: string;
  answered_at: string;
  session_mode: "exam";
  exam_status: "pending_manual_score" | "submitted" | "finalized" | "abandoned";
  exam_score?: number;
  exam_max_score?: number;
  exam_duration_ms?: number;
  exam_payload: string;
}

export interface AttemptAggregate {
  questionId: string;
  attempts: number;
  timedAttempts?: number;
  totalDurationMs?: number;
  objectiveAttempts: number;
  objectiveCorrect: number;
  objectiveIncorrect: number;
  consecutiveReviewCount: number;
  consecutiveAgainCount: number;
  consecutiveHardCount: number;
  latestRating?: MasteryRating;
  lastAnsweredAt?: string;
  lastAttemptId?: string;
  lastDurationMs?: number;
  previousDurationMs?: number;
}

export interface ShuffledOption {
  originalId: string;
  displayLabel: string;
  markdown: string;
}

export interface ShuffledQuestion {
  questionId: string;
  optionOrder: string[];
  options: ShuffledOption[];
}

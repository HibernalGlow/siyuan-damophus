export type QuestionType =
  | "single"
  | "multiple"
  | "indefinite"
  | "true-false"
  | "subjective"
  | "group";

export type MasteryRating = "again" | "hard" | "good" | "easy";

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
  subjective_score?: number;
  duration_ms?: number;
}

export interface AttemptAggregate {
  questionId: string;
  attempts: number;
  objectiveAttempts: number;
  objectiveCorrect: number;
  objectiveIncorrect: number;
  consecutiveReviewCount: number;
  consecutiveAgainCount: number;
  consecutiveHardCount: number;
  latestRating?: MasteryRating;
  lastAnsweredAt?: string;
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

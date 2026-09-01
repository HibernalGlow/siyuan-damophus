import type { Heading, RootContent } from "mdast";
import type {
  QuestionMetadata,
  QuestionScanReport,
  TopicNode,
} from "../../core/types";
import type { IalAttributes } from "../ial";

export interface MarkdownBlock {
  node: RootContent;
  raw: string;
  attributes: IalAttributes;
  line?: number;
}

export interface IalToken {
  offset: number;
  line: number;
  attributes: IalAttributes;
  errors: string[];
}

export interface TopicState {
  node: TopicNode;
  attributes: IalAttributes;
  metadata: Omit<QuestionMetadata, "topicPath" | "topicId" | "topicIds" | "parentId">;
}

export interface QuestionCandidate {
  blockIndex: number;
  heading: Heading;
  attributes: IalAttributes;
  topics: TopicState[];
}

export interface ParsedOption {
  id: string;
  markdown: string;
}

export interface MarkdownIalUpdate {
  blockId?: string;
  line?: number;
  questionId: string;
  attributes: IalAttributes;
  reason: "inferred-question-type" | "inferred-machine-answer" | "inferred-solution-boundary" | "suggested-stable-question-id";
}

export interface MarkdownQuestionScanReport extends QuestionScanReport {
  ialUpdates: MarkdownIalUpdate[];
}

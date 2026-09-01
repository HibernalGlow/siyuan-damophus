import remarkGfm from "remark-gfm";
// remark-math keeps $...$ content verbatim through the parse/stringify
// round-trip: plain remark-parse treats LaTeX escapes like \% as CommonMark
// escapes, so a formula $3\%$ came back as $3%$ and KaTeX rendered the bare
// % as a comment (the tariff rate vanished inside rendered options).
import remarkMath from "remark-math";
import remarkParse from "remark-parse";
import remarkStringify from "remark-stringify";
import { unified } from "unified";
import type { QuestionType } from "../../core/types";

export const markdownParser = unified().use(remarkParse).use(remarkGfm).use(remarkMath);
export const markdownWriter = unified().use(remarkParse).use(remarkGfm).use(remarkMath).use(remarkStringify);
export const siyuanNodeId = /^\d{14}-[a-z0-9]{7}$/u;
export const stableTopicIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
export const questionTypes: readonly QuestionType[] = [
  "single",
  "multiple",
  "indefinite",
  "true-false",
  "subjective",
  "group",
];

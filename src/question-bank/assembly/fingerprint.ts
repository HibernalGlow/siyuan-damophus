import type { Question } from "../core/types";

function normalizeMarkdown(value: string): string {
  return value.replace(/\r\n?/gu, "\n").replace(/[ \t]+$/gmu, "").trim();
}

export function questionContentSignature(question: Question): string {
  return JSON.stringify({
    type: question.type,
    stem: normalizeMarkdown(question.stemMarkdown),
    options: question.options.map((option) => ({
      id: option.id,
      markdown: normalizeMarkdown(option.markdown),
    })),
    answer: question.answer,
    solution: normalizeMarkdown(question.solutionMarkdown),
  });
}

function slug(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const normalized = value.toLowerCase().trim().replace(/[^a-z0-9]+/gu, "-").replace(/^-|-$/gu, "");
  return normalized || undefined;
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export interface StableQuestionIdInput {
  question: Omit<Question, "id">;
  visibleNumber?: string;
}

export async function suggestStableQuestionId(input: StableQuestionIdInput): Promise<string> {
  const metadata = input.question.metadata;
  const semantic = [
    slug(metadata.subject),
    slug(metadata.source),
    slug(metadata.collection),
    slug(metadata.year),
    slug(input.visibleNumber),
  ].filter((value): value is string => Boolean(value));
  if (semantic.length >= 3 && input.visibleNumber) return semantic.join("-");
  const signature = questionContentSignature({ ...input.question, id: "pending" });
  return `qb-${(await sha256(signature)).slice(0, 20)}`;
}


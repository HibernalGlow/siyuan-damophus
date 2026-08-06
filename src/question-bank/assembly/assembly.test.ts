import { describe, expect, it } from "vitest";
import {
  assembleQuestionSet,
  deduplicateQuestionCatalog,
  parseQuestionSetBlueprints,
  serializeQuestionSetBlueprints,
  type QuestionCatalogEntry,
  type QuestionSetBlueprint,
} from "./index";

function entry(
  questionId: string,
  documentId: string,
  subject: string,
  category: string,
  year: string,
): QuestionCatalogEntry {
  return {
    questionId,
    blockId: `block-${questionId}-${documentId}`,
    documentId,
    notebookId: "notebook-1",
    questionType: "single",
    subject,
    category,
    year,
    contentSignature: `content-${questionId}`,
  };
}

function blueprint(overrides: Partial<QuestionSetBlueprint> = {}): QuestionSetBlueprint {
  return {
    schema_version: 1,
    blueprint_id: "blueprint-1",
    revision: 1,
    name: "Cross-document exam",
    binding_mode: "dynamic",
    source: {
      notebook_ids: [],
      document_ids: [],
      topic_refs: [],
      excluded_document_ids: [],
      excluded_question_ids: [],
    },
    filters: {
      subjects: [],
      categories: [],
      collections: [],
      sources: [],
      years: [],
      question_types: [],
      history: "all",
    },
    question_count: 4,
    quotas: [],
    draw_mode: "balanced",
    balance_dimensions: ["subject", "category"],
    allow_controlled_widening: true,
    locked_question_ids: [],
    created_at: "2026-08-06T00:00:00.000Z",
    updated_at: "2026-08-06T00:00:00.000Z",
    ...overrides,
  };
}

const catalog = [
  entry("civil-1", "doc-1", "civil", "contract", "2024"),
  entry("civil-2", "doc-1", "civil", "contract", "2025"),
  entry("criminal-1", "doc-2", "criminal", "crime", "2024"),
  entry("criminal-2", "doc-2", "criminal", "crime", "2025"),
  entry("procedure-1", "doc-3", "procedure", "procedure", "2023"),
];

describe("question set assembly", () => {
  it("draws across documents and balances groups", () => {
    const frozen = assembleQuestionSet({
      blueprint: blueprint(),
      catalog,
      sourceRevision: "revision-1",
      setId: "set-1",
      seed: "seed-1",
      generatedAt: "2026-08-06T00:00:00.000Z",
      random: () => 0.5,
    });
    expect(frozen.question_ids).toHaveLength(4);
    expect(frozen.source_keys.length).toBeGreaterThan(1);
    expect(frozen.deficits).toEqual([]);
  });

  it("applies quotas before filling the remaining total", () => {
    const frozen = assembleQuestionSet({
      blueprint: blueprint({
        question_count: 3,
        quotas: [{ dimension: "subject", value: "criminal", count: 2 }],
      }),
      catalog,
      sourceRevision: "revision-1",
      setId: "set-2",
      seed: "seed-2",
      random: () => 0.5,
    });
    expect(frozen.question_ids.filter((id) => id.startsWith("criminal"))).toHaveLength(2);
    expect(frozen.question_ids).toHaveLength(3);
  });

  it("widens years in the same selected source before shrinking", () => {
    const frozen = assembleQuestionSet({
      blueprint: blueprint({
        question_count: 2,
        source: {
          notebook_ids: [],
          document_ids: ["doc-1"],
          topic_refs: [],
          excluded_document_ids: [],
          excluded_question_ids: [],
        },
        filters: { ...blueprint().filters, years: ["2024"] },
      }),
      catalog,
      sourceRevision: "revision-1",
      setId: "set-3",
      seed: "seed-3",
      random: () => 0.5,
    });
    expect(frozen.question_ids).toEqual(expect.arrayContaining(["civil-1", "civil-2"]));
    expect(frozen.widened).toBe(true);
  });

  it("reports shortages without drawing outside selected sources", () => {
    const frozen = assembleQuestionSet({
      blueprint: blueprint({
        question_count: 4,
        source: {
          notebook_ids: [],
          document_ids: ["doc-3"],
          topic_refs: [],
          excluded_document_ids: [],
          excluded_question_ids: [],
        },
      }),
      catalog,
      sourceRevision: "revision-1",
      setId: "set-4",
      seed: "seed-4",
      random: () => 0.5,
    });
    expect(frozen.question_ids).toEqual(["procedure-1"]);
    expect(frozen.deficits).toContainEqual({ dimension: "total", requested: 4, available: 1 });
  });

  it("keeps fixed sets in their locked order", () => {
    const frozen = assembleQuestionSet({
      blueprint: blueprint({
        binding_mode: "fixed",
        question_count: 2,
        locked_question_ids: ["criminal-2", "civil-1"],
      }),
      catalog,
      sourceRevision: "revision-1",
      setId: "set-5",
      seed: "seed-5",
    });
    expect(frozen.question_ids).toEqual(["criminal-2", "civil-1"]);
  });
});

describe("question catalog deduplication", () => {
  it("keeps one canonical source for identical copies", () => {
    const first = { ...entry("same-id", "doc-1", "civil", "contract", "2024"), indexedAt: "2026-08-01T00:00:00.000Z" };
    const second = { ...entry("same-id", "doc-2", "civil", "contract", "2024"), indexedAt: "2026-08-02T00:00:00.000Z" };
    const result = deduplicateQuestionCatalog([first, second]);
    expect(result.entries).toEqual([first]);
    expect(result.aliases[0].aliases).toEqual([second]);
    expect(result.conflicts).toEqual([]);
  });

  it("blocks divergent content using the same stable ID", () => {
    const first = entry("same-id", "doc-1", "civil", "contract", "2024");
    const second = { ...entry("same-id", "doc-2", "civil", "contract", "2024"), contentSignature: "different" };
    const result = deduplicateQuestionCatalog([first, second]);
    expect(result.entries).toEqual([]);
    expect(result.conflicts[0].questionId).toBe("same-id");
  });
});

describe("question set blueprint archive", () => {
  it("round-trips versioned blueprints", () => {
    const source = [blueprint()];
    expect(parseQuestionSetBlueprints(serializeQuestionSetBlueprints(source, "2026-08-06T00:00:00.000Z")))
      .toEqual(source);
  });
});

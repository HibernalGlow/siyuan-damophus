import { z } from "zod";
import { QuestionSetBlueprintSchema, type QuestionSetBlueprint } from "./schema";

const QuestionSetBlueprintArchiveSchema = z.object({
  schema_version: z.literal(1),
  exported_at: z.iso.datetime({ offset: true }),
  blueprints: z.array(QuestionSetBlueprintSchema),
});

export interface QuestionSetBlueprintRepository {
  list(): Promise<QuestionSetBlueprint[]>;
  save(blueprint: QuestionSetBlueprint): Promise<void>;
  remove(blueprintId: string): Promise<void>;
}

export function serializeQuestionSetBlueprints(
  blueprints: readonly QuestionSetBlueprint[],
  exportedAt = new Date().toISOString(),
): string {
  return JSON.stringify({
    schema_version: 1,
    exported_at: exportedAt,
    blueprints: blueprints.map((blueprint) => QuestionSetBlueprintSchema.parse(blueprint)),
  }, null, 2);
}

export function parseQuestionSetBlueprints(source: string): QuestionSetBlueprint[] {
  return QuestionSetBlueprintArchiveSchema.parse(JSON.parse(source)).blueprints as QuestionSetBlueprint[];
}


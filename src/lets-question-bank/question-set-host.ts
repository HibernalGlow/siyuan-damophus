import type { QuestionSetBlueprintRepository } from "@/question-bank/assembly";
import {
  parseQuestionSetBlueprints,
  QuestionSetBlueprintSchema,
  serializeQuestionSetBlueprints,
  type QuestionSetBlueprint,
} from "@/question-bank/assembly";

const settingKey = "questionSetBlueprints";

export class QuestionSetBlueprintSettingsRepository implements QuestionSetBlueprintRepository {
  constructor(
    private readonly getSetting: (key: string) => unknown,
    private readonly setSetting: (key: string, value: unknown) => void,
  ) {}

  async list(): Promise<QuestionSetBlueprint[]> {
    const value = this.getSetting(settingKey);
    if (!Array.isArray(value)) return [];
    return value.flatMap((item) => {
      const result = QuestionSetBlueprintSchema.safeParse(item);
      return result.success ? [result.data as QuestionSetBlueprint] : [];
    });
  }

  async save(blueprint: QuestionSetBlueprint): Promise<void> {
    const next = (await this.list()).filter((item) => item.blueprint_id !== blueprint.blueprint_id);
    next.push(QuestionSetBlueprintSchema.parse(blueprint) as QuestionSetBlueprint);
    this.setSetting(settingKey, next);
  }

  async remove(blueprintId: string): Promise<void> {
    this.setSetting(settingKey, (await this.list()).filter((item) => item.blueprint_id !== blueprintId));
  }

  async export(): Promise<string> {
    return serializeQuestionSetBlueprints(await this.list());
  }

  async import(source: string): Promise<QuestionSetBlueprint[]> {
    const imported = parseQuestionSetBlueprints(source);
    const merged = new Map((await this.list()).map((item) => [item.blueprint_id, item]));
    for (const item of imported) merged.set(item.blueprint_id, item);
    this.setSetting(settingKey, [...merged.values()]);
    return [...merged.values()];
  }
}


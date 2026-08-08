import {
  migrateQuestionBankBinding,
  QuestionBankBindingSchema,
  type QuestionBankBinding,
} from "../question-bank/adapters/siyuan/binding";

const bindingSetting = "binding";

export function resolveSourceRenderingBinding(
  getSetting: (key: string) => unknown,
  setSetting: (key: string, value: unknown) => void,
): QuestionBankBinding | undefined {
  const stored = getSetting(bindingSetting);
  const binding = migrateQuestionBankBinding(stored);
  if (binding && !QuestionBankBindingSchema.safeParse(stored).success) {
    setSetting(bindingSetting, binding);
  }
  return binding;
}

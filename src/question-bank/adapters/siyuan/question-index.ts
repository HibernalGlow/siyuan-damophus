import type { StatisticsQuestion } from "../../core/statistics";
import {
  readAttributeView,
  requireQuestionBankBinding,
  type QuestionBankBinding,
} from "./binding";
import type { AttributeViewValue, RawAttributeView, SiyuanKernelClient } from "./types";

function valuesByField(av: RawAttributeView, keyId: string): Map<string, AttributeViewValue> {
  const values = av.keyValues.find((keyValues) => keyValues.key.id === keyId)?.values ?? [];
  return new Map(values.map((value) => [value.blockID, value]));
}

function textValue(value: AttributeViewValue | undefined): string | undefined {
  const content = value?.mSelect?.[0]?.content ?? value?.text?.content;
  return content === undefined || content === "" ? undefined : content;
}

function readRows(av: RawAttributeView, binding: QuestionBankBinding): StatisticsQuestion[] {
  const fields = Object.fromEntries(([
    "block_id",
    "question_id",
    "question_type",
    "year",
    "subject",
    "category",
    "collection",
    "source",
    "topic_id",
  ] as const).map((field) => [field, valuesByField(av, binding.questionIndex.keys[field])]));
  const entries = fields.question_id;
  return [...entries.entries()].flatMap(([blockID, value]) => {
    const questionId = textValue(value);
    const questionType = textValue(fields.question_type.get(blockID));
    if (!questionId || !questionType) return [];
    return [{
      questionId,
      title: fields.block_id.get(blockID)?.block?.content,
      questionType: questionType as StatisticsQuestion["questionType"],
      year: textValue(fields.year.get(blockID)),
      subject: textValue(fields.subject.get(blockID)),
      category: textValue(fields.category.get(blockID)),
      collection: textValue(fields.collection.get(blockID)),
      source: textValue(fields.source.get(blockID)),
      topicId: textValue(fields.topic_id.get(blockID)),
    }];
  });
}

export async function readQuestionIndexStatistics(
  client: SiyuanKernelClient,
  binding: QuestionBankBinding,
): Promise<StatisticsQuestion[]> {
  await requireQuestionBankBinding(client, binding);
  const av = await readAttributeView(client, binding.questionIndex.avId);
  return readRows(av, binding);
}

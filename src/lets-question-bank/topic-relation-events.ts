import type { QuestionBankBinding } from "@/question-bank/adapters/siyuan";

interface TransactionOperation {
  action?: string;
  avID?: string;
  keyID?: string;
}

interface TransactionRecord {
  doOperations?: TransactionOperation[];
}

export function updatesManagedTopicRelation(
  message: { cmd?: string; data?: unknown },
  binding: QuestionBankBinding,
): boolean {
  if (message.cmd !== "transactions" || !Array.isArray(message.data)) return false;
  return (message.data as TransactionRecord[]).some((transaction) => (
    transaction.doOperations?.some((operation) => (
      operation.action === "updateAttrViewCell"
      && operation.avID === binding.questionIndex.avId
      && operation.keyID === binding.questionIndex.keys.topics_relation
    )) ?? false
  ));
}

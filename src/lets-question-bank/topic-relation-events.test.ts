import { describe, expect, it } from "vitest";
import type { QuestionBankBinding } from "@/question-bank/adapters/siyuan";
import { updatesManagedTopicRelation } from "./topic-relation-events";

const binding = {
  schemaVersion: 5,
  questionIndex: {
    avId: "20260807190000-question",
    keys: { topics_relation: "20260807190000-topics1" },
  },
} as QuestionBankBinding;

describe("topic relation transaction detection", () => {
  it("matches only writes to the managed Question Index Topics column", () => {
    expect(updatesManagedTopicRelation({
      cmd: "transactions",
      data: [{ doOperations: [{
        action: "updateAttrViewCell",
        avID: binding.questionIndex.avId,
        keyID: binding.questionIndex.keys.topics_relation,
      }] }],
    }, binding)).toBe(true);
    expect(updatesManagedTopicRelation({
      cmd: "transactions",
      data: [{ doOperations: [{
        action: "updateAttrViewCell",
        avID: binding.questionIndex.avId,
        keyID: "20260807190000-other01",
      }] }],
    }, binding)).toBe(false);
    expect(updatesManagedTopicRelation({ cmd: "sync-end", data: [] }, binding)).toBe(false);
  });
});

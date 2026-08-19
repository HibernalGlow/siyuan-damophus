import { describe, expect, it } from "vitest";
import {
  emptyTopicDictionary,
  mergeTopicDictionaryScan,
  resolveTopicDictionaryClassificationLabel,
  resolveTopicDictionaryLabel,
  updateTopicDictionaryLabels,
} from "./topic-dictionary";

describe("topic dictionary", () => {
  it("retains missing topics while refreshing current classifications", () => {
    const initial = mergeTopicDictionaryScan(emptyTopicDictionary("2026-08-01T00:00:00.000Z"), [
      {topicId: "civil-contract-validity", subjects: ["民法"], categories: ["合同"]},
      {topicId: "civil-property-possession", subjects: ["民法"], categories: ["物权"]},
    ], "2026-08-01T01:00:00.000Z");
    const named = updateTopicDictionaryLabels(initial, {
      "civil-contract-validity": "合同效力",
      "civil-property-possession": "占有",
    }, "2026-08-01T02:00:00.000Z");

    const rescanned = mergeTopicDictionaryScan(named, [
      {topicId: "civil-contract-validity", subjects: ["民法"], categories: ["民事法律行为"]},
      {topicId: "criminal-causation", subjects: ["刑法"]},
    ], "2026-08-02T00:00:00.000Z");

    expect(rescanned.entries["civil-contract-validity"]).toMatchObject({
      displayName: "合同效力",
      categories: ["民事法律行为"],
      state: "present",
    });
    expect(rescanned.entries["civil-property-possession"]).toMatchObject({
      displayName: "占有",
      categories: ["物权"],
      state: "retired",
    });
    expect(rescanned.entries["criminal-causation"].state).toBe("present");
  });

  it("uses an explicit Chinese name independently of note titles", () => {
    const dictionary = updateTopicDictionaryLabels(
      mergeTopicDictionaryScan(emptyTopicDictionary(), [{topicId: "criminal-causation"}]),
      {"criminal-causation": "刑法上的因果关系"},
    );

    expect(resolveTopicDictionaryLabel(dictionary, "criminal-causation", "criminal-causation"))
      .toBe("刑法上的因果关系");
  });

  it("resolves a category code through its topic entry", () => {
    const dictionary = mergeTopicDictionaryScan(emptyTopicDictionary(), [
      {topicId: "civil-procedure-mediation", suggestedName: "民事调解", categories: ["mediation"]},
    ]);
    expect(resolveTopicDictionaryClassificationLabel(dictionary, "categories", "mediation", "mediation"))
      .toBe("民事调解");
  });
});

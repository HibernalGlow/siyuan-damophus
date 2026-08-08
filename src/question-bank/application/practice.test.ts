import { describe, expect, it } from "vitest";
import type { Question, TopicNode } from "../core/types";
import { createPracticeOptionOrder, createPracticeQueue, suggestedMasteryRating } from "./practice";

function question(id: string, topicId: string): Question {
  return {
    id,
    type: "subjective",
    title: id,
    stemMarkdown: id,
    options: [],
    solutionMarkdown: "solution",
    metadata: { topicId, topicPath: [] },
  };
}

describe("practice application service", () => {
  const topics: TopicNode[] = [
    { id: "root", title: "Root", level: 2, childIds: ["child"], explicit: true },
    { id: "child", title: "Child", level: 3, parentId: "root", childIds: [], explicit: true },
  ];

  it("creates sequential queues for recursive scopes", () => {
    const queue = createPracticeQueue({
      questions: [question("q1", "child"), question("q2", "other")],
      topics,
      rootTopicId: "root",
    });
    expect(queue.map((item) => item.id)).toEqual(["q1"]);
  });

  it("uses Fisher-Yates for random queues", () => {
    const values = [0, 0];
    const queue = createPracticeQueue({
      questions: [question("q1", "child"), question("q2", "child"), question("q3", "child")],
      topics,
      order: "random",
      random: () => values.shift() ?? 0,
    });
    expect(queue.map((item) => item.id)).toEqual(["q2", "q3", "q1"]);
  });

  it("freezes source or randomized option order before practice", () => {
    const value: Question = {
      ...question("q1", "child"),
      type: "multiple",
      options: [
        { id: "A", markdown: "Alpha" },
        { id: "B", markdown: "Beta" },
        { id: "C", markdown: "Gamma" },
      ],
      answer: { kind: "options", optionIds: ["A", "C"] },
    };

    expect(createPracticeOptionOrder(value, "source", () => 0)).toEqual(["A", "B", "C"]);
    expect(createPracticeOptionOrder(value, "random", () => 0)).toEqual(["B", "C", "A"]);
  });

  it("keeps objective result independent from mastery suggestions", () => {
    expect(suggestedMasteryRating(false)).toBe("again");
    expect(suggestedMasteryRating(true)).toBe("good");
    expect(suggestedMasteryRating(null, 40)).toBe("again");
    expect(suggestedMasteryRating(null, 90)).toBe("good");
  });
});

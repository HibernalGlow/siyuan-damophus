import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanQuestionMarkdown } from "./scanner";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}.md`, import.meta.url), "utf8");
}

describe("question Markdown scanner", () => {
  it("parses a normalized single-choice question and removes choices from the stem", () => {
    const report = scanQuestionMarkdown(fixture("single-choice"));
    const question = report.document.questions[0];

    expect(report.conflicts).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(question.id).toBe("civil-fixture-single-1");
    expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C", "D"]);
    expect(question.stemMarkdown).toContain("关于合同效力");
    expect(question.stemMarkdown).not.toContain("无效合同自始");
    expect(question.solutionMarkdown).toContain("正确答案为 B");
    expect(question.metadata).toMatchObject({
      subject: "civil",
      category: "contract",
      year: "2025",
      topicId: "civil-contract-validity",
      topicPath: ["合同效力"],
    });
  });

  it("parses the accepted civil-law multiple-choice example", () => {
    const report = scanQuestionMarkdown(fixture("multiple-choice"));
    const question = report.document.questions[0];

    expect(report.conflicts).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(question.id).toBe("civil-gold-objective-2020-2-1-14");
    expect(question.answer).toEqual({ kind: "options", optionIds: ["A", "B", "D"] });
    expect(question.options).toHaveLength(4);
    expect(question.metadata.collection).toBe("gold");
  });

  it("removes nested block IAL from real SiYuan getBlockKramdown content", () => {
    const report = scanQuestionMarkdown(fixture("siyuan-host-kramdown"));
    const question = report.document.questions[0];

    expect(report.conflicts).toEqual([]);
    expect(report.issues).toEqual([]);
    expect(report.document.topics[0]).toMatchObject({
      id: "civil-contract-validity",
      title: "合同效力",
      explicit: true,
    });
    expect(question.id).toBe("civil-fixture-single-1");
    expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C", "D"]);
    expect(question.metadata).toMatchObject({
      subject: "civil",
      category: "contract",
      year: "2025",
      topicId: "civil-contract-validity",
    });
    expect(question.stemMarkdown).toContain("关于合同效力");
    expect(question.solutionMarkdown).toContain("解析：无效合同自始没有法律约束力");
    for (const markdown of [
      question.stemMarkdown,
      question.solutionMarkdown,
      ...question.options.map((option) => option.markdown),
    ]) {
      expect(markdown).not.toContain("{:");
      expect(markdown).not.toContain("custom-qb-");
    }
  });

  it("preserves indented IAL-like code without a SiYuan block ID", () => {
    const markdown = `##### 2. 主观题\n{: custom-qb-id="subjective-code-example" custom-qb-type="subjective"}\n\n下面是属性示例：\n\n    {: custom-example="keep"}\n\n评分要点：保留示例。\n{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.issues).toEqual([]);
    expect(report.document.questions[0].stemMarkdown).toContain('{: custom-example="keep"}');
  });

  it("supports true/false and subjective questions", () => {
    const trueFalse = scanQuestionMarkdown(fixture("true-false"));
    const subjective = scanQuestionMarkdown(fixture("subjective"));

    expect(trueFalse.document.questions[0].answer).toEqual({ kind: "boolean", value: false });
    expect(trueFalse.document.questions[0].options.map((option) => option.id)).toEqual([
      "true",
      "false",
    ]);
    expect(subjective.document.questions[0]).toMatchObject({
      type: "subjective",
      answer: undefined,
      options: [],
    });
  });

  it("builds groups and inherits topic metadata into child questions", () => {
    const report = scanQuestionMarkdown(fixture("question-group"));

    expect(report.conflicts).toEqual([]);
    expect(report.document.questions).toHaveLength(3);
    expect(report.document.groups).toEqual([
      {
        id: "civil-procedure-fixture-group-1",
        materialMarkdown: expect.stringContaining("甲起诉乙"),
        questionIds: [
          "civil-procedure-fixture-group-1-a",
          "civil-procedure-fixture-group-1-b",
        ],
      },
    ]);
    expect(report.document.questions[2].metadata).toMatchObject({
      subject: "civil-procedure",
      source: "fixture",
      parentId: "civil-procedure-fixture-group-1",
    });
  });

  it("reports legacy omissions and conflicts without indexing conflicting questions", () => {
    const report = scanQuestionMarkdown(fixture("malformed-legacy"));

    expect(report.issues.map((issue) => issue.code)).toContain("missing-stable-question-id");
    expect(report.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining(["answer-conflict", "duplicate-question-id"]),
    );
    expect(report.document.questions).toEqual([]);
  });

  it("infers a heading scope but does not invent a permanent topic ID", () => {
    const markdown = `## 临时专题\n\n##### 6. （单）\n{: custom-qb-id="legacy-inference-6" custom-qb-answer="A"}\n\n- 题干\n  - [ ] A. 对\n  - [ ] B. 错\n\n- 正确答案为 A。\n{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.document.topics[0]).toMatchObject({ explicit: false });
    expect(report.document.topics[0].id).toMatch(/^inferred-/u);
    expect(report.inferences.map((inference) => inference.code)).toEqual(
      expect.arrayContaining(["inferred-topic", "inferred-question-type"]),
    );
    expect(report.document.questions[0].stemMarkdown).not.toContain("正确答案");
    expect(report.document.questions[0].solutionMarkdown).toContain("正确答案");
  });

  it("infers a labelled solution boundary without leaking the answer into the stem", () => {
    const markdown = `##### 7. 单选\n{: custom-qb-id="legacy-boundary-7" custom-qb-type="single" custom-qb-answer="A"}\n\n- 题干\n  - [ ] A. 对\n  - [ ] B. 错\n\n答案与解析：A 正确。\n\n正确答案为 A。`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.inferences.map((inference) => inference.code)).toContain("inferred-solution-boundary");
    expect(report.document.questions[0].stemMarkdown).not.toContain("答案与解析");
    expect(report.document.questions[0].solutionMarkdown).toContain("答案与解析");
  });

  it("does not index a question when the answer boundary cannot be inferred safely", () => {
    const markdown = `##### 7. 单选\n{: custom-qb-id="legacy-no-boundary-7" custom-qb-type="single" custom-qb-answer="A"}\n\n- 题干\n  - [ ] A. 对\n  - [ ] B. 错\n\n这段文字没有答案标签。`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.document.questions).toEqual([]);
    expect(report.issues.map((issue) => issue.code)).toContain("missing-solution-boundary");
  });
});

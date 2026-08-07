import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { scanQuestionMarkdown } from "./scanner";

function fixture(name: string): string {
  return readFileSync(new URL(`../fixtures/${name}.md`, import.meta.url), "utf8");
}

describe("question Markdown scanner", () => {
  it("treats a manually corrected answer attribute as authoritative", () => {
    const report = scanQuestionMarkdown(`##### 1. （单）
{: custom-qb-id="corrected-1" custom-qb-type="single" custom-qb-answer="B" custom-qb-answer-corrected="true"}

- stem
  - [ ] A. one
  - [ ] B. two

正确答案为 A。`);

    expect(report.conflicts).toEqual([]);
    expect(report.document.questions[0]?.answer).toEqual({ kind: "options", optionIds: ["B"] });
  });

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

  it("infers an indefinite-choice question and accepts a single correct option", () => {
    const markdown = `##### 3. 不定项选择题
{: custom-qb-id="civil-indefinite-3" custom-qb-answer="A"}

- 下列说法中，正确的是：
  - [ ] A. 甲说法
  - [ ] B. 乙说法
  - [ ] C. 丙说法

正确答案为 A。
{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.issues).toEqual([]);
    expect(report.document.questions[0]).toMatchObject({
      id: "civil-indefinite-3",
      type: "indefinite",
      answer: { kind: "options", optionIds: ["A"] },
    });
    expect(report.ialUpdates).toContainEqual(expect.objectContaining({
      questionId: "civil-indefinite-3",
      attributes: { "custom-qb-type": "indefinite" },
    }));
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
    expect(report.issues.find((issue) => issue.code === "missing-stable-question-id")).toMatchObject({
      title: "99. （单）",
      sourceMarkdown: "##### 99. （单）",
    });
    expect(report.conflicts.map((conflict) => conflict.code)).toEqual(
      expect.arrayContaining(["answer-conflict", "duplicate-question-id"]),
    );
    expect(report.document.questions).toEqual([]);
  });

  it("does not report numbered topic headings as questions without IDs", () => {
    const report = scanQuestionMarkdown(`## 考点必背\n\n### 1. 证据保全\n\n正文\n\n##### 99. （单）\n\n- 旧题`);

    expect(report.issues.filter((issue) => issue.code === "missing-stable-question-id")).toEqual([
      expect.objectContaining({ title: "99. （单）", line: 7 }),
    ]);
    expect(report.document.topics.map((topic) => topic.title)).toEqual(["考点必背", "1. 证据保全"]);
  });

  it("infers a heading scope but does not invent a permanent topic ID", () => {
    const markdown = `## 临时专题\n\n##### 6. （单）\n{: custom-qb-id="legacy-inference-6" custom-qb-answer="A"}\n\n- 题干\n  - [ ] A. 对\n  - [ ] B. 错\n\n- 正确答案为 A。\n{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.document.topics[0]).toMatchObject({ explicit: false, sourceLine: 1 });
    expect(report.document.topics[0].id).toMatch(/^inferred-/u);
    expect(report.inferences.map((inference) => inference.code)).toEqual(
      expect.arrayContaining(["inferred-topic", "inferred-question-type"]),
    );
    expect(report.document.questions[0].stemMarkdown).not.toContain("正确答案");
    expect(report.document.questions[0].solutionMarkdown).toContain("正确答案");
    expect(report.document.questions[0].metadata.topicId).toBeUndefined();
    expect(report.document.questions[0].metadata.scopeTopicId).toBe(report.document.topics[0].id);
    expect(report.ialUpdates).toEqual([expect.objectContaining({
      questionId: "legacy-inference-6",
      attributes: { "custom-qb-type": "single" },
      reason: "inferred-question-type",
    })]);
  });

  it("infers a labelled solution boundary without leaking the answer into the stem", () => {
    const markdown = `##### 7. 单选\n{: custom-qb-id="legacy-boundary-7" custom-qb-type="single" custom-qb-answer="A"}\n\n- 题干\n  - [ ] A. 对\n  - [ ] B. 错\n\n答案与解析：A 正确。\n\n正确答案为 A。`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.inferences.map((inference) => inference.code)).toContain("inferred-solution-boundary");
    expect(report.document.questions[0].stemMarkdown).not.toContain("答案与解析");
    expect(report.document.questions[0].solutionMarkdown).toContain("答案与解析");
    expect(report.ialUpdates).toEqual([expect.objectContaining({
      questionId: "legacy-boundary-7",
      attributes: { "custom-qb-section": "solution" },
      reason: "inferred-solution-boundary",
    })]);
  });

  it("does not strip IAL-like text from a fenced code block after a non-closing fence line", () => {
    const markdown = `##### 3. 主观题
{: custom-qb-id="subjective-fence-example" custom-qb-type="subjective"}

\`\`\`text
\`\`\`still code
{: custom-example="keep"}
\`\`\`

评分要点：保留示例。
{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.issues).toEqual([]);
    expect(report.document.questions[0].stemMarkdown).toContain('{: custom-example="keep"}');
  });

  it("keeps repeated inferred headings as distinct selectable scopes", () => {
    const markdown = `## 重复专题

##### 1. 主观题
{: custom-qb-id="repeat-topic-1" custom-qb-type="subjective"}

题干一。

参考答案：一。
{: custom-qb-section="solution"}

## 重复专题

##### 2. 主观题
{: custom-qb-id="repeat-topic-2" custom-qb-type="subjective"}

题干二。

参考答案：二。
{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.conflicts).toEqual([]);
    expect(report.document.topics).toHaveLength(2);
    expect(new Set(report.document.topics.map((topic) => topic.id))).toHaveLength(2);
    expect(report.document.questions.map((question) => question.metadata.scopeTopicId)).toEqual(
      report.document.topics.map((topic) => topic.id),
    );
  });

  it("does not attach SiYuan's trailing document IAL to the final content block", () => {
    const markdown = `##### 7. 单选
{: id="20260804120200-quest07" custom-qb-id="legacy-boundary-7" custom-qb-type="single" custom-qb-answer="A"}

- 题干
  - [ ] A. 对
  - [ ] B. 错

答案与解析：A 正确。
{: id="20260804120300-solut07"}

{: id="20260804120000-docroot" type="doc" title="题库"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.ialUpdates).toEqual([expect.objectContaining({
      blockId: "20260804120300-solut07",
      attributes: { "custom-qb-section": "solution" },
      reason: "inferred-solution-boundary",
    })]);
  });

  it("previews a normalized machine answer when only the visible solution provides it", () => {
    const markdown = `##### 8. 单选
{: id="20260804120200-quest08" custom-qb-id="legacy-answer-8" custom-qb-type="single"}

- 题干
  - [ ] A. 对
  - [ ] B. 错

正确答案为 A。
{: id="20260804120300-solut08" custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.document.questions[0].answer).toEqual({ kind: "options", optionIds: ["A"] });
    expect(report.ialUpdates).toEqual([expect.objectContaining({
      blockId: "20260804120200-quest08",
      attributes: { "custom-qb-answer": "A" },
      reason: "inferred-machine-answer",
    })]);
  });

  it("uses explicit abnormal option IDs without splitting multi-character answers", () => {
    const markdown = `##### 11. 单选
{: custom-qb-id="abnormal-option-11" custom-qb-type="single" custom-qb-answer="X1"}

题干。

第一种特殊表述。
{: custom-qb-option="X1"}

第二种特殊表述。
{: custom-qb-option="Y1"}

参考答案：第一种。
{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);
    const question = report.document.questions[0];

    expect(report.issues).toEqual([]);
    expect(question.options).toEqual([
      { id: "X1", markdown: "第一种特殊表述。" },
      { id: "Y1", markdown: "第二种特殊表述。" },
    ]);
    expect(question.answer).toEqual({ kind: "options", optionIds: ["X1"] });
    expect(question.stemMarkdown).toBe("题干。");
  });

  it("recognizes clearly labelled independent option paragraphs", () => {
    const markdown = `##### 12. 多选
{: custom-qb-id="paragraph-options-12" custom-qb-type="multiple" custom-qb-answer="A,C"}

题干。

A. 第一项。

B. 第二项。

C. 第三项。

正确答案为 A、C。
{: custom-qb-section="solution"}`;
    const report = scanQuestionMarkdown(markdown);
    const question = report.document.questions[0];

    expect(report.issues).toEqual([]);
    expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C"]);
    expect(question.stemMarkdown).toBe("题干。");
  });

  it("does not index a question when the answer boundary cannot be inferred safely", () => {
    const markdown = `##### 7. 单选\n{: custom-qb-id="legacy-no-boundary-7" custom-qb-type="single" custom-qb-answer="A"}\n\n- 题干\n  - [ ] A. 对\n  - [ ] B. 错\n\n这段文字没有答案标签。`;
    const report = scanQuestionMarkdown(markdown);

    expect(report.document.questions).toEqual([]);
    expect(report.issues.map((issue) => issue.code)).toContain("missing-solution-boundary");
  });

  it("does not override invalid explicit question metadata with visible inferences", () => {
    const invalidType = scanQuestionMarkdown(`##### 9. （单）
{: custom-qb-id="invalid-type-9" custom-qb-type="singel" custom-qb-answer="A"}

- 题干
  - [ ] A. 对
  - [ ] B. 错

正确答案为 A。
{: custom-qb-section="solution"}`);
    const invalidAnswer = scanQuestionMarkdown(`##### 10. 单选
{: custom-qb-id="invalid-answer-10" custom-qb-type="single" custom-qb-answer="?"}

- 题干
  - [ ] A. 对
  - [ ] B. 错

正确答案为 A。
{: custom-qb-section="solution"}`);

    expect(invalidType.document.questions).toEqual([]);
    expect(invalidType.issues.map((issue) => issue.code)).toContain("invalid-question-type");
    expect(invalidAnswer.document.questions).toEqual([]);
    expect(invalidAnswer.issues.map((issue) => issue.code)).toContain("invalid-machine-answer");
  });

  it("blocks explicit topic IDs that are not lowercase ASCII kebab-case", () => {
    const report = scanQuestionMarkdown(`## Invalid topic
{: custom-qb-note-topic-id="Invalid Topic"}

##### 1. 主观题
{: custom-qb-id="invalid-topic-question" custom-qb-type="subjective"}

题干。

参考答案：答案。
{: custom-qb-section="solution"}`);

    expect(report.conflicts.map((conflict) => conflict.code)).toContain("invalid-topic-id");
  });

  it("parses multiple question-to-topic references", () => {
    const report = scanQuestionMarkdown(`##### 1. 主观题
{: custom-qb-id="portable-topic-question" custom-qb-type="subjective" custom-qb-question-topic-ids="civil-security-flow-clause,civil-guarantee-contract"}

题干。

参考答案：答案。
{: custom-qb-section="solution"}`);

    expect(report.conflicts).toEqual([]);
    expect(report.document.questions[0].metadata.topicIds).toEqual([
      "civil-security-flow-clause",
      "civil-guarantee-contract",
    ]);
  });

  it("blocks invalid IDs in the portable Topic Index relation mirror", () => {
    const report = scanQuestionMarkdown(`##### 1. 主观题
{: custom-qb-id="invalid-portable-topic-question" custom-qb-type="subjective" custom-qb-question-topic-ids="valid-topic, Invalid Topic"}

题干。

参考答案：答案。
{: custom-qb-section="solution"}`);

    expect(report.document.questions).toEqual([]);
    expect(report.conflicts.map((conflict) => conflict.code)).toContain("invalid-portable-topic-id");
  });

  it("blocks duplicate question topic IDs", () => {
    const report = scanQuestionMarkdown(`##### 1. 主观题
{: custom-qb-id="duplicate-portable-topic-question" custom-qb-type="subjective" custom-qb-question-topic-ids="valid-topic,valid-topic"}

题干。

参考答案：答案。
{: custom-qb-section="solution"}`);

    expect(report.document.questions).toEqual([]);
    expect(report.conflicts.map((conflict) => conflict.code)).toContain("duplicate-portable-topic-id");
  });

  it("accepts legacy topic attributes with migration issues", () => {
    const report = scanQuestionMarkdown(`## Legacy topic
{: custom-qb-role="topic" custom-qb-topic-id="legacy-topic"}

##### 1. 主观题
{: custom-qb-id="legacy-topic-question" custom-qb-type="subjective" custom-qb-topic-ids="legacy-topic"}

题干。

参考答案：答案。
{: custom-qb-section="solution"}`);

    expect(report.conflicts).toEqual([]);
    expect(report.document.questions[0].metadata.topicIds).toEqual(["legacy-topic"]);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "legacy-note-topic-attribute",
      "legacy-question-topic-attribute",
    ]));
  });

  it("blocks note-topic provider attributes on question blocks", () => {
    const report = scanQuestionMarkdown(`##### 1. 主观题
{: custom-qb-id="mixed-topic-question" custom-qb-type="subjective" custom-qb-note-topic-id="valid-topic"}

题干。

参考答案：答案。
{: custom-qb-section="solution"}`);

    expect(report.document.questions).toEqual([]);
    expect(report.conflicts.map((conflict) => conflict.code)).toContain("mixed-topic-direction");
  });

  it("recognizes an explicit note-topic paragraph anchor", () => {
    const report = scanQuestionMarkdown(`**考点：善意取得**
{: custom-qb-note-topic-id="civil-property-good-faith-acquisition"}

普通笔记正文。`);

    expect(report.conflicts).toEqual([]);
    expect(report.document.topics).toContainEqual(expect.objectContaining({
      id: "civil-property-good-faith-acquisition",
      title: "考点：善意取得",
      explicit: true,
      level: 6,
    }));
  });
});

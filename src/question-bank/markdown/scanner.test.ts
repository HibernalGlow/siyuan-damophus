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

  it("preserves inline math LaTeX verbatim in options, stem, and solution", () => {
    const report = scanQuestionMarkdown(`##### 8. 条约的冲突（多）
{: custom-qb-id="treaty-math-8" custom-qb-type="multiple" custom-qb-answer="AB"}

- 甲国对丙国机床征收 $5\\%$ 关税。下列说法正确的是？
  - [ ] A. 甲国关税降至 $3\\%$
  - [ ] B. 甲国关税降至 $3%$

正确答案为 AB。解析见 $\\frac{\\Delta}{2}$ 公式。`);

    expect(report.conflicts).toEqual([]);
    expect(report.issues).toEqual([]);
    const question = report.document.questions[0];
    expect(question.options.map((option) => option.id)).toEqual(["A", "B"]);
    expect(question.options[0].markdown).toBe("甲国关税降至 $3\\%$");
    expect(question.options[1].markdown).toBe("甲国关税降至 $3%$");
    expect(question.stemMarkdown).toContain("征收 $5\\%$ 关税");
    expect(question.solutionMarkdown).toContain("$\\frac{\\Delta}{2}$");
  });

  it("accepts a single correct option for an explicitly indefinite question", () => {
    const markdown = `##### 3. 不定项选择题
{: custom-qb-id="civil-indefinite-3" custom-qb-type="indefinite" custom-qb-answer="A"}

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
  });

  it("infers choice type from a machine answer when the heading has no type marker", () => {
    const multiple = scanQuestionMarkdown(`##### 1.
{: custom-qb-id="answer-inferred-multiple" custom-qb-answer="BCD"}

- 下列说法正确的是：
  - [ ] A. 甲
  - [ ] B. 乙
  - [ ] C. 丙
  - [ ] D. 丁

正确答案为 BCD。
{: custom-qb-section="solution"}`);
    expect(multiple.issues).toEqual([]);
    expect(multiple.document.questions[0]).toMatchObject({
      type: "multiple",
      answer: { kind: "options", optionIds: ["B", "C", "D"] },
    });
    expect(multiple.ialUpdates).toContainEqual(expect.objectContaining({
      questionId: "answer-inferred-multiple",
      attributes: { "custom-qb-type": "multiple" },
      reason: "inferred-question-type",
    }));

    const single = scanQuestionMarkdown(`##### 2.
{: custom-qb-id="answer-inferred-single" custom-qb-answer="A"}

- 下列说法正确的是：
  - [ ] A. 甲
  - [ ] B. 乙

正确答案为 A。
{: custom-qb-section="solution"}`);
    expect(single.issues).toEqual([]);
    expect(single.document.questions[0]).toMatchObject({
      type: "single",
      answer: { kind: "options", optionIds: ["A"] },
    });

    const propertyWins = scanQuestionMarkdown(`##### 3. 多选题
{: custom-qb-id="answer-wins-over-heading" custom-qb-answer="A"}

- 下列说法正确的是：
  - [ ] A. 甲
  - [ ] B. 乙

正确答案为 A。
{: custom-qb-section="solution"}`);
    expect(propertyWins.issues).toEqual([]);
    expect(propertyWins.document.questions[0]?.type).toBe("single");
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

  it("indexes a case card whose choices sit in a nested SELECTION callout", () => {
    const report = scanQuestionMarkdown(`##### [调解·多选] 5.
{: custom-qb-id="cp-cc-5" custom-qb-type="multiple" custom-qb-answer="C,D" custom-qb-question-topic-ids="civil-procedure-mediation"}

- 朱某已签收调解书，刘某一直未领取。后朱某反悔，不愿意离婚。下列说法哪些正确？

    > [!SELECTION] 选项
    >
    > - [ ] A. 朱某可以反悔，法院依调解协议制作判决书
    > - [ ] B. 朱某可以反悔，法院应当根据案件审理情况制作判决书
    > - [ ] C. 朱某不能反悔，因为其已经签收调解书
    > - [ ] D. 朱某可以向法院申请撤回起诉

    - 正确答案：CD。
    {: custom-qb-section="solution"}
    - 已签收的一方不得反悔。`);
    const question = report.document.questions[0];

    expect(report.issues).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C", "D"]);
    expect(question.answer).toEqual({ kind: "options", optionIds: ["C", "D"] });
    expect(question.stemMarkdown).toContain("朱某反悔");
    expect(question.stemMarkdown).not.toContain("撤回起诉");
    expect(question.solutionMarkdown).toContain("正确答案：CD");
  });

  it("infers the solution boundary of a case card from its answer-shaped child list", () => {
    const report = scanQuestionMarkdown(`##### [调解·多选] 5.
{: custom-qb-id="cp-cc-5b" custom-qb-type="multiple" custom-qb-answer="C,D" custom-qb-question-topic-ids="civil-procedure-mediation"}

- 朱某已签收调解书，刘某一直未领取。后朱某反悔，不愿意离婚。下列说法哪些正确？

    > [!SELECTION] 选项
    >
    > - [ ] A. 朱某可以反悔，法院依调解协议制作判决书
    > - [ ] B. 朱某可以反悔，法院应当根据案件审理情况制作判决书
    > - [ ] C. 朱某不能反悔，因为其已经签收调解书
    > - [ ] D. 朱某可以向法院申请撤回起诉

    - 正确答案：CD。
    - 已签收的一方不得反悔。`);
    const question = report.document.questions[0];

    expect(report.issues).toEqual([]);
    expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C", "D"]);
    expect(question.stemMarkdown).not.toContain("撤回起诉");
    expect(question.solutionMarkdown).toContain("正确答案：CD");
    expect(report.inferences.map((inference) => inference.code)).toContain("inferred-solution-boundary");
    expect(report.ialUpdates.filter((update) => update.reason === "inferred-solution-boundary")).toEqual([]);
  });

  it("indexes a fused case card from real getBlockKramdown content", () => {
    // SiYuan writes every block's own IAL inline after its marker chain, so an option inside a
    // callout arrives as `> - {: id="…"}[ ] A. …` and the item's trailing IAL line must not
    // become a blank line, or the blockquote splits into one quote per option.
    const report = scanQuestionMarkdown(`##### [调解·多选] 5.
{: id="20260908173505-0qbu8rm" updated="20260908173505" custom-qb-answer="C" custom-qb-id="cp-cc-kramdown" custom-qb-type="single"}

- {: id="20260908173505-b3xlo9l" updated="20260908173505"}⚖️ 朱某已签收调解书，刘某一直未领取。后朱某反悔，下列说法正确？
  {: id="20260908173505-rvsz0n4" updated="20260908173505"}

  > [!SELECTION] SELECTION
  > - {: id="20260908173505-uqe0f8y" updated="20260908173505"}[ ] A. 朱某可以反悔，法院依调解协议制作判决书
  >   {: id="20260908173505-e11z6j9" updated="20260908173505"}
  > - {: id="20260908173505-4z1quni" updated="20260908173505"}[ ] B. 朱某可以反悔，法院应当制作判决书
  >   {: id="20260908173505-dac51ev" updated="20260908173505"}
  > - {: id="20260908173505-vmr76w2" updated="20260908173505"}[ ] C. 朱某不能反悔，因为其已经签收调解书
  >   {: id="20260908173505-d149106" updated="20260908173505"}
  > {: id="20260908173505-jrgy746" updated="20260908173505"}
  >
  {: id="20260908173505-x6cqwfd" updated="20260908173505"}

  - {: id="20260908173505-gy1mf2m" updated="20260908173505"}正确答案：C。
    {: id="20260908173505-w64qrip" updated="20260908173505"}
  - {: id="20260908173505-hg4h5y0" updated="20260908173505"}已签收的一方不得反悔。
    {: id="20260908173505-kp3z1aa" updated="20260908173505"}
  {: id="20260908173505-57gy7kh" updated="20260908173505" custom-dm-card-id="fc-cp-cc-5"}
{: id="20260908173505-0binqf6" updated="20260908173505"}`);
    const question = report.document.questions[0];

    expect(report.issues).toEqual([]);
    expect(report.conflicts).toEqual([]);
    expect(question.options.map((option) => option.id)).toEqual(["A", "B", "C"]);
    expect(question.answer).toEqual({ kind: "options", optionIds: ["C"] });
    expect(question.stemMarkdown).toContain("朱某反悔");
    expect(question.stemMarkdown).not.toContain("制作判决书");
    expect(question.solutionMarkdown).toContain("正确答案：C");
    for (const markdown of [question.stemMarkdown, question.solutionMarkdown,
      ...question.options.map((option) => option.markdown)]) {
      expect(markdown).not.toContain("{: id=");
    }
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

  it("normalizes raw subject metadata onto canonical subject ids", () => {
    const report = scanQuestionMarkdown(`##### 1. （单）
{: custom-qb-id="subject-alias-1" custom-qb-type="single" custom-qb-answer="A" custom-qb-subject="administrative law"}

- stem
  - [ ] A. one
  - [ ] B. two

正确答案为 A。`);

    expect(report.document.questions[0].metadata.subject).toBe("administrative");
  });

  it("keeps unrecognized custom subject values verbatim", () => {
    const report = scanQuestionMarkdown(`##### 2. （单）
{: custom-qb-id="subject-alias-2" custom-qb-type="single" custom-qb-answer="A" custom-qb-subject="地方性法规专题"}

- stem
  - [ ] A. one
  - [ ] B. two

正确答案为 A。`);

    expect(report.document.questions[0].metadata.subject).toBe("地方性法规专题");
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

  it("keeps an answer heading with the solution when its child owns the marker", () => {
    const markdown = `##### 202. （单）
{: custom-qb-id="nested-solution-heading" custom-qb-type="single" custom-qb-answer="A"}

- 张三起诉李四要求离婚
  - [ ] A. 张三可以提起上诉
  - [ ] B. 张三可以申请再审

###### 答案与解析

- 正确答案：A。
{: custom-qb-section="solution"}

解析正文。`;
    const report = scanQuestionMarkdown(markdown);
    const question = report.document.questions[0];

    expect(question.stemMarkdown).not.toContain("答案与解析");
    expect(question.solutionMarkdown).toContain("###### 答案与解析");
    expect(question.solutionMarkdown).toContain("正确答案：A");
  });
});

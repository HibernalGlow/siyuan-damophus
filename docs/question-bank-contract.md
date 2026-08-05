# Question Bank Contract

Status: accepted on 2026-08-04.

## Ownership

| Layer | Owns | Must not own |
| --- | --- | --- |
| Markdown + IAL | 题目正文、稳定 ID、题型、标准答案、专题和答案区边界 | 作答历史、派生统计、Riff 状态、数据库 key ID |
| Damophus core | 解析、校验、选项映射、答案判定、作答聚合 | 思源 API、块 ID 和界面状态 |
| SiYuan adapter | 块读取、IAL 写入、属性视图和 Riff 集成 | 可移植题目规则和 Markdown 正文改写 |
| Damophus UI | 练习会话、题目展示、用户操作和筛选状态 | 题库源的事实数据 |
| Future web adapter | Markdown 读取、网站渲染和网站侧记录存储 | 思源专用类型和 API |

## Source Structure

```markdown
### 考点39：意定担保物权的流押流质条款
{: custom-qb-role="topic" custom-qb-topic-id="civil-security-flow-clause" custom-qb-subject="civil" custom-qb-category="security-rights"}

##### 108.
{: custom-qb-id="civil-gold-objective-2020-2-1-14" custom-qb-type="multiple" custom-qb-year="2020" custom-qb-answer="A,B,D"}

- 题干……
  - [ ] A. 选项 A
  - [ ] B. 选项 B
  - [ ] C. 选项 C
  - [ ] D. 选项 D

- 综合考向：……
{: custom-qb-section="solution"}

- 正确答案为 A、B、D。
```

题目标题块开始后，到下一题标题块之前的所有块均属于该题。`custom-qb-section="solution"` 所在块及其后续块属于答案区。规范化题库源使用五级题目标题，但解析器以 `custom-qb-id` 识别题目身份，不把标题级别作为永久契约。

## Static IAL

| Attribute | Required on | Meaning |
| --- | --- | --- |
| `custom-qb-role="topic"` | 规范化专题标题 | 声明可移植、可稳定引用的专题 |
| `custom-qb-topic-id` | 规范化专题标题 | 稳定专题身份，使用小写 ASCII kebab-case |
| `custom-qb-id` | 题目标题 | 全库唯一、永久稳定的题目身份 |
| `custom-qb-type` | 题目标题 | `single`、`multiple`、`indefinite`、`true-false`、`subjective` 或 `group` |
| `custom-qb-answer` | 可机器判分题目 | 原始选项 ID 列表，判断题为 `true` 或 `false` |
| `custom-qb-year` | 题目或上级专题 | 题目年份 |
| `custom-qb-subject` | 题目或上级专题 | 科目标识 |
| `custom-qb-category` | 题目或上级专题 | 分类标识 |
| `custom-qb-collection` | 题目或上级专题 | 题集标识 |
| `custom-qb-source` | 题目或上级专题 | 来源标识 |
| `custom-qb-parent-id` | 组合题子题 | 所属题组的稳定题目 ID |
| `custom-qb-option` | 异常选项块 | 无法从文本稳定识别时的原始选项 ID |
| `custom-qb-section="solution"` | 答案区首块 | 明确题面和答案区边界 |

题目继承最近上级专题的 subject、category、collection 和 source。题目级属性只在需要覆盖继承值时出现。由 Agent 生成或已经规范化的题库源必须给专题写稳定 IAL；普通现有文档即使没有专题 IAL，也可以按标题树自动识别或由用户手动选择范围根节点。手动范围使用思源文档 ID 和标题块 ID 保存，不反向伪造稳定专题 ID。

`custom-qb-mode` 保留为未来扩展字段，首版不得用它替代题型或专题身份。

## Stable Identity

稳定题目 ID 推荐格式：

```text
{subject}-{source}-{kind}-{year}-{paper}-{question}
```

例如 `civil-gold-objective-2020-2-1-14`。专题显示序号、章节名称、思源块 ID 和数据库行 ID 均不得进入稳定题目 ID。已有 ID 除非确认错误并执行显式迁移，否则不可修改。

## Options and Answers

- `single` 的答案是一个原始选项 ID。
- `multiple` 使用英文逗号连接至少两个原始选项 ID，例如 `A,B,D`。
- `true-false` 使用小写 `true` 或 `false`。
- `subjective` 和 `group` 不写机器答案。
- 普通选项从任务列表、普通列表或带明确前缀的独立段落识别。
- 只有无法可靠识别的异常选项才写 `custom-qb-option`。
- 打乱仅改变一次作答中的展示顺序和临时标签，不改变原始选项 ID。

## Scanner Rules

扫描分为只读预览和确认写入两个阶段：

1. 显式 IAL 优先于结构推断。
2. 旧文档可以推断专题、选项和答案区，但每项推断必须出现在预览报告中。
3. IAL 与可见答案冲突时，该题标记为冲突并停止写入。
4. 缺失稳定 ID、题型或必要答案时，该题不得进入题目属性视图。
5. 写入只允许增加或更新 `custom-qb-*` 属性和属性视图数据。
6. 不移动、删除、重排或改写题目内容块。

## Question Attribute View

题目属性视图绑定题目标题块。插件用 attribute-view key ID 识别受管列，因此用户可以重命名、重排列并添加自定义列。

首版受管逻辑字段包括：题目 ID、题型、年份、科目、分类、题集、来源、专题 ID、父题 ID、块 ID 和最近扫描时间。插件不删除未知列；缺少受管列时先预览，再补建所需列。

受管列使用稳定的语义类型：题型、科目、分类、题集和来源为单选，年份为数字，最近扫描时间为日期，稳定 ID 仍为文本。Question Index 还包含指向 Attempt Log 的双向 `Attempts` 关联，以及从该关联派生的作答次数、错误次数和总耗时汇总列。汇总列只展示从不可变事件计算的结果，不成为新的事实来源。

## Attempt Events

作答记录使用 detached attribute-view rows。每个事件至少包含：

| Field | Meaning |
| --- | --- |
| `schema_version` | JSON 和事件结构版本 |
| `attempt_id` | 全局唯一事件 ID |
| `question_id` | 稳定题目 ID，权威关联键 |
| `question_relation` | 可选的题目 AV 关系，仅用于导航 |
| `session_id` | 本次练习会话 ID |
| `answered_at` | 提交时间 |
| `question_type` | 提交时的题型快照 |
| `option_order` | 展示时的原始选项 ID 顺序 |
| `selected_option_ids` | 用户选择映射回的原始选项 ID |
| `objective_correct` | `true`、`false` 或主观题的 `null` |
| `mastery_rating` | `again`、`hard`、`good` 或 `easy` |
| `subjective_score` | 主观题可选的用户评分 |
| `duration_ms` | 可选的作答时长 |

答案揭晓只是临时结果；用户选择掌握评级后才提交作答事件。事件一经提交不可更新或覆盖，误触重新作答只能在评级前执行，因此不生成事件。未来若允许修改已提交评级，必须追加纠正事件，不得覆盖原事件。

题目关联列是辅助导航，`question_id` 才是数据库重建、JSON 恢复和跨端迁移时的权威关联。作答次数、错误次数、正确率、最近作答、连续待复习次数和建议评级均为派生值，可从事件重算。

Attempt Log 的受管列类型固定如下：schema version、主观评分、作答耗时和 `wrong_value` 为数字；提交时间为日期；题型、客观正确性和掌握评级为单选；选项展示顺序和已选项为多选；题目关系为双向关联；事件 ID、题目 ID 和会话 ID 为文本。`wrong_value` 仅在客观题答错时为 `1`，其他情况为 `0`，用于 Question Index 的错误次数汇总。旧数据库升级时必须迁移已有单元格载荷和关系行 ID，不能只修改列定义。

## Export Contract

JSON 导出包含 schema version、导出时间、插件版本和作答事件数组。导入必须按 `attempt_id` 去重，未知字段保留或忽略但不得破坏已知字段；不匹配的 `question_id` 进入待处理报告，不静默丢弃。

## Practice Session Snapshots

未完成练习使用独立的可变快照，不写入 Markdown/IAL，也不混入不可变作答事件。快照至少记录：schema version、revision、session ID、宿主 source key、范围、筛选、顺序、固定题目队列、当前题目、已提交题目 ID、累计有效用时，以及每题的原始选项顺序、可用选项、选择、揭晓状态、客观结果、主观评分和累计有效用时。

- 快照只使用稳定题目 ID 和原始选项 ID，不复制题干、答案或解析。
- 宿主 source key 只负责找回题源，不替代稳定题目 ID；思源可使用启动块 ID，网站可以使用自己的可持久定位。
- 恢复时，以 Attempt Log 中同一 session ID 的事件重新确定已提交题目，快照不得冒充已提交事实。
- 已提交题目的回看使用 AttemptEvent 中的展示顺序、选择、结果、评级和用时，禁止修改原事件。
- 每次有意义操作增加 revision 并自动保存；宿主适配器必须拒绝不匹配的 expected revision。
- 暂停和关闭活动界面前必须刷盘；完成或明确终止后删除快照，保留作答事件。
- 不支持或损坏的 schema 不得静默覆盖，必须允许导出原始诊断数据。

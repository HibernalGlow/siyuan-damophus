# Damophus Architecture

Status: accepted on 2026-08-04.

## Existing Shell

Damophus 继续使用上游的 `PluginRegistry` 和 `SubPluginBase` 生命周期。运行时只发现 `src/lets-question-bank/` 与 `src/lets-block-attr/`；题库核心不得放进 UI 模块。

## Target Layers

```text
src/question-bank/
  core/                 pure TypeScript domain model and services
  markdown/             Markdown + IAL parsing and serialization
  adapters/
    siyuan/             blocks, attributes, AV and Riff
  application/          scan, sync, practice and review use cases

src/lets-question-bank/ Svelte 5 plugin UI and lifecycle integration
```

### Core

- 定义 `Question`、`QuestionGroup`、`TopicNode`、`AttemptEvent` 和聚合统计。
- 负责答案判定、选项打乱映射、范围筛选和连续待复习次数计算。
- 不 import `siyuan`、Svelte、DOM API 或属性视图类型。
- 所有输入输出都可序列化，供未来网站直接复用。

### Markdown

- 使用 `unified`、`remark-parse` 和 `remark-gfm` 构建标准 Markdown AST。
- 仅为思源 IAL 语法和 Damophus 题目规则实现小型扩展。
- 使用 Zod 校验从 AST 生成的可移植模型。
- 答案区输出 HTML 时使用 `remark-rehype` 和 `rehype-sanitize`，不手写不安全的 HTML 拼接。

### SiYuan adapter

- 优先复用仓库 `src/api.ts` 和成熟插件中的已验证调用模式。
- 使用块 ID 读取标题树和题目范围，使用稳定题目 ID 建立业务关联。
- 负责属性视图初始化、列 key ID 绑定、detached attempt rows、Riff 制卡和评级提交。
- 所有写操作先生成预览；缺少绑定或存在冲突时停止写入。

### Application services

- `scanDocument`: 读取文档并生成题目、推断和冲突报告。
- `syncQuestionIndex`: 确认后写 IAL 和题目属性视图。
- `startPracticeSession`: 从范围根节点和筛选条件创建题目队列。
- `revealAnswer`: 计算临时客观结果并恢复原始选项顺序，不写作答事件。
- `submitAttempt`: 用户给出掌握评级后追加不可变作答事件并更新派生视图。
- `reviewDueQuestions`: 读取 Riff 到期状态并用 Damophus UI 复习。
- `exportAttempts` / `importAttempts`: 版本化 JSON 备份与恢复。

## State Ownership

- 题目静态内容：Markdown + IAL。
- 题目索引和用户自定义字段：题目属性视图。
- 作答事实：作答记录属性视图。
- 派生统计：从作答事件计算，可缓存但不是事实来源。
- 调度状态：思源 Riff。
- 短期会话状态：Damophus UI 内存，必要时保存最小恢复快照。
- 多设备同步与备份：思源本身。

## UI Boundary

首版使用 Svelte 5，因为上游插件壳和现有组件均为 Svelte。题库核心和 Markdown 模型不依赖 Svelte；未来 React 网站复用核心、契约和测试数据，但可以重新实现 UI。

界面必须适配思源桌面端和移动端可用宽度。固定格式控件应使用稳定尺寸和响应式约束；题目、选项、答案区和操作栏不得互相遮挡。

## Toolchain

- Vite 8
- Svelte 5
- TypeScript 6，待 Svelte 工具链完整支持后再单独升级 TypeScript 7
- pnpm
- Vitest，核心逻辑使用 Node 环境
- Vitest Browser Mode，验证 Svelte 交互和响应式布局

基础设施迁移必须先作为独立提交完成，再删减模块和实现题库，以便区分工具链回归与产品改动。

## Write Safety

1. 默认读取，不默认修改现有题目块。
2. 扫描和同步严格分为 preview 与 confirm。
3. 只写被允许的 `custom-qb-*` IAL、受管 AV 字段和作答事件。
4. 不删除用户自定义 AV 列，不按列显示名称识别字段。
5. 数据库绑定丢失时停止，不自动创建第二套系统文档或属性视图。
6. 所有批量写入返回逐题结果，允许重新扫描和幂等重试。

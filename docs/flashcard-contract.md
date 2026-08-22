# Flashcard Contract

Status: accepted design, implementation pending.

本文定义 DAMO 闪卡与 Markdown、SiYuan Riff、题库考点之间的边界，并规定对 Specialized-Flashcard-Plugin 的功能等价迁移。字段名和语义是稳定协议；块 ID、数据库行 ID、Riff card ID 和运行时调度字段不是协议身份。

## Ownership

| 来源/适配器 | 负责 | 不负责 |
| --- | --- | --- |
| Markdown/Kramdown + IAL | 卡片正文、答案边界、稳定身份、卡型、renderer、topic 引用、优先级标签 | due、interval、review log、suspend、bury |
| DAMO flashcard core | 结构化解析、容器识别、preview/confirm、去重、来源重绑、迁移报告 | 思源 DOM、Riff 调度实现 |
| DAMO Riff adapter | capability detection、登记、登记后查询、到期筛选、评分和失败状态 | Markdown 业务身份、内容改写 |
| SiYuan native card panel | 卡片加载、答案显示、评分交互、移动端复习布局 | DAMO 的知识分类和来源索引 |
| Derived index/manifest | 当前块定位、版本和迁移诊断 | 稳定业务事实 |

## Stable attributes

| Attribute | Required on | Contract |
| --- | --- | --- |
| `custom-dm-source-key` | 来源文档或来源容器根 | 可移植来源身份；同一 live 来源只能唯一匹配 |
| `custom-dm-card-id` | 闪卡容器根 | 可移植卡片业务身份；不得使用块 ID、数据库行 ID 或 Riff card ID |
| `custom-dm-card-schema` | 闪卡容器根 | 当前协议版本，V1 为 `1`；未知 schema 停止写入并报告 |
| `custom-dm-card-kind` | 闪卡容器根 | 语义卡型，如 `basic`、`cloze` |
| `custom-dm-card-renderer` | 闪卡容器根 | 宿主承载方式：`mark`、`list`、`heading`、`superBlock`、`blockquote` 或 `callout` |
| `custom-qb-note-topic-id` | 笔记 provider 锚点 | 该块为一个考点提供材料；不保存 provider 块 ID |
| `custom-qb-question-topic-ids` | 卡片/题目根 | 逗号分隔的稳定考点 ID；不保存目标块 ID |
| `custom-riff-decks` | Riff 登记后的容器根 | 当前适配结果的牌组标识；为空或缺失不代表制卡成功 |

属性必须放在容器根块的 IAL 中，不得放进代码围栏或可能脱离根块范围的普通段落。一个根块的内容范围由其容器类型和子树确定；标题可以是根块，但标题层级不构成稳定身份。

## Container policy

| Renderer | Meaning | Default rule |
| --- | --- | --- |
| `list` | 普通问答卡 | 默认 basic 渲染器，问题与答案由明确的子项边界组成 |
| `mark` | 挖空卡 | 仅显式 `cloze` 卡启用；普通 `==高亮==` 忽略 |
| `heading` | 标题承载卡 | 原生 heading 根块或显式卡片 IAL；不得把相邻标题隐式并入答案 |
| `superBlock` | 超级块承载卡 | 原生 superBlock 根块或显式卡片 IAL；范围限于该超级块子树 |
| `blockquote` | 引用承载卡 | 原生 blockquote 根块或显式卡片 IAL |
| `callout` | Callout 承载卡 | 原生 callout 根块或显式卡片 IAL |

未来一个根块可能产生多个变体。变体 ID 使用 `parent-card-id + variant-key` 的确定性组合；当前 Riff 一块一张卡，因此 V1 只登记根块卡，变体字段保留给后续 adapter profile。

## One-click creation protocol

```text
scan source → parse AST/Kramdown + IAL → validate identity/container
→ produce preview → user confirm → addRiffCards
→ query by block IDs → compare identity/deck/result
→ report registered | pending | conflict | orphan
```

Preview 至少包含：问题、答案、卡型、renderer、topic IDs、P1-P4、来源 key、预计卡片数、已有 Riff 绑定和写入动作。确认后只写允许的 DAMO IAL 和 Riff 登记结果；重复执行必须幂等且不得重置调度状态。

## Source rebind and conflicts

```text
scan custom-dm-source-key
  no match       -> create preview
  one live match -> update/rebind preview
  many matches   -> stop and request conflict resolution
  root deleted   -> report orphan; do not create a second source
```

外部 Markdown 使用结构化解析器导入。现有文档含人工编辑、反链或块引用时，默认只维护允许的 DAMO IAL。provider 和 question topic ID 在块 ID 变化后通过重新扫描绑定当前块。

## Priority and taxonomy

用户可见优先级只使用：

```text
#闪卡/优先级/P1#  #闪卡/优先级/P2#  #闪卡/优先级/P3#  #闪卡/优先级/P4#
```

知识分类独立使用 `#法考/科目/领域/专题/考点/知识点#`。P1-P4 到内部数值的映射属于 DAMO adapter；若 Riff 没有稳定公开的优先级写入 API，标签仍是唯一事实来源。

## Runtime and compatibility

Riff 独占 due、interval、review log、suspend、bury、评分历史等运行时状态。DAMO 预渲染兼容层只在原生 `siyuan-card` 加载/渲染前读取当前卡片 renderer，选择临时配置并在结束后恢复；不得持久化修改 `window.siyuan.config.flashcard`。

兼容层从 SiYuan 3.8.1 起支持，按 V1/V2 capability profile 检查目标字段、属性描述符、Riff API 和 card/deck 关系。缺少能力时回退到原始全局配置或只读“待制卡”，并记录可诊断原因。插件卸载必须恢复原始 descriptor/拦截器。

动态列表在预加载阶段执行 SQL 候选查询、向上解析根块、与 Riff 到期卡取交集并批量读取 renderer，之后仍交给原生面板。每轮使用当轮 SQL 候选集；评分后下一轮重新执行 SQL，失败则停止而不是扩大范围。

## Group configuration contract

每个 SQL 分组至少包含以下可迁移字段：

```text
groupId
name
categoryId
sqlQuery
enabled
queryFirst
cachePolicy
priorityPolicy
```

分组设置必须支持新建、编辑、删除、启用/禁用、分类归档和安全重命名。缓存是派生数据，按分组保存候选根块、时间戳和查询版本；缓存过期、手动刷新或 `queryFirst` 时重新执行 SQL。SQL 失败不得用旧结果伪装为新成功，复习入口必须显示错误或明确使用仍有效的旧缓存。

## Automation contract

- **Postpone today cards**：可开关并配置天数，扫描整个牌组中当前日期创建且仍满足可推迟条件的卡；重复扫描幂等，部分失败逐卡报告。
- **Automatic priority scan**：按启用的分组和扫描间隔读取候选卡，只更新今日创建且优先级不同的卡；P1-P4 标签优先于任何运行时数值。
- **Batch priority**：用户选择分组后先 preview 受影响卡和目标优先级，再 confirm；不得把不可逆的运行时更新伪装成普通查询。

若当前 SiYuan/Riff 没有稳定优先级写入能力，DAMO 仍维护 P1-P4 标签并返回 `pending-runtime-priority`；不得依赖 Tomato 私有 API 才报告整个功能成功。

## Result viewing contract

每个分组提供两种结果查看：原始 SQL 结果，以及执行向上传递、卡根识别和去重后的过滤结果。过滤结果可以进入原生 `siyuan-card` 复习；原始结果只用于核验 SQL 和内容范围。文档流是可选外部打开器，未安装时 DAMO 的结果查看和复习能力仍必须可用。

SFP `plugin-config.json` 是一次性的可选迁移输入，不是 DAMO 运行时依赖。导入必须 preview/confirm；只迁移分类、SQL 分组和自动化配置，丢弃旧缓存，保留 Markdown 和 Riff 状态。

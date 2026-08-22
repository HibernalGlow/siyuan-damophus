# DAMO 闪卡子模块与可移植协议

Status: accepted on 2026-08-23.

## Context

Damophus 需要把 Markdown/ Kramdown 内容整理成可重复识别、可预览制卡并可在思源 Riff 中复习的闪卡。现有 Riff 负责调度、评分和复习历史；题库模块已经拥有稳定的考点关系和 TinyBase 目录。将闪卡逻辑散落在题库或 UI 中，会让内容身份、Riff 运行时状态和宿主渲染配置互相耦合。

SiYuan 3.8.1 及之后的原生复习面板仍使用全局 `window.siyuan.config.flashcard`。因此按卡片修改设置不能通过复制一个新的复习面板实现，也不能反复持久化覆盖用户设置。预加载阶段必须能根据当前卡片属性选择原生配置；能力不存在或版本不匹配时必须保持原生行为。

## Decision

### Ownership and modules

- 闪卡作为 DAMO 的独立子模块，推荐可移植核心位于 `src/flashcard/`，宿主生命周期位于 `src/lets-flashcard/`，通过 `PluginRegistry` 注入 `SubPluginBase` 依赖。
- Markdown/Kramdown + IAL 是卡片内容、稳定业务身份、卡型语义、渲染器声明、优先级标签和考点关系的事实来源。
- Riff 适配器只负责当前 SiYuan 版本的登记、查询、调度、评分和复习历史。Riff card ID、块 ID、数据库行 ID 都不是外部业务身份。
- 题库、主题关系和 UI 只能通过闪卡协议消费卡片，不复制卡片解析或 Riff 状态逻辑。
- Specialized-Flashcard-Plugin（SFP）是第一阶段的功能基线。DAMO 迁移其全部用户可见能力：SQL 分组复习、分类管理、缓存和查询优先、到期卡入口、向上传递识别、自动推迟、自动优先级扫描、批量优先级、原始/过滤后结果查看和文档流入口；迁移后由 DAMO 自己维护生命周期、存储、适配器和 UI。

### Card identity and containers

- 一张卡必须由一个明确的容器根块界定范围。首版默认支持所有当前可行的 `mark`、`list`、`heading`、`superBlock`、`blockquote` 和 `callout` 容器；标题可以作为根块。
- 标签、行级 IAL、普通 `==高亮==` 不能单独定义卡片范围。`mark` 只有在显式声明卡片语义时才作为挖空卡；普通阅读高亮不进入队列。
- `custom-dm-card-id` 是可移植卡片业务身份。未来的多变体使用稳定父 ID 加确定性 `variant key`，但在当前 SiYuan 模型下一个根块只登记一张 Riff 卡。
- 已登记卡片必须幂等；重新扫描不得覆盖已有调度状态，也不得为相同身份重复登记。

### One-click card creation

制卡是显式的两阶段写操作：

1. 结构化 Markdown 解析器生成问题、答案、卡型、渲染器、考点、优先级、来源和预计卡量的 preview。
2. 用户确认后调用能力检测通过的 Riff 登记 API（当前版本通常为 `/api/riff/addRiffCards`），再用查询 API（例如 `/api/riff/getRiffCardsByBlockIDs`）验证登记结果。

API 缺失、版本不匹配、响应结构无效或部分登记失败时，结果为“待制卡/未注册”，不得把 `custom-riff-decks` 的写入当作成功。冲突和 orphan 只报告并停止对应写入，不自动创建第二套来源。

### Native review rendering

- 复习使用 SiYuan 原生 `siyuan-card` 面板；DAMO 不实现第三套复习 UI，也不复制整套面板。
- DAMO 只提供窄范围的预渲染兼容层：在原生卡片加载/渲染前读取当前卡片的 `custom-dm-card-renderer`，选择 mark/list/heading/superBlock/blockquote/callout 对应的宿主配置，再交还原生渲染流程。
- 兼容层必须先做 capability detection，保存原始 `flashcard` 属性描述符和用户配置；不调用持久化设置 API 反复修改全局设置，不替换整个 `window.siyuan.config`，卸载时完整恢复 descriptor/拦截器。
- 卡片无法解析、没有 DAMO renderer 或预渲染拦截不可用时，使用用户原始全局配置。预渲染拦截和动态队列在实现前不得视为已交付能力。

### Dynamic review lists

动态闪卡列表与普通卡片共用预加载管线：SQL 查询候选块，向上解析显式闪卡根块，与 Riff 到期卡取交集，批量读取 renderer，然后交给原生 `siyuan-card` 面板。当前复习轮固定候选集合；一轮结束后重新执行 SQL。SQL 失败时停止下一轮并报告错误，不退回全部到期卡。

SFP 的向上传递规则也属于迁移基线：SQL 命中任意子块时向父链查找最近的卡片根，并对根块去重。原生可制卡的 list、heading、superBlock、blockquote、callout 容器本身可以作为根；mark 仍要求显式 cloze 元数据。安全深度上限和循环检测由 DAMO 配置，不能因查不到根块而把普通块当作卡片。

### SFP feature parity

SFP 的功能按下表迁移为 DAMO 原生能力，而不是继续调用旧插件：

| SFP capability | DAMO implementation boundary |
| --- | --- |
| SQL 分组、分组启用/禁用、分类、新增/编辑/删除 | `flashcard` 配置仓库和 DAMO 设置子页面 |
| 缓存、缓存有效期、查询优先和手动刷新 | 可重建的 DAMO 派生索引；不把缓存当内容事实 |
| 到期：所有闪卡、分组专项复习 | Riff adapter 取到期卡后交给原生 `siyuan-card` |
| 任意 SQL 聚合（标签、文档、反链、数据库、格式条件） | `/api/query/sql` + 结构化根块解析；SQL 文本保持用户可编辑 |
| 自动推迟今日新卡 | DAMO 定时任务 + capability-detected Riff due 写入；失败显式报告 |
| 自动优先级扫描、批量优先级 | DAMO 优先级策略；P1-P4 标签是事实源，运行时数值只是可重建投影 |
| 原始 SQL 结果、向上传递后的过滤结果 | DAMO 自有结果查看入口；文档流插件为可选外部打开器 |

迁移的验收标准是功能等价，不是代码逐行复制：原插件的设置、缓存、菜单和第三方调用都必须经过 DAMO 的 `SubPluginBase` 生命周期、日志、国际化和失败回退规则重建。

### Metadata and state

协议字段见 [Flashcard Contract](../flashcard-contract.md)。`custom-riff-decks` 仅是当前适配结果；due、interval、review log、suspend、bury 和其他运行时调度状态只归 Riff 所有，不写入外部 Markdown。知识分类标签（`#法考/...#`）、闪卡优先级标签（`#闪卡/优先级/P1#` 至 `P4`）和 topic ID 命名空间互相独立。

### Compatibility boundary

- 支持边界从 SiYuan 3.8.1 开始，不承诺 3.7.1 及更早版本。
- 适配器以 V1/V2 capability profile 隔离可能变化的 Riff API、卡片与牌组关系和预渲染入口；未知版本回退到只读识别和原生复习，不猜测未来字段。
- 未来 SiYuan 的多牌组共享历史、动态牌组、调度预设或旧数据迁移只影响 Riff adapter，不改变 Markdown 身份、考点关系和标签语义。

## Alternatives considered

- **复制整个复习面板**：拒绝。会产生第三条复习渲染路径，重复评分、移动端适配和升级维护。
- **渲染后再隐藏答案范围**：拒绝。答案边界应在卡片预加载时确定，避免闪烁和与原生答案提取逻辑分叉。
- **只粘贴 `custom-riff-decks`**：拒绝。无法证明登记成功，也不能处理幂等、版本降级和历史卡片。
- **继续安装 Specialized-Flashcard-Plugin**：拒绝作为最终方案。它的功能全部迁移到 DAMO，但旧插件本身不作为运行依赖，避免双重菜单、重复缓存和版本漂移。
- **继续调用 Tomato 或文档流私有 API**：拒绝作为核心依赖。优先级和结果查看必须有 DAMO 原生实现；检测到可选外部 API 时只能作为 adapter 加速路径，不能把依赖缺失报告为成功。
- **把块 ID 写进 Markdown**：拒绝。块重建、导入和同步会破坏业务身份；块 ID 只能存在于可重建的适配器索引或迁移 manifest。

## Consequences

正面结果是内容可以脱离当前 Riff 实现复用，复习仍由原生面板承担，旧卡历史可以保留，动态列表和静态卡片共享同一条预加载边界。代价是需要维护结构化解析、Riff capability detection、预渲染拦截的浏览器证据，以及旧卡/来源冲突的显式迁移报告。

协议和 SFP 功能边界已落到 DAMO 子模块；真实嵌入浏览器验证仍是发布前必需证据，不得以文档或类型检查替代。

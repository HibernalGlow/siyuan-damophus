# Specialized Flashcard Plugin 迁移记录

基线固定为 `PearlLin2000/Specialized-Flashcard-Plugin@aa3bb02c8ed68164ddda53b87daa391822a1b7be`。DAMO 迁移的是用户能力和行为，不复制独立插件壳，也不要求继续安装 SFP、Tomato 或文档流。

| SFP 文件/能力 | DAMO 对应实现 | 迁移说明 |
| --- | --- | --- |
| `DataManager.ts` | `src/flashcard/runtime.ts` | 配置、分类、分组、缓存、query-first、失效和预加载；缓存是可重建派生数据 |
| `GroupActionService.ts` | `src/lets-flashcard/index.ts` + `runtime.ts` | 分组复习、原始 SQL、过滤后 IdList、批量优先级；批量写入增加 preview/confirm |
| `AutomationService.ts` | `FlashcardRuntime.postponeTodayCards/scanPriorities` | 今日新卡推迟扫描整个牌组；优先级按启用分组扫描今日卡；原生 Riff 优先，Tomato 仅可选加速 |
| `TimerService.ts` | `FlashcardRuntime.startAutomation/stopAutomation` | 定时器可重启、卸载清理，并在启动时立即执行一次预加载/自动化 |
| `MenuService.ts` | DAMO 子插件菜单、命令和设置 Tab | 全部到期卡、启用分组入口、设置入口均复用原生 `siyuan-card` |
| `apiSiyuanSQL.ts` | `FlashcardSiyuanAdapter.paginatedSql/loadBlocks` | SQL 分页、块读取、父链解析；保留任意可执行 SQL 聚合能力 |
| `apiSiyuanCard.ts` | `FlashcardSiyuanAdapter` | 到期查询、按块查询、登记后验证、评分、推迟、全量牌组查询、牌组重置/移除 |
| `OpensydocFlow.ts` | `src/flashcard/document-flow.ts` | 原始 SQL 与过滤 IdList 为可选外部入口；未安装文档流时 DAMO Dialog 和复习仍可用 |
| `GroupManager.svelte` | `FlashcardSettings.svelte` + `FlashcardResults.svelte` | 分类 CRUD、分组启用/禁用、排序、SQL 编辑、缓存/自动化、结果核验和登记 |

## 动态列表生命周期

分组入口先执行 SQL 分页和向上传递识别，再取 Riff 到期卡交集并打开原生 `siyuan-card`。DAMO 主插件实现原生 `updateCards` 分发，分组复习在每个原生复习轮次重新执行 SQL 并过滤新到期结果；因此评分后切换下一张仍保持动态分组边界。卡片 renderer 在同一预加载阶段读取并写入兼容层缓存，原生面板本身不被复制。

SQL 结果如果直接命中原生可制卡容器（list、heading、superBlock、blockquote、callout），DAMO 将其作为一键登记候选；命中容器子块时沿父链解析最近根块。旧的 `custom-riff-decks` 卡片仍优先保留旧 renderer，普通段落中的高亮不会被推断为 mark 卡。

## 明确不照搬的部分

- SFP 的独立插件生命周期、独立存储文件名和菜单壳不进入 DAMO。
- Tomato 的私有优先级/停止 API 不作为核心依赖；能力缺失返回 `pending`。
- 文档流仅是外部查看器；DAMO 自己提供原始/过滤结果 Dialog。
- SFP 的旧块 ID、Riff card ID 和运行时调度字段不进入 DAMO Markdown 身份协议。

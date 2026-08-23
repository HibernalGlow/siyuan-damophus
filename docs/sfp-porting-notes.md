# Specialized Flashcard Plugin 迁移记录

基线固定为 `PearlLin2000/Specialized-Flashcard-Plugin@aa3bb02c8ed68164ddda53b87daa391822a1b7be`。DAMO 迁移的是用户能力和行为，不复制独立插件壳，也不要求继续安装 SFP、Tomato 或文档流。

| SFP 文件/能力 | DAMO 对应实现 | 迁移说明 |
| --- | --- | --- |
| `DataManager.ts` | `src/flashcard/runtime.ts` | 配置、分类、分组、缓存、query-first、失效和预加载；缓存是可重建派生数据 |
| `GroupActionService.ts` | `src/lets-flashcard/index.ts` + `runtime.ts` | 分组复习、原始 SQL、过滤后 IdList、批量优先级；批量写入增加 preview/confirm |
| `AutomationService.ts` | `FlashcardRuntime.postponeTodayCards` | 保留今日新卡推迟；移除按分组自动统一优先级，优先级由 Markdown P1-P4 标签决定 |
| `TimerService.ts` | `FlashcardRuntime.startAutomation/stopAutomation` | 定时器可重启、卸载清理，并在启动时立即执行一次预加载/自动化 |
| `MenuService.ts` | DAMO 子插件菜单、命令和设置 Tab | 全部到期卡、启用分组入口、设置入口均复用原生 `siyuan-card` |
| `apiSiyuanSQL.ts` | `FlashcardSiyuanAdapter.paginatedSql/loadBlocks` | SQL 分页、块读取、父链解析；保留任意可执行 SQL 聚合能力 |
| `apiSiyuanCard.ts` | `FlashcardSiyuanAdapter` | 到期查询、按块查询、登记后验证、评分、推迟、全量牌组查询、牌组重置/移除 |
| `OpensydocFlow.ts` | `src/flashcard/document-flow.ts` | 原始 SQL 与过滤 IdList 为可选外部入口；未安装文档流时 DAMO Dialog 和复习仍可用 |
| `GroupManager.svelte` | `FlashcardSettings.svelte` + `FlashcardResults.svelte` | 分类 CRUD、分组启用/禁用、排序、SQL 编辑、缓存/自动化、结果核验和登记 |
| `plugin-config.json` | `src/flashcard/sfp-migration.ts` + 设置页“导入 SFP 设置” | 显式 preview/confirm 导入分类、SQL 分组、查询优先、缓存间隔和自动化设置 |

## 动态列表生命周期

分组入口先执行 SQL 分页和向上传递识别，再取 Riff 到期卡交集并打开原生 `siyuan-card`。DAMO 主插件实现原生 `updateCards` 分发，分组复习在每个原生复习轮次重新执行 SQL 并过滤新到期结果；因此评分后切换下一张仍保持动态分组边界。卡片 renderer 在同一预加载阶段读取并写入兼容层缓存，原生面板本身不被复制。

SQL 结果如果直接命中原生可制卡容器（list、heading、superBlock、blockquote、callout），DAMO 将其作为一键登记候选；命中容器子块时沿父链解析最近根块。旧的 `custom-riff-decks` 卡片仍优先保留旧 renderer，普通段落中的高亮不会被推断为 mark 卡。

## 明确不照搬的部分

- SFP 的独立插件生命周期、独立存储文件名和菜单壳不进入 DAMO。
- Tomato 的私有 API 不再调用；Riff 官方优先级 API 不可用时保留 Markdown 标签并返回 `pending`。
- 文档流仅是外部查看器；DAMO 自己提供原始/过滤结果 Dialog。
- SFP 的旧块 ID、Riff card ID 和运行时调度字段不进入 DAMO Markdown 身份协议。

## 配置迁移边界

DAMO 以 `Specialized-Flashcard-Plugin@aa3bb02c8ed68164ddda53b87daa391822a1b7be` 的 `plugin-config.json` 作为可选导入来源。导入会转换 `groupCategories`、`groups`、`queryFirst`、优先级和全局自动化字段；SFP 的 `cache-data.json` 不导入，因为缓存只保存 SQL 派生块 ID，首次查询即可重建。导入必须先显示分类数、分组数和启用数并由用户确认，不删除 SFP 文件、不修改 Markdown、不触碰 Riff 复习历史。

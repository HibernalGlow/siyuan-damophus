# 题单练习（考点数据库 relation 解析）实施计划

## 定案（与用户确认过）

用户在自己的笔记里维护「考点数据库」（如 Point·LPQE，行绑定笔记标题，另有 relation 字段指向一个用户自建的题目/小专题数据库，目标行的绑定块可以是含多题的小专题标题、单个题目块或整份文档）。插件新增「题单」：启动练习时读考点库（可按数据库视图筛选行）→ 沿 relation 字段找到目标库行 → 取绑定块 ID → 在题库 catalog 收敛为题目 ID 集合 → 并集后叠加现有作答状态条件（错题二刷那套）→ 开练。**不做**资源字段(mAsset)链接解析模式；不碰 Question Index；不改扫描索引系统。

## 数据流

```
题单配置 {pointAvId, viewId?, relationKeyIds[], includeSubdocuments}
 → /api/av/renderAttributeView(avId, viewID, 大 pageSize)   // 有视图: 内核应用保存筛选, 返回行 itemID
   (无视图: getAttributeView 全量行)
 → 读考点库 relation cell 的 blockIDs（= 目标库行 itemID；relation.avID 从 key 上取，目标库无需配置）
 → 读目标库主键 cell value.block.id → 目标绑定块 ID
 → 收敛（以 TinyBase catalog + hydrate 扫描缓存为准）：
     目录条目 blockId 命中        → 单题
     topic_anchors 表命中(标题块)  → hydrate 该文档 → TopicNode 森林 → descendantTopicIds → 子树题目
     文档根块                      → 该 documentId 全部目录条目（含子文档开关 → listDocumentTreeRows 扩展）
     其他                          → 未解析，计数报告
 → 去重 → controller.hydrateQuestionSources(ids) → state.assembledQuestions → beginNewPractice
```

会话持久化零改动：`source_key` 存 `playlist:{id}`（沿用组卷的跨源 sourceKey 约定，`openStoredSession` 已有非文档来源恢复分支）。

## 文件改动

**新增 `src/lets-question-bank/practice/playlist/`（模块化，每文件<1000行）**
1. `playlist-schema.ts` — zod schema + 归一化：`{id, name, pointAvId, viewId?, relationKeyIds[], includeSubdocuments}`。
2. `playlist-repository.ts` — 插件设置键 `practicePlaylists` 的 CRUD（照搬 `question-set-host.ts` 的 zod safeParse + list/save/remove 模式），跨设备随设置文档同步。
3. `playlist-resolve.ts` — 解析器：内核 av 读取（relation cell 读法仿 `topic-index.ts`/`av-column-binding.ts` 先例；行→绑定块用 `row-identity` 的 `sourceBlockIdByItemId` 模式；视图行收集兼容 table rows / gallery/kanban cards / groups 分组；pageSize 传大值防默认 50 截断，按 rowCount 兜底分页）+ 纯函数收敛（输入目录条目、anchors 索引、按文档的森林缓存），输出 `{questionIds, rows:[{rowId,title,count}], unresolved:[{blockId,reason}]}`。
4. `playlist-actions.ts` — 与 `source/question-set-actions.ts` 平级：resolve→写 `state.assembledQuestions/assembledSourceKey`→复用 `onFrozenSetAssembled` 通道开练；条件叠加走 `createPracticeQueue`（与文档路径同一 `filterQuestions`，聚合数据与启动器统计同源）。
5. `PracticePlaylistManager.svelte` — 题单管理对话框（壳仿 QuestionBookmarkModal，命名 CRUD 数据流仿 QuestionSetComposer）：选题单库（`/api/av/searchAttributeView` 搜索选择）、多选 relation 字段（读该库 relation 类型 keys）、可选视图（该库 views 列表）、含子文档开关、解析预览（每行题数 + 未解析提示 +「重新解析」）。

**修改**
6. `src/question-bank/core/scope.ts` — 导出 `descendantTopicIds`（一行）。
7. `src/lets-question-bank/controller.ts` — 透出 `listPlaylists/savePlaylist/deletePlaylist/resolvePlaylist`（仿 loadQuestionCatalog 样板）。
8. `src/lets-question-bank/practice/PracticeLauncher.svelte` — 在条件 chips 区旁加「题单」chips（选中态=待用题单，chip 上显示解析题数；管理入口按钮）。选中题单时范围树/条件照旧显示但注明「以题单为准」。
9. `src/lets-question-bank/practice/practice-session-actions.ts` — `practiceQueue`/`startPractice` 支持题单分支（优先级：assembled > 题单 > 文档扫描；题单模式下用解析出的题目集合跑 `createPracticeQueue` 应用当前筛选）。
10. `src/lets-question-bank/question-bank.svelte` + `QuestionBankView.svelte`/`workspace` — 状态接线（playlists、activePlaylistId、解析缓存）与 props 转发。
11. `src/translations/parts/lets-question-bank.ts` — en + zhCN 对称新增 key；新文件 fallback 用英文（ASCII 校验合规，不扩大历史债）。

**测试**
- 纯单测：`playlist-schema.test.ts`（归一化/迁移）、`playlist-resolve.test.ts`（四种收敛分支 + 去重 + 未解析报告，伪造 catalog/anchors/森林）、`playlist-repository.test.ts`。
- 内核级：扩展 `siyuan-adapter.fixtures.ts` 的 MockKernelClient（现有 renderAttributeView mock 只建空表，需支持灌入含 relation cell 与视图筛选响应）测 relation 读取与 itemID→绑定块映射。
- browser：`PracticePlaylistManager.browser.test.ts`（mount + label 注入，仿 PracticeConditionEditor 测试）；`question-bank.browser.fixtures.ts` 的 mockController 补 4 个 vi.fn。注意既有 browser 失败基线清单，勿误判为新问题。

## 验收与纪律

- `grep -rn '[^\x00-\x7F]'` 对新增文件零匹配；重启 dev 后 i18n 生效。
- 实机验证（用户工作区已有 Point·LPQE + relation 数据）：选视图筛选行 → 解析计数正确 → 开练/暂停/恢复（跨 sourceKey）→ 条件叠加生效。
- 变更集按规范写用户可感知收益（题单练习：把思源数据库里的考点清单变成练习范围），不出现技术词汇；只 add 本功能文件；改码→验证→changeset→commit 一次收尾。

## 明确不做（v1 范围外）

资源字段(mAsset)链接解析；未入库文档的自动扫描（只报告「该文档未入库」）；题单拖拽排序；从题目库反查考点；两个库的自动创建/托管（目标库完全由用户自建自管）。
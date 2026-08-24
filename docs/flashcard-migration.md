# Flashcard Migration Guide

Status: implementation baseline; runtime/browser evidence remains tracked separately.

本迁移只处理 DAMO 闪卡协议的识别、重新绑定和 Riff 登记，不迁移或重置用户的复习历史。所有批量动作都必须先 preview，再由用户 confirm。

## Existing cards

- 现有原生 mark 卡的根块尽量保留。新增 `custom-dm-card-renderer` 不得改变旧卡答案边界，也不得自动改写为 list/basic。
- 普通笔记中的 `==高亮==` 没有显式 `custom-dm-card-id` 时保持普通内容，不创建 Riff 卡。
- 已有 `custom-riff-decks` 只作为适配结果读取。重新扫描必须通过 Riff 查询确认真实卡片；查询不到时报告“待制卡/未注册”，不静默修复或删除历史。
- due、interval、评分历史、suspend、bury 等状态永远留在 Riff；Markdown 迁移不得写入这些字段。

## Source import and rebind

1. 结构化解析外部 Markdown，扫描 `custom-dm-source-key` 和卡片 IAL。
2. 没有匹配来源时生成创建 preview。
3. 只有一个 live 匹配时生成更新/重新绑定 preview。
4. 多个 live 匹配时停止，列出冲突来源和待用户选择的动作。
5. 原根块已删除时报告 orphan；不自动创建第二套来源，也不猜测新的业务身份。
6. 用户确认后写入允许的 IAL，调用 Riff 登记并用查询 API 验证，逐项返回结果。

provider topic ID 和 question topic ID 不保存思源块 ID。块移动、重建或跨设备同步后，Damophus 重新扫描 IAL 并更新可重建的当前块索引；真实双链、数据库和 JSON 只能作为展示或缓存。

## SFP configuration import

如果工作区仍安装过 `Specialized-Flashcard-Plugin`，设置页提供“导入 SFP 设置”。DAMO 从 `/data/storage/petal/Specialized-Flashcard-Plugin/plugin-config.json` 读取旧配置，先预览分类、分组和启用数量，再由用户确认。转换范围包括：

- `groupCategories` → `categories`
- `groups`、`categoryId`、`enabled`、`queryFirst`
- `postponeDays`、`postponeEnabled`、`scanInterval`、`cacheUpdateInterval`

旧配置中的 `priority`、`priorityEnabled`、`priorityScanEnabled` 和
`priorityScanInterval` 只作为兼容输入读取并丢弃，不会重新启用自动统一优先级。
优先级由 Markdown 的 `#闪卡/优先级/P1#` 至 `P4` 标签决定；批量调整时先选择标签，再预览并确认。

不导入 `cache-data.json`，因为它只含可重建的 SQL 结果；不删除旧插件文件，不写入 Markdown，不重置 Riff 历史。读取失败、JSON 无效或用户取消时保持 DAMO 当前设置不变。

## Review-log export compatibility

工作台的“复习记录”页只读扫描 `/data/storage/riff/logs/*.msgpack`。合并导出生成
`revlog.csv`，按月导出生成包含各 `YYYYMM.csv` 和合并文件的 ZIP。CSV 保持旧工具
使用的五列契约：`card_id`、`review_time`、`review_rating`、`review_state`、
`review_duration`；当前 Riff 日志不记录单次复习耗时，因此最后一列固定为 `0`。

这不是复习历史迁移：导出不会修改卡片、调度参数或日志。遇到未知字段结构、损坏
文件或读取失败时按文件显示错误并跳过，不生成看似成功的损坏数据。未来 Riff 格式
变化必须先扩展解码器和回归样例；不得根据文件名或版本号猜测新字段。

## Protocol/schema changes

### Schema 1 to Schema 2

Schema 1 的字段和 renderer 语义保持兼容。Schema 2 只能通过显式迁移预览增加字段或改变容器边界；不得静默重写正文。迁移 manifest 至少记录 source key、card ID、旧/新 renderer、旧/新根块、Riff 查询结果、冲突和用户确认时间。

未知 schema、缺少稳定 card ID、同一 ID 多个 live 根块或 renderer 与实际容器不一致时，迁移状态为 blocker，保持原文不变。

## Version and capability downgrade

目标最低版本为 SiYuan 3.8.1。启动时检测 `window.siyuan.config.flashcard`、可恢复属性描述符、原生 card loader/render hook 和 Riff API/响应结构：

- V1 能力完整：启用预渲染 renderer 选择和登记后验证。
- V2 能力可识别：由 adapter profile 映射新 API/牌组模型，Markdown 身份和 topic 关系不变。
- 能力缺失或版本未知：禁用对应写入，保留用户原始全局配置，显示待制卡/原生复习回退。

插件卸载必须恢复原始 descriptor 和拦截器。迁移失败可重试；不得通过持久化设置 API 反复改写用户全局闪卡配置。

## Rollback

回滚只撤销 DAMO 写入的 IAL、索引和新登记映射，并保留已经存在的 Riff 复习历史。删除卡片或清除调度状态必须是单独、明确、可预览的用户操作，不属于自动迁移。

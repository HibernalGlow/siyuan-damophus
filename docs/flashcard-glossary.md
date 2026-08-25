# DAMO 闪卡 Glossary

本文是 [ADR 0012](adr/0012-damophus-flashcard-protocol.md) 和
[Flashcard Contract](flashcard-contract.md) 的术语单一事实来源。术语描述协议
边界，不把思源块 ID、数据库行 ID 或 Riff card ID 提升为业务身份。

| Term | Definition | Owner / persistence |
| --- | --- | --- |
| Card container / 卡片容器 | 明确界定一张卡问题、答案和范围的根块；DAMO 默认识别 `mark`、`list`、`heading`、`superBlock`、`blockquote`、`callout`。 | Markdown/IAL；内容作者 |
| Card identity / 卡片身份 | `custom-dm-card-id` 表示可移植的业务身份；多变体使用稳定父 ID 加确定性 variant key。 | Markdown/IAL；不可用块 ID 替代 |
| Card kind / 卡型 | 卡片语义，如 `basic` 或 `cloze`；描述测试什么，不描述宿主如何承载。 | Markdown/IAL |
| Card renderer / 卡型渲染器 | `custom-dm-card-renderer` 描述当前宿主承载方式；与 card kind 分离，允许以后更换容器。 | Markdown/IAL |
| Riff adapter / Riff 适配器 | DAMO 与当前 SiYuan Riff API 之间的边界，负责登记、查询、到期、评分、推迟和优先级 capability detection。 | DAMO runtime；运行时可重建 |
| Source identity / 文档来源身份 | `custom-dm-source-key` 标识外部 Markdown/Kramdown 来源，用于 rebind、冲突和 orphan 报告。 | Markdown/IAL |
| Provider / 笔记 provider | 带 `custom-qb-note-topic-id` 的当前块，为稳定 topic ID 提供讲解材料；块 ID 变化后由 DAMO 重新扫描绑定。 | Markdown/IAL + 可重建索引 |
| Question topic relation / 考点关系 | `custom-qb-question-topic-ids` 表示卡片引用的一个或多个稳定考点 ID。 | Markdown/IAL |
| Runtime state / 运行时状态 | due、interval、review log、评分、suspend、bury 等调度数据，只属于 Riff，不写入外部 Markdown。 | SiYuan Riff |
| Compatibility layer / 兼容层 | 预渲染阶段读取当前卡片 renderer，临时选择 `window.siyuan.config.flashcard` 的原生配置；失败时保持原始全局配置，卸载时恢复 descriptor/interceptor。 | DAMO SiYuan adapter |
| Dynamic review list / 动态复习列表 | SFP 基线的 SQL 候选、向上传递到卡根、Riff 到期交集和 renderer 预加载流水线；评分后下一轮重新执行 SQL。 | DAMO runtime |
| Legacy card / 遗留卡片 | 已登记且拥有既有复习历史的卡；默认保留根块、答案边界和旧 renderer，不自动迁移身份或重置调度。 | DAMO migration policy |
| Unregistered card / 已取消登记卡 | 保留卡片 IAL 但带 `custom-dm-card-status="unregistered"` 的历史卡；不进入活动 SQL 分组或复习队列，重新登记时恢复状态。 | DAMO registration lifecycle |
| Pending registration / 待制卡 | Riff API 缺失、登记验证失败或版本 capability 不匹配时的明确状态；不得报告为成功。 | DAMO UI / adapter |
| SFP baseline / SFP 基线 | `PearlLin2000/Specialized-Flashcard-Plugin@aa3bb02c8ed68164ddda53b87daa391822a1b7be`；DAMO 迁移其用户可见动态汇总、分组、缓存、自动化和结果查看能力，不复制独立插件壳。 | Reference only |

## Namespaces

知识分类与闪卡运行属性分开：

```text
#法考/民法/债法/债的保全/债权人代位权/成立要件#
#闪卡/优先级/P1#
```

取消登记后的优先级标签使用 `#闪卡/已取消登记/优先级/P1#` 形式保留历史，但不属于活动优先级命名空间；重新登记时恢复为活动标签。

标签用于浏览和 SQL 筛选；topic ID 用于稳定语义关联；`custom-riff-decks`
只是当前 Riff 登记结果，不是内容来源或制卡成功的唯一依据。

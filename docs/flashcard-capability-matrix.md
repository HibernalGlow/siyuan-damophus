# Flashcard Capability Matrix

Status: implementation baseline; embedded-browser evidence is tracked as a release gate.

功能基线是 [Specialized-Flashcard-Plugin `aa3bb02c8ed68164ddda53b87daa391822a1b7be`](https://github.com/PearlLin2000/Specialized-Flashcard-Plugin/tree/aa3bb02c8ed68164ddda53b87daa391822a1b7be)。下表中的“迁移”表示 DAMO 必须提供等价用户能力；SFP、Tomato 和文档流不作为运行依赖。

“已查证”表示源码/API/参考项目已核对；“待实现”表示本仓库尚未交付；“回退”是明确的安全行为，不是静默成功。

| Capability | SiYuan 3.8.1+ target | DAMO contract | Current status | Fallback/limit |
| --- | --- | --- | --- | --- |
| `mark` container | Supported | Explicit cloze only | 已实现 | 普通高亮不入队；目标版本浏览器验证待补 |
| `list` container | Supported | Default basic renderer | 已实现 | 需显式根块 IAL |
| `heading` container | Supported by parser target | Native root or explicit IAL | 已实现 | 不按相邻标题猜范围 |
| `superBlock` container | Supported by parser target | Native root or explicit IAL | 已实现 | 范围限于超级块子树 |
| `blockquote` container | Native config capability | Native root or explicit IAL | 已实现 | 依赖目标版本字段能力检测 |
| `callout` container | Native config capability | Native root or explicit IAL | 已实现 | 依赖目标版本字段能力检测 |
| Portable card identity | IAL | `custom-dm-card-id` | 协议已定 | 缺失则 preview blocker |
| Source identity | IAL | `custom-dm-source-key` | 协议已定 | 多匹配停止 |
| Topic provider relation | IAL + dynamic lookup | `custom-qb-note-topic-id` | 已有题库关系基础 | 块 ID 只在索引中缓存 |
| Question topic relation | IAL | `custom-qb-question-topic-ids` | 已有题库字段 | 不能以双链替代 |
| Priority | Markdown tag | `#闪卡/优先级/P1-P4#` | 协议已定 | 不猜 Riff 私有字段 |
| Idempotent registration | Riff API | add then query verify | 已实现 | pending/unregistered |
| Native review panel | `siyuan-card` | Reuse native path | 设计已定 | 不复制面板 |
| Pre-render renderer selection | Global flashcard config | Capability-detected interceptor | 已实现 | original global config |
| Dynamic review list | SQL + Riff due cards | Preload intersection pipeline | 已实现 | SQL failure stops next round |
| Legacy mark cards | Existing Riff card | Preserve root and history | 迁移规则已定 | no automatic rewrite |
| Mobile review | Native panel | Same adapter contract | 待验证 | report unsupported capability |
| Unload recovery | Descriptor/interceptor | Restore exact original | 已实现 | plugin must fail closed |
| Future Riff/card-deck changes | Adapter boundary | V1/V2 profiles | 设计已定 | read-only/native fallback |

## SFP parity backlog

| SFP feature | Required DAMO parity | Design status | Verification |
| --- | --- | --- | --- |
| SQL 分组复习 | 任意 SQL 生成候选，再向上传递到卡根并与到期卡取交集 | 已定 | 标签、文档、反链、数据库、格式条件样例 |
| 分组/分类管理 | CRUD、启用/禁用、拖拽或顺序保持、配置持久化 | 已实现 | DAMO 设置页支持分类 CRUD、分组排序、启用/禁用和重启恢复 |
| 缓存与查询优先 | 可配置缓存期限、query-first、手动刷新和失效清理 | 已实现 | 启动/定时预加载、缓存命中/过期、query-first、SQL 失败显式报告 |
| 到期卡入口 | 全部到期与指定分组到期入口，限制首轮候选量 | 已定 | 原生 `siyuan-card` 数据契约 |
| 向上传递识别 | 任意子块命中时解析最近显式卡根、去重、循环/深度保护 | 已定 | list/superBlock/heading 混合树 |
| 自动推迟今日新卡 | 可开关、天数配置、只处理今日创建且可推迟卡 | 已实现 | 原生 due 写入；不可用时返回 pending 并记录原因 |
| 自动优先级扫描 | 按启用分组和扫描间隔批量同步优先级 | 已实现 | 立即执行 + 定时执行；优先级 API capability fallback |
| 批量优先级调整 | 对当前 SQL 分组全部匹配卡执行 preview/confirm 后调整 | 已实现 | 设置页按钮先显示卡量与目标值，再确认写入 |
| 原始 SQL 结果查看 | 显示不做卡片过滤的原始块结果 | 已实现 | DAMO Dialog 显示原始 SQL 行 |
| 过滤后结果查看 | 显示向上传递、识别、去重后的卡根结果 | 已实现 | DAMO Dialog 显示卡根并可登记/复习 |
| 文档流入口 | 可选调用文档流；DAMO 自有查看路径不依赖插件 | 已实现 | 原始 SQL、过滤后 IdList 均可选打开 |
| 设置/菜单/生命周期 | DAMO 子插件注册、i18n、logger、unload 清理 | 已实现 | PluginRegistry、设置/命令/菜单和卸载清理 |
| SFP 配置导入 | 从旧插件 `plugin-config.json` 导入分类、SQL 分组和自动化设置 | 已实现 | 设置页显式 preview/confirm；缓存丢弃并重建 |

SFP 的固定实现事实、依赖和许可证见 [Reference Sources](reference-sources.md)。

## Evidence required before implementation is called complete

- Portable core tests cover container parsing, identity, renderer policy, dedupe, source rebind and conflict/orphan outcomes.
- Fake Riff adapter covers API success, API failure, duplicate registration, query mismatch, old cards and version downgrade.
- Embedded-browser evidence is the remaining release gate for old mark, new list, heading, superBlock, blockquote, callout, mixed documents, rating-to-next-card, dynamic list, mobile review and plugin unload; the current workspace has not yet recorded that live run.
- SFP parity evidence must also cover importing a real `plugin-config.json` and confirming that the converted groups survive reload without importing the old cache.
- No claim of completion may rely on typecheck alone; repository check, build, focused tests and diff inspection are required.

## Verification log (2026-08-23)

- `pnpm build` passed; focused flashcard suite passed: 4 files, 8 tests.
- `git diff --check` passed. Latest `dist/index.js` was deployed to
  `D:/1STUDY/SIYUAN/data/plugins/siyuan-damophus` and the two files have the
  same SHA-256.
- Local SiYuan API responded successfully to `/api/query/sql` (562,427 blocks),
  `/api/riff/getRiffDueCards` and attribute queries; the workspace contains
  existing `custom-riff-decks` cards and the SFP config file contains one
  category and two enabled SQL groups.
- The running local binary reports SiYuan 3.7.3, below DAMO's supported 3.8.1+
  boundary. The embedded-browser tab reached `http://localhost:6806/` but its
  page-load, DOM, and screenshot calls timed out, so old mark/list, all
  renderer variants, rating-to-next-card, mobile review and unload recovery
  remain explicitly unverified release-gate items rather than passing claims.

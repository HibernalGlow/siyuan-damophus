# Flashcard Capability Matrix

Status: design baseline, not runtime evidence.

“已查证”表示源码/API/参考项目已核对；“待实现”表示本仓库尚未交付；“回退”是明确的安全行为，不是静默成功。

| Capability | SiYuan 3.8.1+ target | DAMO contract | Current status | Fallback/limit |
| --- | --- | --- | --- | --- |
| `mark` container | Supported | Explicit cloze only | 待实现 | 普通高亮不入队 |
| `list` container | Supported | Default basic renderer | 待实现 | 需显式根块 IAL |
| `heading` container | Supported by parser target | Supported renderer | 待实现 | 不按相邻标题猜范围 |
| `superBlock` container | Supported by parser target | Supported renderer | 待实现 | 范围限于超级块子树 |
| `blockquote` container | Native config added by 3.8.1 | Supported renderer | 待实现 | 使用原始全局配置 |
| `callout` container | Native config added by 3.8.1 | Supported renderer | 待实现 | 使用原始全局配置 |
| Portable card identity | IAL | `custom-dm-card-id` | 协议已定 | 缺失则 preview blocker |
| Source identity | IAL | `custom-dm-source-key` | 协议已定 | 多匹配停止 |
| Topic provider relation | IAL + dynamic lookup | `custom-qb-note-topic-id` | 已有题库关系基础 | 块 ID 只在索引中缓存 |
| Question topic relation | IAL | `custom-qb-question-topic-ids` | 已有题库字段 | 不能以双链替代 |
| Priority | Markdown tag | `#闪卡/优先级/P1-P4#` | 协议已定 | 不猜 Riff 私有字段 |
| Idempotent registration | Riff API | add then query verify | 待实现 | pending/unregistered |
| Native review panel | `siyuan-card` | Reuse native path | 设计已定 | 不复制面板 |
| Pre-render renderer selection | Global flashcard config | Capability-detected interceptor | 待实现 | original global config |
| Dynamic review list | SQL + Riff due cards | Preload intersection pipeline | 待实现 | SQL failure stops next round |
| Legacy mark cards | Existing Riff card | Preserve root and history | 迁移规则已定 | no automatic rewrite |
| Mobile review | Native panel | Same adapter contract | 待验证 | report unsupported capability |
| Unload recovery | Descriptor/interceptor | Restore exact original | 待实现 | plugin must fail closed |
| Future Riff/card-deck changes | Adapter boundary | V1/V2 profiles | 设计已定 | read-only/native fallback |

## Evidence required before implementation is called complete

- Portable core tests cover container parsing, identity, renderer policy, dedupe, source rebind and conflict/orphan outcomes.
- Fake Riff adapter covers API success, API failure, duplicate registration, query mismatch, old cards and version downgrade.
- Embedded-browser evidence covers old mark, new list, heading, superBlock, blockquote, callout, mixed documents, rating-to-next-card, dynamic list, mobile review and plugin unload.
- No claim of completion may rely on typecheck alone; repository check, build, focused tests and diff inspection are required.

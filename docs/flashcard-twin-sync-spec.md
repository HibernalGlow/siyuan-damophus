# 孪生卡跨副本进度同步

同一张业务卡片（`custom-dm-card-id` 相同）在多个笔记、多个阶段各存一份副本时，让它们的复习进度保持一致：背过其中任意一份，其余副本不再重复催办。

典型场景：`02-背诵卷/行政法/30-闪卡` 与 `04-考前聚焦/行政法/2026-李佳/30-闪卡` 里存在同一知识点的两张卡。

## 目标与非目标

目标：

- 一个 `custom-dm-card-id` 分组内的所有卡片共享同一个"下次复习时间"。
- 同步对**未制卡、已删除、被改 ID、被移动**的副本保持健壮，不报错、不丢数据。
- 无论用户走 Damophus 复习界面还是思源原生复习界面，同步都生效。

非目标：

- 不合并 FSRS 内部参数（stability / difficulty / reps / lapses）。各副本独立演进，只对齐 `due`。
- 不复制复习历史。新副本创建时只对齐 `due`，不伪造 rating 记录。
- 不接管思源原生闪卡界面（承接 ADR 0003 的边界）。

## 事实依据

以下结论来自 `vendor/siyuan/kernel` 源码，不是推测：

| 事实 | 位置 |
| --- | --- |
| 闪卡进度绑定在**块 ID** 上，与 `custom-dm-card-id` 无关 | `model/import.go:777` → `deck.AddCard(ast.NewNodeID(), blockIDs[card.BlockID()])` |
| 卡片身份 = 卡包内自动生成的 ID（`ast.NewNodeID()`），查询按 BlockID | `model/flashcard.go:179` `deck.GetCardsByBlockIDs` |
| 只有一个内置卡包 `20230218211946-2kw8jgx` | `model/flashcard.go:1197` |
| 一个块只能属于一个卡包（`custom-riff-decks` 是单值块属性） | `model/flashcard.go:1428` |
| `ReviewFlashcard` **不校验 due**，直接 `deck.Review(cardID, rating)`，且带 `reviewCardCache` 支持撤销 | `model/flashcard.go:640` |
| `batchSetRiffCardsDueTime` 可写 `due`，格式必须是 **14 位 `YYYYMMDDHHmmss`** | `model/flashcard.go:234` `time.ParseInLocation("20060102150405", ...)` |

推论：**保持 `custom-dm-card-id` 相同不会自动同步；改掉它也不会丢失任何进度。** 同步必须由插件显式完成。

## 决策

**采用对账式 due 对齐，不采用 rating 广播。**

备选方案是在复习时用同一 rating 对孪生卡补调一次 `/api/riff/reviewRiffCard`（内核会跑完整 FSRS）。该方案能让 FSRS 参数一并趋同，但被否决，原因：

1. rating 只在复习发生的一瞬可得，必须在复习流程内拦截 → 走思源原生界面时拿不到，覆盖不全。
2. 副本的复习次数不同（新副本 reps=0，老副本 reps=10）时，同样一次 rating 产生的参数差异极大，趋同是假象。
3. 需要区分"用户发起的复习"与"同步引发的复习"，否则级联循环。

对账式方案不依赖 rating，改为**读取组内所有成员的 `due`，取最大值，写回其余成员**。它是收敛操作，天然幂等、天然支持 N 副本、天然覆盖原生界面。

代价：FSRS 参数不共享。但每次复习后都会重新对齐 `due`，漂移被持续纠正，对体感无影响。

承接 ADR 0011 的哲学：**稳定 ID 而非块位置决定身份**。副本被移动到任何文档、任何笔记本，只要块 ID 与 `custom-dm-card-id` 不变，同步继续生效。

## 身份与分组

分组键 = 块 IAL 上的 `custom-dm-card-id`，不是块 ID、不是路径、不是文档。

索引构建（复用 `src/question-bank/adapters/siyuan/topic-dictionary.ts:50-63` 的按属性名 JOIN 扫描写法）：

```sql
SELECT a.block_id, a.value AS card_id
FROM attributes a
WHERE a.name = 'custom-dm-card-id' AND a.value <> ''
```

`src/flashcard/types.ts:316` 已经在吐 `cardId` 字段，分组逻辑可直接复用。

索引是**每次对账时重建的瞬时视图**，不做增量维护 —— 这样"删除、改 ID、移动"不需要任何特殊处理，重建时自然正确。

## 同步语义

对一个分组 `{B1, B2, ... Bn}`：

1. 用 `/api/riff/getRiffCardsByBlockIDs` 取回组内成员对应的卡片。
2. 未出现在结果中的成员 = 尚未制卡，跳过（它不在复习队列里，本来就不会催办）。
3. 取组内 `due` 的最大值 `D`（最大值 = 最近被复习过的那份）。
4. 把 `due != D` 的成员通过 `/api/riff/batchSetRiffCardsDueTime` 设为 `D`。

触发时机：

- 手动：复习工作台提供"同步孪生卡"入口。
- 自动：复习会话结束时；文档打开且距上次对账超过阈值时。
- 不做每次答题后实时同步（承接 ADR 0011：投影刷新从不发生在每次作答之后）。

## 边界情况

| 情况 | 检测方式 | 行为 |
| --- | --- | --- |
| 副本尚未制卡 | `getRiffCardsByBlockIDs` 无对应记录 | 跳过。它不在队列里，不催办；下次对账时若已制卡会自动拉齐 |
| 制卡失败（`addAndVerify` 返回 `pending`） | 注册结果状态位 | 同"尚未制卡"，等待下次对账 |
| 副本块被删除 | 索引重建时查不到该 block_id | 自动脱离分组，其余成员不受影响 |
| `custom-dm-card-id` 被删除或改写 | 索引重建后键变化 | 降级为独立卡片，独立进度。不报错 |
| 卡片正文被改写但 ID 保留 | 分组不变 | 继续同步（这是期望行为） |
| 副本被移动到别的文档 / 笔记本 | 块 ID 不变 | 同步不受影响（ID 驱动，非路径驱动） |
| 副本被注销（`custom-dm-card-status=unregistered`） | 块 IAL | 跳过，不重新激活 |
| 三份及以上副本 | 分组 size ≥ 3 | 一并拉齐到组内最大 due |
| 两份副本被分别复习（冲突） | 两侧 `due` 都晚于上次对账值 | 取最大 due，不尝试合并 FSRS 参数 |
| 用户撤销复习 | 内核 `reviewCardCache` 只作用于单卡 | 不自动撤销孪生卡；靠下次对账拉齐收敛 |
| 同组两张卡同属一个卡包 | 天然满足（只有一个内置卡包） | 无冲突 |

## 实现任务

| # | 任务 | 位置 |
| --- | --- | --- |
| 1 | **修复 due 格式 bug**（前置） | `src/flashcard/siyuan-adapter.ts:519` |
| 2 | 新增 `alignCardDues(cards, due)`，走 `batchSetRiffCardsDueTime` | `src/flashcard/siyuan-adapter.ts` |
| 3 | 新增分组索引构建 `buildTwinIndex()` | 新文件 `src/flashcard/twin-sync.ts` |
| 4 | 新增对账主流程 `reconcileTwins(scope)`，含分组、跳过未制卡、取最大 due、写回 | 同上 |
| 5 | 挂载手动入口与会话结束钩子 | `src/lets-flashcard/` |
| 6 | 对账结果审计（改动数、跳过数），复用 `plugin.loadData/saveData` 模式 | 参照 `src/flashcard/fsrs-weight-history.ts:15-16` |

### 任务 1：due 格式 bug（必须先修）

`src/flashcard/siyuan-adapter.ts:519` 当前写法：

```ts
const due = new Date(Date.now() + Math.max(0, days) * 86_400_000).toISOString();
```

内核 `model/flashcard.go:234` 用 `time.ParseInLocation("20060102150405", ...)` 解析，ISO 串必然解析失败。失败时 `SetFlashcardsDueTime` 直接 `return`，**不调用 `deck.Save()`**，整批卡一张都不写入；`requestStrict`（`src/api.ts:692`）随即抛出 `SiYuan request failed`。

修复为本地时区的 14 位串：

```ts
const pad = (n: number) => String(n).padStart(2, "0");
const d = new Date(Date.now() + Math.max(0, days) * 86_400_000);
const due = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
```

新增的 `alignCardDues` 必须使用同一格式化函数。

## 验收标准

- 背诵卷与考前聚焦的同 ID 卡，背完任一张后触发对账，另一张 `due` 相同。
- 未制卡的副本存在时，对账不报错、不产生任何写入。
- 删除任一副本后对账，剩余成员正常拉齐。
- 改写某副本的 `custom-dm-card-id` 后，该卡脱离分组且进度独立，其余成员不受影响。
- 连续对账两次，第二次写入数为 0（幂等）。
- 走思源原生复习界面复习后，对账同样生效。

## 未决问题

- 对账自动触发的阈值（时间/改动数）尚未定，先只做手动入口。
- 是否需要"新副本制卡即对齐"的即时路径，还是统一等下次对账 —— 倾向于后者，减少写入。
- FSRS 参数长期不共享是否会在极长周期（>1 年）产生可感知偏差，需实测。

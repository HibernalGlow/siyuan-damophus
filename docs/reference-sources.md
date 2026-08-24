# Reference Sources

Reference snapshot date: 2026-08-23.

实际 clone 放在仓库根目录的 `ref/`，该目录已被 Git 忽略。本文档记录允许参考的来源和固定 commit；更新参考源码时先更新此表，再重新检出对应 commit。

| Repository | Pinned commit | Primary use |
| --- | --- | --- |
| `frostime/sy-f-misc` | `250d7645cc3c65ee53ea705438cfc1a7cfe1f575` | 成熟思源插件的 AV、菜单、设置和生命周期调用模式 |
| `frostime/siyuan-plugin-kits` | `6bb8e79ab421740501412cf0b17125a1508323a1` | 可复用的思源插件工具封装 |
| `siyuan-note/plugin-sample-vite-svelte` | `2044f582afbaf435c2b6a26f4ddff0548080d1ac` | 官方插件生命周期、Vite 和 Svelte 示例 |
| `siyuan-note/siyuan` | `eef10568384e2e7cf547adb029ae46a72e43c287` | 官方 API、AV、Riff、块格式和移动端行为的最终依据 |
| `nazdridoy/obsidian-cbt-exam` | `799df15647df39cd46fff76aa9b8ad0d490fdd15` | 考试会话、题号导航、标记复查、计时和结果页；MIT |
| `nazdridoy/obsidian-flashquiz` | `65c7dfd98100855081b82a26bbb56b09cbfa1b69` | 题型解析和考试题源格式；MIT |
| `carbon-softlab/CQuiz` | `e439a4069fc0c2d343266dedb238ffaf66eec0fb` | 跨文件题库和组卷交互参考；只读研究 |
| `dscherdi/decks` | `9cdd7fd09cbbf232eaabbbe23996cc8524f9ccdd` | 组卷 profile、结果和复习配置参考；只读研究 |
| `PearlLin2000/Specialized-Flashcard-Plugin` | `aa3bb02c8ed68164ddda53b87daa391822a1b7be` | DAMO 闪卡功能等价迁移基线；MIT；不复制其独立插件壳 |
| `Samuelxiaozhuofeng/orca-srs-plugin` | `55529a99352bf26ee817a636f84c5750c44327bc` | SRS 数据模型、牌组/调度边界参考；只读研究，不作为依赖 |
| `hqweay/orca-hqweay-go` | `ac4814e12d9d08663e05ff0138ffd73198b0fb03` | Orca 宿主与复习集成参考；只读研究，不作为依赖 |
| `IAliceBobI/sy-tomato-plugin` | `74e990bedec44fb14cd5297d7840a835793f7080` | 原生 `updateCards` 队列优先级和复习工具交互；MIT；仅迁移窄范围机制 |
| `zongqir/siyuan-flashcard-assistant` | `292c89d881de373fd580ccd35e163b82c19875fa` | 最近使用、置顶和频次排序；MIT；不迁移 DOM 拦截 |
| `kx1356/siyuan-flashcard-zy` | `6c9a6573f0848923202fa2b345354603021490ff` | 文档/笔记本范围、数量和诊断交互；只有编译包，不复制实现 |
| `Dammyxy/siyuan-plugin-siyuanmemo` | `4c92866bf5cb0aa44e474d48732816bb2a315e4e` | 块范围复习和卡片浏览器产品参考；自定义禁止修改/逆向许可证，不复制源码 |
| `suka233/siyuan-knote` | `edad2b76ea112df34fd49ff8b0a76d9753fc0d5d` | 工作台筛选、列表和块定位参考；许可证信号冲突，仅 clean-room 模仿 |
| `mdzz2048/siyuan-plugin-export-revlog` | `b53653120d93e3e7f7bda91ab70a49eed26394ce` | Riff 复习记录 CSV 行为参考；根许可证为 MIT，但核心源码标注 AGPLv3，因此只做独立实现，不复制源码 |

### Additional UI Sources

- `thisuxhq/sveltednd` at `b66d8dd27629656ab43a088b63321150a496b754` (`0.7.0`): Svelte 5 pointer, keyboard, and handle-based drag-and-drop actions; MIT.

## Dynamic API Index

- `https://siyuan-note.apifox.cn/llms.txt` 是思源 API 文档的动态索引，用于按主题快速定位当前公开端点和说明。
- 动态索引没有可固定的 Git commit，不作为行为真相来源，也不替代上表的固定源码快照。
- 涉及 API、AV 或 Riff 时，先用该索引定位相关文档，再用 `ref/siyuan` 中固定 commit 的实现核对参数、返回值和副作用。

## Rules

1. 调用思源 API 前，先查当前仓库的 `src/api.ts`，再按动态 API 索引定位文档，最后查固定参考源码确认行为。
2. 参考源码只读，不在 `ref/` 中做产品修改。
3. 优先复用公开稳定 API和成熟包；只有思源 IAL AST 扩展和 Damophus 领域规则允许自研核心逻辑。
4. 复制代码前确认其边界、依赖和许可证；即使个人使用，也保留来源说明。
5. 实际 API 行为与文档不一致时，以固定版本源码和本地思源验证结果为准，并在本仓库补充测试或 ADR。
6. SFP 的功能可以迁移，SFP 的 Tomato 和文档流私有调用不能直接成为 DAMO 核心依赖；迁移前先记录行为，再在 DAMO adapter 中实现等价能力和降级状态。
7. Tomato 的优先级实现只用于证明原生 `updateCards` 队列可排序；DAMO 不复制默认 50、自动统一、评分改优先级、私有全局对象和 DOM selector 注入。
8. Export Revlog 的五列 CSV 行为可以兼容，但其旧顶栏入口、固定 public 输出目录、重复目录扫描和受限的 File System Access 路径不迁移；DAMO 使用当前文件 API、浏览器下载和逐文件格式校验。

## Expected Layout

```text
ref/
  sy-f-misc/
  siyuan-plugin-kits/
  plugin-sample-vite-svelte/
  siyuan/
```

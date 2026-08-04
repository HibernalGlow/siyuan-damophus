# Reference Sources

Reference snapshot date: 2026-08-04.

实际 clone 放在仓库根目录的 `ref/`，该目录已被 Git 忽略。本文档记录允许参考的来源和固定 commit；更新参考源码时先更新此表，再重新检出对应 commit。

| Repository | Pinned commit | Primary use |
| --- | --- | --- |
| `hqweay/siyuan-hqweay-go` | `84e74939df8e5d7d9796f1930d0a36413730a330` | Damophus 上游历史、注册表和保留工具实现 |
| `frostime/sy-f-misc` | `250d7645cc3c65ee53ea705438cfc1a7cfe1f575` | 成熟思源插件的 AV、菜单、设置和生命周期调用模式 |
| `frostime/siyuan-plugin-kits` | `6bb8e79ab421740501412cf0b17125a1508323a1` | 可复用的思源插件工具封装 |
| `siyuan-note/plugin-sample-vite-svelte` | `2044f582afbaf435c2b6a26f4ddff0548080d1ac` | 官方插件生命周期、Vite 和 Svelte 示例 |
| `siyuan-note/siyuan` | `eef10568384e2e7cf547adb029ae46a72e43c287` | 官方 API、AV、Riff、块格式和移动端行为的最终依据 |

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

## Expected Layout

```text
ref/
  sy-f-misc/
  siyuan-plugin-kits/
  plugin-sample-vite-svelte/
  siyuan/
```

上游 `hqweay/siyuan-hqweay-go` 已通过 `upstream` remote 和 Git 历史保留，不需要在 `ref/` 再克隆一份。

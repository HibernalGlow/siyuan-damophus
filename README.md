# Damophus

Damophus 是面向思源笔记的题库插件。题库功能遵循仓库内已经接受的产品范围和数据契约；插件壳继续使用 `PluginRegistry` 与 `SubPluginBase` 自动发现子插件。

## 当前模块

- `lets-question-bank`：题库扫描、范围练习、Riff 到期复习和作答记录恢复。
- `lets-block-attr`：仅显示安全的题库身份属性，默认横向展示 `qb-id` 与 `qb-type`，空间不足时自动换行；设置页可预览并自定义标签与样式，答案属性始终隐藏。

Dashboard、链接/引用转换、排版、快捷属性操作、列表视图转换、Memo，以及 EPUB、OCR、VoiceNotes、日记、随机题图、同步等旧模块均不属于 Damophus 产品范围。需要这些通用工具时继续使用原 `siyuan-hqweay-go` 插件。

## 题库

题库内容以 Markdown 与 IAL 为事实来源，作答记录使用不可变属性视图事件，Riff 只负责调度，Damophus 负责扫描、练习和渲染。插件支持初始化题库系统文档、扫描预览与确认、专题范围、顺序/随机练习、错题与待复习筛选、客观题和主观题、快速闪卡，以及版本化 JSON 导入导出。

使用与迁移说明：

- [用户指南](docs/user-guide.md)
- [迁移指南](docs/migration.md)

详细约束：

- [产品范围](docs/product-scope.md)
- [题库数据契约](docs/question-bank-contract.md)
- [架构](docs/architecture.md)
- [实施计划](docs/implementation-plan.md)

## 开发

```sh
pnpm install
pnpm dev
pnpm check
pnpm test
pnpm test:browser
pnpm test:smoke
pnpm build
pnpm test:package
```

`pnpm dev` 会启动独立的本地题库预览页（默认 `http://127.0.0.1:5173/`），使用内存模拟数据，不连接或写入思源。预览页支持桌面/手机宽度、浅色/深色主题和中英文切换。需要监听构建并部署到思源插件目录时使用 `pnpm dev:plugin`。

构建会自动生成翻译聚合文件与 `package.zip`；这些生成物不进入 Git。子插件约束、i18n 规则和生命周期要求见 [AGENTS.md](AGENTS.md)。

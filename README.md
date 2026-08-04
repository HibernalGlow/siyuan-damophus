# Damophus

Damophus 是面向思源笔记的题库与实用工具插件。题库功能遵循仓库内已经接受的产品范围和数据契约；现有插件壳继续使用 `PluginRegistry` 与 `SubPluginBase` 自动发现子插件。

## 当前保留工具

- `lets-dashboard`：仪表盘、文档流、图片流和自定义 SQL 视图。
- `lets-block-attr`：块属性快捷操作与属性驱动样式。
- `lets-href-to-ref`：块引用、思源链接和行内格式转换。
- `lets-typography-go`：中英文排版、图片样式和资源本地化。
- `lets-question-bank`：题库扫描、范围练习、Riff 到期复习和作答记录恢复。

未列入产品范围的 EPUB、OCR、VoiceNotes、日记、随机题图、同步和其他旧模块已经从运行时代码、翻译、依赖与打包资源中移除。

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
pnpm check
pnpm test
pnpm test:browser
pnpm test:smoke
pnpm build
pnpm test:package
```

构建会自动生成翻译聚合文件与 `package.zip`；这些生成物不进入 Git。子插件约束、i18n 规则和生命周期要求见 [AGENTS.md](AGENTS.md)。

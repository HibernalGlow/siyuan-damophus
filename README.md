# Damophus

Damophus 是面向思源笔记的题库与实用工具插件。题库功能遵循仓库内已经接受的产品范围和数据契约；现有插件壳继续使用 `PluginRegistry` 与 `SubPluginBase` 自动发现子插件。

## 当前保留工具

- `lets-dashboard`：仪表盘、文档流、图片流和自定义 SQL 视图。
- `lets-block-attr`：块属性快捷操作与属性驱动样式。
- `lets-href-to-ref`：块引用、思源链接和行内格式转换。
- `lets-typography-go`：中英文排版、图片样式和资源本地化。

未列入产品范围的 EPUB、OCR、VoiceNotes、日记、随机题图、同步和其他旧模块已经从运行时代码、翻译、依赖与打包资源中移除。

## 题库方向

题库内容以 Markdown 与 IAL 为事实来源，作答记录使用 detached 属性视图事件，Riff 只负责调度，Damophus 负责扫描、练习和渲染。详细约束见：

- [产品范围](docs/product-scope.md)
- [题库数据契约](docs/question-bank-contract.md)
- [架构](docs/architecture.md)
- [实施计划](docs/implementation-plan.md)

## 开发

```sh
pnpm install
pnpm check
pnpm test:smoke
pnpm build
```

构建会自动生成翻译聚合文件与 `package.zip`；这些生成物不进入 Git。子插件约束、i18n 规则和生命周期要求见 [AGENTS.md](AGENTS.md)。

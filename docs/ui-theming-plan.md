# UI Theming Plan

Status: accepted on 2026-08-05.

## Decisions

- 本轮只改造设置页和题库块属性预览，不重写题库练习界面。
- 使用 Tailwind CSS v4 和按需生成的 shadcn-svelte 源组件，不安装或迁移整套组件库。
- Damophus 使用独立的法律学习视觉，而不是复刻思源控件外观。默认主题采用中性瓷白或炭黑表面、深红主色和克制的金色强调；正确、错误和警告状态继续使用独立的绿、红和琥珀语义色。
- 常用设置使用结构化控件，高级用户仍可使用受限 CSS 声明。
- 主题系统兼容 tweakcn 变量模型，并支持从 JSON 导入自定义主题。

## Scope

本轮包含：

- 设置页导航、设置项控件、主题选择和主题导入。
- 块属性预览、预览宽度调节和窄宽响应式状态。
- 题库块属性的显示字段、标签和布局设置。
- Tailwind、shadcn-svelte 组件源文件、主题运行时和相应测试。

本轮不包含：

- 题库练习界面的视觉重写。
- Dashboard、链接转换、排版或任何已移除的通用工具模块。
- 将 Tailwind class 写入思源编辑器块 DOM。
- 在线主题市场、账户同步或运行时下载主题。

## Theme Contract

导入器接受一个主题对象或主题对象数组。主题对象采用以下结构：

```json
{
  "name": "theme-name",
  "description": "Optional description",
  "cssVars": {
    "light": {
      "background": "oklch(0.98 0.01 90)",
      "foreground": "oklch(0.2 0.02 20)",
      "primary": "oklch(0.42 0.16 24)"
    },
    "dark": {
      "background": "oklch(0.16 0.02 20)",
      "foreground": "oklch(0.95 0.01 90)",
      "primary": "oklch(0.7 0.14 28)"
    }
  }
}
```

`D:\Downloads\EcoPaste_UYuKxcBjSeMUP_bguDMTU.json` 是导入兼容性的本地参考文件。它是 UTF-8 JSON 数组，包含 34 个主题和 58 个不同的 light 变量名。该文件不复制或提交到仓库；测试使用最小化 fixture 覆盖同一数据形状。

导入规则：

- 文件必须是 UTF-8 JSON，并通过 Zod 结构校验。
- `name`、`cssVars.light` 和 `cssVars.dark` 必填；核心前景、背景、表面、主色和边框变量缺失时给出逐主题错误。
- 仅接受已登记的 tweakcn 变量名，并限制文件大小、主题数量、名称长度和值长度。
- 通过 `CSSStyleDeclaration.setProperty` 应用变量，不拼接用户提供的选择器或样式表文本。
- 禁止 URL、`@import`、`content`、`attr()`、HTML 和选择器输入。
- 内置主题使用 `builtin:<name>` 命名空间，自定义主题使用 `custom:<name>`，不得覆盖内置主题。重复导入同名自定义主题时先预览差异，再确认替换。
- 导入成功后展示主题数量、跳过项和错误项；部分失败不会丢弃其他有效主题。
- 主题根据思源当前明暗模式选择 `light` 或 `dark`，不增加第三套主题模式开关。
- 设置页字体继续继承思源。导入文件中的 `font-sans`、`font-serif` 和 `font-mono` 可保留用于再次导出，但本轮不加载外部字体，也不覆盖宿主字体。
- 组件文字间距保持为 `0`；主题中的 tracking 变量不用于组件文字排版。

## Theme Experience

设置页提供“内置主题”和“自定义主题”两个视图。每个主题显示紧凑的颜色样本和名称，点击即在设置页及块属性预览中实时试用；只有确认后才持久化。支持导入 JSON、移除自定义主题、恢复默认主题和导出自定义主题。

默认内置主题为 `damophus-red-gold`。另外按需捆绑少量经过可读性检查的 tweakcn 主题，不在运行时连接 tweakcn。主题只改变 Damophus 自有 UI 和题库标记，不改变思源全局界面。

## Block Attribute Controls

字段设置按属性逐项展示：

- 是否显示该属性值。
- 是否显示属性名。
- 可选的显示名称。

默认显示 `custom-qb-id` 和 `custom-qb-type`，分别显示为 `qb-id` 和 `qb-type`。`custom-qb-answer` 永远不进入配置列表、预览 DOM 或生成的 CSS。

默认块类型包含标题、段落和列表等文本块，表格等不具备题库身份展示价值的块默认关闭。布局默认自动平铺；宽度不足时换行，不足以容纳单项内容时才进入纵向排列。

高级 CSS 继续只接受安全声明，用于题库标记外观，不允许改变页面布局、读取属性值或生成伪元素内容。

## Styling Boundary

- Tailwind v4 使用 `@tailwindcss/vite`，不引入 Preflight，也不设置 `body`、通配选择器或思源全局元素样式。
- 所有主题变量挂在 Damophus 自有根节点上。Tailwind utility 仅出现在 Damophus Svelte 组件中。
- shadcn-svelte 组件按需生成并作为仓库源代码维护。首批仅包含 Button、Input、Textarea、Slider、Switch、Tabs、Separator、Tooltip 及其必要依赖。
- Overlay 和 Tooltip 必须挂载到 Damophus 自有 portal root；不得默认逃逸到 `document.body`。
- 思源编辑器内的块属性标记继续由专用、受限 CSS 生成器负责，不依赖 Tailwind class。

## Delivery

1. 基础设施提交：Tailwind v4、无 Preflight 的入口样式、主题 token、shadcn-svelte 基础组件和主题 schema。
2. 功能提交：主题库和 JSON 导入、设置页改造、块属性设置与预览改造、翻译和 changeset。
3. 验证：主题 schema 单测、导入错误测试、设置页 Browser Mode、桌面和窄宽截图、`svelte-check`、Node Vitest、Browser Mode、生产构建和插件包校验。
4. 部署到隔离思源测试工作空间，验证明暗主题切换、导入参考格式、设置持久化和 `custom-qb-answer` 不可见。

题库练习界面的迁移必须作为后续独立范围重新评估，不与本轮设置页工作混合提交。

# Implementation Plan

Status: accepted on 2026-08-04.

## Commit Boundaries

### 0. Foundation documents

- 建立产品范围、统一语言、数据契约、架构 ADR、参考源码清单和本计划。
- 不改变运行时代码。

### 1. Rename and baseline

- 将 package、plugin ID、显示名、仓库地址和发布配置改为 Damophus。
- 安装当前上游依赖并记录原始构建结果。
- 补充最小 smoke test，保证后续升级有对照基线。

### 2. Toolchain migration

- Svelte 4 升级到 Svelte 5。
- Vite 5 升级到 Vite 8。
- TypeScript 5 升级到 TypeScript 6。
- 更新 Svelte、Vite、TypeScript 配置和依赖锁文件。
- 通过构建、类型检查和保留模块 smoke test 后独立提交。

### 3. Reference workspace

- 实际参考仓库浅克隆到被忽略的 `ref/`。
- 按 `docs/reference-sources.md` 固定 commit。
- 只读研究 AV、Riff、菜单、移动端和生命周期调用，不直接复制大段业务代码。

### 4. Module pruning

- 只保留题库和题库块身份属性显示。
- 删除 Dashboard、链接转引用、排版、快捷属性操作、列表视图转换、Memo，以及对应依赖、资源、设置项和翻译。
- 验证注册表不会加载已删除模块，打包物中不残留对应资源。

### 5. Portable question core

- 建立 Zod schema 和纯 TypeScript 模型。
- 实现 Markdown/IAL AST 解析、继承、稳定 ID、答案区和选项识别。
- 实现打乱映射、客观判题、范围筛选和事件聚合。
- 使用真实客观题、判断题、主观题、题组和异常旧稿 fixture 测试。

### 6. SiYuan indexing

- 初始化或重新绑定题库系统文档、题目 AV、Topic Index 和作答记录 AV。
- 实现当前文档扫描、标题树范围识别和 preview/confirm 同步。
- 受管列按 key ID 绑定，保留用户列和顺序。
- 为 Question Index 创建指向 Topic Index 的多值 Topics 关联列；为 Topic Index 创建法律、专题、资源和反向题目汇总列。
- 在练习渲染器或插件自有预览面板中虚拟展示考点资源；默认不插入真实 SiYuan 块，固化嵌入必须由用户显式确认。
- 实现 detached attempt rows 和统计重建。

### 7. Practice UI

- 实现文档选择、自动识别、标题树回退选择和最近范围恢复。
- 实现顺序、随机、错题、连续待复习和到期筛选。
- 实现选项打乱、恢复、答案揭晓、掌握评级、误触撤回和主观题自评。
- 使用 Vitest Browser Mode 覆盖桌面和移动宽度。

### 8. Riff integration

- 验证快速制卡、到期查询和评级提交的真实 API 行为。
- 实现达到阈值后自动制卡和按范围复习到期题。
- 不启用卡包兼容选项，不修改思源原生闪卡渲染。

### 9. Recovery and release readiness

- 实现版本化 JSON 导出、去重导入和孤立题目报告。
- 完成升级迁移说明、用户文档和变更集。
- 构建插件包并在思源桌面端与移动端验证关键流程。

## Definition of Done

- 同一份 Markdown 可生成稳定的可移植 `Question[]`，不依赖思源运行时。
- 插件扫描不会改写题目正文，冲突不会静默通过。
- 文档、专题、小专题和考点范围均能递归筛选题目。
- 客观题选项打乱后仍按原始 ID 判分，揭晓后恢复原顺序。
- 主观题可自行评分和评级，误触不产生事件。
- 作答事件可以重建统计，并能 JSON 导出、导入和去重。
- Riff 负责调度，Damophus 能按所选范围复习到期题。
- 题库界面在桌面与移动布局下均可用，题库身份属性在配置的块类型上正确显示。
- `pnpm build`、类型检查、核心测试和浏览器测试全部通过。

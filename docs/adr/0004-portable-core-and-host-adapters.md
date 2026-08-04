# Keep the question core portable

题目模型、Markdown 解析、答案判定和作答聚合放在纯 TypeScript 核心，思源块、属性视图、Riff 和 Svelte UI 通过适配层接入。首版继续使用 Svelte 以复用插件壳，但未来 React 网站可以复用核心和数据契约而不复用界面代码。

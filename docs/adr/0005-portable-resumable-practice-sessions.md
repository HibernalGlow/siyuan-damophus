# Use a portable state machine and independent session snapshots

练习会话使用 XState 5 表达 active、submitting、paused、completed、reviewing 和 ended 状态，使用 Zod 4 校验版本化领域快照。持久化内容是由稳定题目 ID、原始选项 ID、逐题草稿和累计有效用时组成的独立快照，不是 XState 内部 snapshot，因此核心不依赖 Svelte、DOM 或思源 API，未来网站可以直接复用。

思源宿主通过插件 `loadData` / `saveData` 保存每个源块最多一个未完成会话；完成或明确终止后删除快照，但不可变 AttemptEvent 永久保留。`broadcast-channel` 的领导权租约限制同一会话只有一个可写窗口，revision 乐观锁负责阻止租约失效或并发时的旧进度覆盖。

恢复时以旧队列为边界，不自动加入题源新增题；删除题逐题移除，题型、答案或选项结构变化时只重置对应草稿，并以 Attempt Log 中同一 session ID 的事件重新确认已提交题目。

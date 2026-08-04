# Attempts are immutable attribute-view events

每次确认作答都追加为作答记录属性视图中的 detached row，而不是创建独立文档或覆盖题目统计。不可变事件使多设备合并、误删恢复和统计重建有统一依据；稳定题目 ID 是权威关联，属性视图 relation 仅用于导航。

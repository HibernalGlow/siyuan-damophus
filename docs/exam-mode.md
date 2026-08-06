# Exam Mode

## Storage

未完成考试保存在插件数据 `damophus-exam-sessions`，只保存一个可恢复的考试快照。快照包括题目队列、乱序后的选项、答案草稿、标记、揭晓状态、开始时间、截止时间、超时状态和提交进度。

交卷后的数据仍然写入现有 Attempt Log，不创建第三个属性视图。Attempt Log 现在是统一事件日志：

- `question_attempt`：一题一行，兼容原有练习记录。
- `exam_submitted`：一场考试的交卷摘要。
- `exam_finalized`：主观题评分完成后的最终摘要。
- `exam_abandoned`：明确放弃的考试，不生成逐题作答事件。

旧事件缺少新增字段时按 `question_attempt`、`practice`、`user` 读取。考试逐题事件使用确定性 `attempt_id`：`exam:{exam_id}:{question_id}`，提交失败后可以从未完成题目继续，不会产生重复记录。

## Timeout

默认允许超时后继续答题，界面显示超时状态；启用严格超时后，到达截止时间立即进入交卷流程。关闭窗口不会暂停计时，重新打开时依据绝对截止时间恢复。

## Scoring

- 法考模式：单选和判断 1 分，多选和不定项 2 分。
- 多选和不定项使用严格集合匹配；评分策略可替换，保留严格单题计分策略。
- 查看答案的题目标记为辅助作答，该题不计分。
- 未答客观题写入空选择、错误结果和 `again` 评级。
- 主观题先进入 `pending_manual_score`，用户完成 0-100 自评后追加主观题事件并写入 `exam_finalized`。

## Source Boundary

P0 只实现当前文档/专题范围。蓝图保存 `source_key`、`scope_id` 和稳定题目 ID，并通过 `ExamQuestionSourceProvider` 预留未来跨文档组卷；本版本不展示跨文档选择器。

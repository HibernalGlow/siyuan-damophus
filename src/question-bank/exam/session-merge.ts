import { ExamSessionSnapshotSchema, type ExamSessionSnapshot } from "./schema";

/**
 * Rebase a stale write from another client that is editing the same exam.
 * Exam drafts are a mutable workspace, so a newer logical revision is safer
 * than blocking the user on an optimistic-lock error. Different exam IDs are
 * still rejected by the repository before this function is called.
 */
export function rebaseExamSessionSnapshot(
  current: ExamSessionSnapshot,
  incoming: ExamSessionSnapshot,
): ExamSessionSnapshot {
  const currentTime = Date.parse(current.updated_at);
  const incomingTime = Date.parse(incoming.updated_at);
  const updatedAt = Number.isFinite(Math.max(currentTime, incomingTime))
    ? new Date(Math.max(currentTime, incomingTime)).toISOString()
    : current.updated_at;
  return ExamSessionSnapshotSchema.parse({
    ...incoming,
    revision: current.revision + 1,
    updated_at: updatedAt,
  }) as ExamSessionSnapshot;
}

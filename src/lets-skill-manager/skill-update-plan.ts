import type { SkillSyncSummary } from "./api";

export interface SkillUpdatePlan {
  updates: SkillSyncSummary[];
  skipped: number;
  unreadable: number;
}

export function planSkillUpdates(statuses: SkillSyncSummary[]): SkillUpdatePlan {
  return {
    updates: statuses.filter((skill) => skill.state === "update"),
    skipped: statuses.filter((skill) => skill.state === "missing" || skill.state === "synced").length,
    unreadable: statuses.filter((skill) => skill.state === "unreadable").length,
  };
}

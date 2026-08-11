import { describe, expect, it } from "vitest";

import type { SkillSyncState, SkillSyncSummary } from "./api";
import { planSkillUpdates } from "./skill-update-plan";

function skill(name: string, state: SkillSyncState): SkillSyncSummary {
  return { name, description: name, sourcePath: `/source/${name}`, state };
}

describe("skill update planning", () => {
  it("selects only installed skills whose source changed", () => {
    const plan = planSkillUpdates([
      skill("changed", "update"),
      skill("new", "missing"),
      skill("current", "synced"),
      skill("local", "target-only"),
      skill("broken", "unreadable"),
    ]);

    expect(plan.updates.map(({ name }) => name)).toEqual(["changed"]);
    expect(plan.skipped).toBe(2);
    expect(plan.unreadable).toBe(1);
  });
});

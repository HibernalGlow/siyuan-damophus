import { describe, expect, it, vi } from "vitest";

import { renderSkillManagerDock } from "./dock";
import "./skill-manager.css";

const labels = {
  title: "Skill manager",
  refresh: "Refresh",
  openTab: "Open in new tab",
  source: "Skill source",
  syncAll: "Sync all",
  update: "Update",
  newSkill: "New skill",
  select: "Skill name",
  content: "SKILL.md content",
  save: "Save",
  rename: "Rename",
  remove: "Remove",
  empty: "No skills installed",
  saved: "Skill saved",
  synced: "Skill synced",
  syncResult: "Synced {synced}; skipped {skipped}; unreadable {unreadable}",
  failed: "Operation failed",
  confirmRemove: "Remove this skill from SiYuan?",
  states: {
    missing: "Not installed",
    synced: "Up to date",
    update: "Update available",
    "target-only": "SiYuan only",
    unreadable: "Unreadable",
  },
};

const config = { sourceRoot: "C:/Users/test/.skills-manager/skills", onlyChanged: true };

describe("skill manager dock", () => {
  it("loads a selected skill and saves its edited content", async () => {
    const api = {
      listSkills: vi.fn(async () => [{ name: "legal-marknote", description: "Legal notes" }]),
      getSkill: vi.fn(async () => ({ name: "legal-marknote", content: "Original" })),
      saveSkill: vi.fn(async () => undefined),
      renameSkill: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      inspectSkillSourceRoot: vi.fn(async () => [{
        name: "legal-marknote",
        description: "Legal notes",
        sourcePath: `${config.sourceRoot}/legal-marknote`,
        state: "update" as const,
      }]),
      syncSkillSourceRoot: vi.fn(async () => ({ synced: 1, skipped: 0, unreadable: 0 })),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, config, api);

    await expect.poll(() => target.querySelectorAll('[role="option"]').length).toBe(1);
    await expect.poll(() => (target.querySelector('textarea') as HTMLTextAreaElement).value).toBe("Original");
    const editor = target.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = "Updated";
    (target.querySelector('[aria-label="Save"]') as HTMLButtonElement).click();

    await expect.poll(() => api.saveSkill).toHaveBeenCalledWith("legal-marknote", "Updated");
    expect(target.textContent).toContain("Update available");
    expect(getComputedStyle(target.querySelector(".damophus-skill-manager__body")!).display).toBe("grid");

    cleanup();
    target.remove();
  });

  it("synchronizes all changed skills from the configured source", async () => {
    const api = {
      listSkills: vi.fn(async () => []),
      getSkill: vi.fn(async () => ({ name: "", content: "" })),
      saveSkill: vi.fn(async () => undefined),
      renameSkill: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      inspectSkillSourceRoot: vi.fn(async () => []),
      syncSkillSourceRoot: vi.fn(async () => ({ synced: 2, skipped: 3, unreadable: 1 })),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, config, api);

    await expect.poll(() => api.inspectSkillSourceRoot).toHaveBeenCalled();
    (target.querySelector('[aria-label="Sync all"]') as HTMLButtonElement).click();

    await expect.poll(() => api.syncSkillSourceRoot).toHaveBeenCalledWith(config.sourceRoot, true);
    await expect.poll(() => target.querySelector('[role="status"]')?.textContent)
      .toBe("Synced 2; skipped 3; unreadable 1");
    cleanup();
    target.remove();
  });
});

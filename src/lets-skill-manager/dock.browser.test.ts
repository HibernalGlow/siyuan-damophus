import { describe, expect, it, vi } from "vitest";

import { renderSkillManagerDock } from "./dock";
import "./skill-manager.css";

const labels = {
  title: "Skill manager",
  refresh: "Refresh",
  source: "Local skill directory",
  sourcePlaceholder: "Absolute path to a real directory",
  sync: "Sync",
  newSkill: "New skill",
  nameOptional: "Directory name (optional)",
  select: "Skill name",
  content: "SKILL.md content",
  save: "Save",
  rename: "Rename",
  remove: "Remove",
  empty: "No skills installed",
  saved: "Skill saved",
  synced: "Skill synced",
  failed: "Operation failed",
  confirmRemove: "Remove this skill from SiYuan?",
};

describe("skill manager dock", () => {
  it("loads a selected skill and saves its edited content", async () => {
    const api = {
      listSkills: vi.fn(async () => [{ name: "legal-marknote", description: "Legal notes" }]),
      getSkill: vi.fn(async () => ({ name: "legal-marknote", content: "Original" })),
      saveSkill: vi.fn(async () => undefined),
      renameSkill: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      syncSkillDirectory: vi.fn(async () => ({ name: "legal-marknote" })),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, api);

    await expect.poll(() => target.querySelectorAll('[role="option"]').length).toBe(1);
    await expect.poll(() => (target.querySelector('textarea') as HTMLTextAreaElement).value).toBe("Original");
    const editor = target.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = "Updated";
    (target.querySelector('[aria-label="Save"]') as HTMLButtonElement).click();

    await expect.poll(() => api.saveSkill).toHaveBeenCalledWith("legal-marknote", "Updated");
    expect(getComputedStyle(target.querySelector(".damophus-skill-manager__body")!).display).toBe("grid");

    cleanup();
    target.remove();
  });
});

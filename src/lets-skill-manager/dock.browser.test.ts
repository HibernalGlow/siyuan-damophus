import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";

import { renderSkillManagerDock } from "./dock";
import type { SkillSyncOptions } from "./api";
import "./skill-manager.css";

const labels = {
  title: "Skill manager",
  refresh: "Refresh",
  openTab: "Open in new tab",
  source: "Skill source",
  updateAll: "Update all",
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
  updateResult: "Updated {updated}; skipped {skipped}; unreadable {unreadable}",
  failed: "Operation failed",
  confirmRemove: "Remove this skill from SiYuan?",
  search: "Search skills",
  filterState: "Filter by status",
  allStates: "All statuses",
  sort: "Sort skills",
  sortNameAsc: "Name A-Z",
  sortNameDesc: "Name Z-A",
  sortState: "Updates first",
  preview: "Preview",
  edit: "Edit source",
  visibleCount: "{visible} of {total}",
  logs: "Sync log",
  logsEmpty: "No synchronization activity yet",
  copyLogs: "Copy log",
  clearLogs: "Clear log",
  logsCopied: "Log copied",
  logStarted: "started",
  logCompleted: "completed",
  logFailed: "failed",
  logRefresh: "Status refreshed",
  states: {
    missing: "Not installed",
    synced: "Up to date",
    update: "Update available",
    "target-only": "SiYuan only",
    unreadable: "Unreadable",
  },
};

const config = {
  sourceRoot: "C:/Users/test/.skills-manager/skills",
  onlyChanged: true,
  syncOptions: {
    backend: "chezmoi" as const,
    chezmoiCommand: "chezmoi",
    destinationRoot: "D:/SiYuan/data/storage/ai/agent/skills",
  },
};

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
      updateSkillSourceRoot: vi.fn(async () => ({ synced: 1, skipped: 0, unreadable: 0 })),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const markdownRenderer = vi.fn((markdown: string) => `<div data-node-id="preview">${markdown}</div>`);
    const cleanup = renderSkillManagerDock(target, labels, config, api, undefined, markdownRenderer);

    await expect.poll(() => target.querySelectorAll('[role="option"]').length).toBe(1);
    const manager = target.querySelector<HTMLElement>(".damophus-skill-manager");
    const saveButton = target.querySelector<HTMLElement>('[aria-label="Save"]');
    expect(manager?.classList.contains("damophus-theme-root")).toBe(true);
    expect(document.documentElement.dataset.damophusBrowserTheme).toBe("elegant-luxury");
    expect(getComputedStyle(manager!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(saveButton!).backgroundColor).not.toBe("rgba(0, 0, 0, 0)");
    expect(getComputedStyle(saveButton!).borderRadius).not.toBe("0px");
    await expect.poll(() => target.querySelector(".damophus-skill-manager__preview")?.textContent).toContain("Original");
    expect(markdownRenderer).toHaveBeenCalledWith("Original");
    const actionIcon = target.querySelector<SVGElement>('.damophus-skill-manager__actions svg.lucide');
    expect(actionIcon).not.toBeNull();
    expect(getComputedStyle(actionIcon!).fill).toBe("none");
    expect(getComputedStyle(actionIcon!).strokeWidth).toBe("1.75px");
    (target.querySelector('[aria-label="Update"]') as HTMLButtonElement).click();
    await expect.poll(() => api.syncSkillFromRoot)
      .toHaveBeenCalledWith(config.sourceRoot, "legal-marknote", expect.objectContaining({
        ...config.syncOptions,
        onLog: expect.any(Function),
      }));
    (Array.from(target.querySelectorAll("button")).find((button) => button.textContent === "Edit source") as HTMLButtonElement).click();
    await expect.poll(() => target.querySelector("textarea")).not.toBeNull();
    const editor = target.querySelector('textarea') as HTMLTextAreaElement;
    editor.value = "Updated";
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    (target.querySelector('[aria-label="Save"]') as HTMLButtonElement).click();

    await expect.poll(() => api.saveSkill).toHaveBeenCalledWith("legal-marknote", "Updated");
    expect(target.textContent).toContain("Update available");
    expect(getComputedStyle(target.querySelector(".damophus-skill-manager__body")!).display).toBe("grid");

    cleanup();
    target.remove();
  });

  it("filters and sorts the skill list with TanStack Table", async () => {
    const summaries = [
      { name: "zeta", description: "Last skill", sourcePath: `${config.sourceRoot}/zeta`, state: "synced" as const },
      { name: "alpha", description: "Legal notes", sourcePath: `${config.sourceRoot}/alpha`, state: "update" as const },
      { name: "beta", description: "Media tools", sourcePath: `${config.sourceRoot}/beta`, state: "missing" as const },
    ];
    const api = {
      listSkills: vi.fn(async () => summaries.slice(0, 2)),
      getSkill: vi.fn(async (name: string) => ({ name, content: `# ${name}` })),
      saveSkill: vi.fn(async () => undefined),
      renameSkill: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      inspectSkillSourceRoot: vi.fn(async () => summaries),
      syncSkillSourceRoot: vi.fn(async () => ({ synced: 0, skipped: 0, unreadable: 0 })),
      updateSkillSourceRoot: vi.fn(async () => ({ synced: 0, skipped: 0, unreadable: 0 })),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, config, api, undefined, (markdown) => markdown);

    await expect.poll(() => target.querySelectorAll('[role="option"]').length).toBe(3);
    const skillNames = () => Array.from(target.querySelectorAll('[role="option"] strong')).map((node) => node.textContent);
    expect(skillNames()).toEqual(["alpha", "beta", "zeta"]);

    const search = target.querySelector('[aria-label="Search skills"]') as HTMLInputElement;
    search.value = "media";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await expect.poll(skillNames).toEqual(["beta"]);
    expect(target.textContent).toContain("1 of 3");

    search.value = "";
    search.dispatchEvent(new InputEvent("input", { bubbles: true }));
    await expect.poll(skillNames).toEqual(["alpha", "beta", "zeta"]);

    await userEvent.click(target.querySelector('[aria-label="Sort skills"]') as HTMLButtonElement);
    await expect.poll(() => document.querySelectorAll('[data-slot="select-item"]').length).toBeGreaterThan(0);
    await userEvent.click(Array.from(document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'))
      .find((item) => item.textContent?.includes("Name Z-A")) as HTMLElement);
    await expect.poll(skillNames).toEqual(["zeta", "beta", "alpha"]);

    await userEvent.click(target.querySelector('[aria-label="Filter by status"]') as HTMLButtonElement);
    await expect.poll(() => document.querySelectorAll('[data-slot="select-item"]').length).toBeGreaterThan(0);
    await userEvent.click(Array.from(document.querySelectorAll<HTMLElement>('[data-slot="select-item"]'))
      .find((item) => item.textContent?.includes("Update available")) as HTMLElement);
    await expect.poll(skillNames).toEqual(["alpha"]);
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
      updateSkillSourceRoot: vi.fn(async () => ({ synced: 2, skipped: 3, unreadable: 1 })),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, config, api);

    await expect.poll(() => api.inspectSkillSourceRoot).toHaveBeenCalled();
    (target.querySelector('[aria-label="Sync all"]') as HTMLButtonElement).click();

    await expect.poll(() => api.syncSkillSourceRoot)
      .toHaveBeenCalledWith(config.sourceRoot, true, expect.objectContaining({
        ...config.syncOptions,
        onLog: expect.any(Function),
      }));
    await expect.poll(() => target.querySelector('[role="status"]')?.textContent)
      .toBe("Synced 2; skipped 3; unreadable 1");
    cleanup();
    target.remove();
  });

  it("updates all installed skills with source changes", async () => {
    await page.viewport(380, 720);
    const api = {
      listSkills: vi.fn(async () => [{ name: "changed", description: "Changed" }]),
      getSkill: vi.fn(async () => ({ name: "changed", content: "# Changed" })),
      saveSkill: vi.fn(async () => undefined),
      renameSkill: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      inspectSkillSourceRoot: vi.fn(async () => [{
        name: "changed",
        description: "Changed",
        sourcePath: `${config.sourceRoot}/changed`,
        state: "update" as const,
      }, {
        name: "new-skill",
        description: "New",
        sourcePath: `${config.sourceRoot}/new-skill`,
        state: "missing" as const,
      }]),
      syncSkillSourceRoot: vi.fn(async () => ({ synced: 0, skipped: 0, unreadable: 0 })),
      updateSkillSourceRoot: vi.fn(async (_sourceRoot: string, options?: SkillSyncOptions) => {
        options?.onLog?.({
          level: "success",
          stage: "apply",
          message: "ChezMoi apply completed in 24 ms",
          detail: "updated changed",
        });
        return { synced: 1, skipped: 1, unreadable: 0 };
      }),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    target.style.height = "calc(100vh - 16px)";
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, config, api, undefined, (markdown) => markdown);

    await expect.poll(() => target.querySelector('[aria-label="Update all"]')).not.toBeNull();
    const updateAllButton = target.querySelector('[aria-label="Update all"]') as HTMLButtonElement;
    await expect.poll(() => updateAllButton.disabled).toBe(false);
    expect(updateAllButton.textContent).toContain("Update all (1)");
    updateAllButton.click();

    await expect.poll(() => api.updateSkillSourceRoot)
      .toHaveBeenCalledWith(config.sourceRoot, expect.objectContaining({
        ...config.syncOptions,
        onLog: expect.any(Function),
      }));
    expect(api.syncSkillSourceRoot).not.toHaveBeenCalled();
    await expect.poll(() => target.querySelector('[role="status"]')?.textContent)
      .toBe("Updated 1; skipped 1; unreadable 0");
    await expect.poll(() => target.querySelector('[role="log"]')?.textContent)
      .toContain("ChezMoi apply completed in 24 ms");
    expect(target.querySelector('[role="log"]')?.textContent).toContain("updated changed");
    expect(target.querySelector('[aria-label="Sync log"]')?.getAttribute("data-state")).toBe("open");
    expect(target.querySelector('[role="log"]')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(window.innerHeight);
    (target.querySelector('[aria-label="Clear log"]') as HTMLButtonElement).click();
    await expect.poll(() => target.querySelector('[role="log"]')?.textContent)
      .toContain("No synchronization activity yet");
    cleanup();
    target.remove();
  });

  it("opens the synchronization log when an update fails", async () => {
    const api = {
      listSkills: vi.fn(async () => [{ name: "changed", description: "Changed" }]),
      getSkill: vi.fn(async () => ({ name: "changed", content: "# Changed" })),
      saveSkill: vi.fn(async () => undefined),
      renameSkill: vi.fn(async () => undefined),
      removeSkill: vi.fn(async () => undefined),
      inspectSkillSourceRoot: vi.fn(async () => [{
        name: "changed",
        description: "Changed",
        sourcePath: `${config.sourceRoot}/changed`,
        state: "update" as const,
      }]),
      syncSkillSourceRoot: vi.fn(async () => ({ synced: 0, skipped: 0, unreadable: 0 })),
      updateSkillSourceRoot: vi.fn(async (_sourceRoot: string, options?: SkillSyncOptions) => {
        options?.onLog?.({ level: "info", stage: "verify", message: "Rechecking fingerprints" });
        throw new Error("Skill synchronization did not update the destination");
      }),
      syncSkillFromRoot: vi.fn(async () => undefined),
    };
    const target = document.createElement("div");
    document.body.append(target);
    const cleanup = renderSkillManagerDock(target, labels, config, api, undefined, (markdown) => markdown);

    const updateAllButton = target.querySelector('[aria-label="Update all"]') as HTMLButtonElement;
    await expect.poll(() => updateAllButton.disabled).toBe(false);
    updateAllButton.click();

    await expect.poll(() => target.querySelector('[role="status"]')?.textContent)
      .toBe("Skill synchronization did not update the destination");
    expect(target.querySelector(".damophus-skill-manager")?.getAttribute("data-status")).toBe("error");
    expect(target.querySelector('[aria-label="Sync log"]')?.getAttribute("data-state")).toBe("open");
    expect(target.querySelector('[role="log"]')?.textContent).toContain("Update all: failed");
    expect(target.querySelector('[role="log"]')?.textContent).toContain("Rechecking fingerprints");
    cleanup();
    target.remove();
  });
});

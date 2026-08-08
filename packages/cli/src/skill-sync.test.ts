import { lstat, mkdtemp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { syncSkill } from "./skill-sync";

async function createSkill(root: string, name: string, content = "---\nname: test\ndescription: Test\n---\n\nBody\n") {
  const path = join(root, name);
  await mkdir(path, { recursive: true });
  await writeFile(join(path, "SKILL.md"), content, "utf8");
  return path;
}

describe("skill synchronization", () => {
  it("materializes a directory symlink into real files", async () => {
    const root = await mkdtemp(join(tmpdir(), "damophus-skill-sync-"));
    const source = await createSkill(root, "source");
    await mkdir(join(source, "references"));
    await writeFile(join(source, "references", "guide.md"), "guide", "utf8");
    const link = join(root, "linked-skill");
    await symlink(source, link, process.platform === "win32" ? "junction" : "dir");
    const workspace = join(root, "workspace");

    const result = await syncSkill({ source: link, workspace, materialize: true });
    const destination = join(workspace, "data", "storage", "ai", "agent", "skills", "linked-skill");

    expect(result.materialized).toBe(true);
    expect((await lstat(destination)).isSymbolicLink()).toBe(false);
    expect(await readFile(join(destination, "references", "guide.md"), "utf8")).toBe("guide");
  });

  it("keeps the previous skill when validation fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "damophus-skill-sync-"));
    const workspace = join(root, "workspace");
    const installed = join(workspace, "data", "storage", "ai", "agent", "skills", "broken");
    await mkdir(installed, { recursive: true });
    await writeFile(join(installed, "SKILL.md"), "old", "utf8");
    const source = join(root, "broken");
    await mkdir(source);
    await writeFile(join(source, "README.md"), "missing skill", "utf8");

    await expect(syncSkill({ source, workspace, materialize: true })).rejects.toThrow("does not contain SKILL.md");
    expect(await readFile(join(installed, "SKILL.md"), "utf8")).toBe("old");
  });
});

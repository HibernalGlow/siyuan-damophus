import { fetchSyncPost } from "siyuan";
import { syncSkillsWithChezmoi, type SkillSyncBackend } from "./chezmoi-backend";
import { planSkillUpdates } from "./skill-update-plan";

export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillDocument {
  name: string;
  content: string;
}

export type SkillSyncState = "missing" | "synced" | "update" | "target-only" | "unreadable";

export interface SkillSyncSummary extends SkillSummary {
  sourcePath?: string;
  state: SkillSyncState;
}

export interface SkillSyncResult {
  synced: number;
  skipped: number;
  unreadable: number;
}

export interface SkillSyncOptions {
  backend?: SkillSyncBackend;
  chezmoiCommand?: string;
  destinationRoot?: string;
}

interface KernelResponse<T> {
  code: number;
  msg?: string;
  data: T;
}

async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetchSyncPost(path, body) as KernelResponse<T>;
  if (response.code !== 0) throw new Error(response.msg || `SiYuan request failed: ${path}`);
  return response.data;
}

export function listSkills(): Promise<SkillSummary[]> {
  return post<SkillSummary[] | null>("/api/ai/agent/lsSkills", {}).then((skills) => skills || []);
}

export async function getSkill(name: string): Promise<SkillDocument> {
  const skill = await post<Partial<SkillDocument>>("/api/ai/agent/getSkill", { name });
  return { name: skill.name || name, content: skill.content || "" };
}

export async function saveSkill(name: string, content: string): Promise<void> {
  await post("/api/ai/agent/saveSkill", { name, content });
}

export async function removeSkill(name: string): Promise<void> {
  await post("/api/ai/agent/removeSkill", { name });
}

export async function renameSkill(oldName: string, newName: string): Promise<void> {
  await post("/api/ai/agent/renameSkill", { oldName, newName });
}

interface FileEntry {
  name: string;
  isDir: boolean;
  isSymlink?: boolean;
}

const SKILLS_ROOT = "/data/storage/ai/agent/skills";

function sourceBasename(path: string): string {
  return path.replace(/[\\/]+$/u, "").split(/[\\/]/u).pop() || "";
}

async function fileRequest(path: string, body: unknown): Promise<unknown> {
  return post(path, body);
}

async function readTextFile(path: string): Promise<string> {
  return new TextDecoder().decode(await readFileBytes(path));
}

async function readFileBytes(path: string): Promise<ArrayBuffer> {
  const response = await fetch("/api/file/getFile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path }),
  });
  if (!response.ok || response.status === 202) throw new Error(`Unable to read ${path}`);
  return response.arrayBuffer();
}

async function readDirectory(path: string): Promise<FileEntry[]> {
  return (await fileRequest("/api/file/readDir", { path }) as FileEntry[] | null) || [];
}

const IGNORED_FINGERPRINT_NAMES = new Set([".git", ".skills-manager", ".DS_Store", "Thumbs.db"]);

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function fingerprintDirectory(root: string): Promise<string> {
  const records: string[] = [];
  async function visit(path: string, relative: string): Promise<void> {
    const entries = (await readDirectory(path))
      .filter((entry) => !IGNORED_FINGERPRINT_NAMES.has(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childPath = `${path}/${entry.name}`;
      const childRelative = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDir) {
        records.push(`d:${childRelative}`);
        await visit(childPath, childRelative);
      } else {
        const digest = await crypto.subtle.digest("SHA-256", await readFileBytes(childPath));
        records.push(`f:${childRelative}:${hex(digest)}`);
      }
    }
  }
  await visit(root, "");
  return hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(records.join("\n"))));
}

async function installedSkillNames(): Promise<Set<string>> {
  try {
    return new Set((await readDirectory(SKILLS_ROOT)).filter((entry) => entry.isDir).map((entry) => entry.name));
  } catch {
    return new Set();
  }
}

async function withStagedSourceRoot<T>(sourceRoot: string, action: (stage: string) => Promise<T>): Promise<T> {
  const sourceName = sourceBasename(sourceRoot);
  if (!sourceName) throw new Error("Invalid skill source root");
  const stageRoot = `/data/storage/ai/agent/.damophus-skill-scan-${Date.now()}`;
  try {
    await fileRequest("/api/file/globalCopyFiles", { srcs: [sourceRoot], destDir: stageRoot });
    return await action(`${stageRoot}/${sourceName}`);
  } finally {
    await fileRequest("/api/file/removeFile", { path: stageRoot }).catch(() => undefined);
  }
}

async function replaceStagedSkill(stage: string, name: string): Promise<void> {
  const destination = `${SKILLS_ROOT}/${name}`;
  const backup = `${SKILLS_ROOT}/.damophus-skill-backup-${Date.now()}-${name}`;
  const installed = await installedSkillNames();
  let backedUp = false;
  try {
    if (installed.has(name)) {
      await fileRequest("/api/file/renameFile", { path: destination, newPath: backup });
      backedUp = true;
    }
    await fileRequest("/api/file/renameFile", { path: stage, newPath: destination });
    if (backedUp) await fileRequest("/api/file/removeFile", { path: backup });
  } catch (error) {
    if (backedUp) {
      const current = await installedSkillNames().catch(() => new Set<string>());
      if (!current.has(name)) {
        await fileRequest("/api/file/renameFile", { path: backup, newPath: destination }).catch(() => undefined);
      }
    }
    throw error;
  }
}

async function inspectStagedRoot(stageRoot: string, sourceRoot: string): Promise<SkillSyncSummary[]> {
  const installed = await listSkills();
  const installedByName = new Map(installed.map((skill) => [skill.name, skill]));
  const results: SkillSyncSummary[] = [];
  const entries = await readDirectory(stageRoot);
  for (const entry of entries.filter((item) => item.isDir && !item.name.startsWith("."))) {
    const sourcePath = `${sourceRoot.replace(/[\\/]+$/u, "")}/${entry.name}`;
    const target = installedByName.get(entry.name);
    if (target) installedByName.delete(entry.name);
    try {
      await readTextFile(`${stageRoot}/${entry.name}/SKILL.md`);
      if (!target) {
        results.push({ name: entry.name, description: "", sourcePath, state: "missing" });
        continue;
      }
      const sourceFingerprint = await fingerprintDirectory(`${stageRoot}/${entry.name}`);
      const targetFingerprint = await fingerprintDirectory(`${SKILLS_ROOT}/${entry.name}`).catch(() => "");
      results.push({
        name: entry.name,
        description: target.description,
        sourcePath,
        state: sourceFingerprint === targetFingerprint ? "synced" : "update",
      });
    } catch {
      results.push({ name: entry.name, description: "", sourcePath, state: "unreadable" });
    }
  }
  for (const skill of installedByName.values()) results.push({ ...skill, state: "target-only" });
  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export function inspectSkillSourceRoot(sourceRoot: string): Promise<SkillSyncSummary[]> {
  return withStagedSourceRoot(sourceRoot, (stage) => inspectStagedRoot(stage, sourceRoot));
}

function syncSkillSourceRootBuiltin(sourceRoot: string, onlyChanged = true): Promise<SkillSyncResult> {
  return withStagedSourceRoot(sourceRoot, async (stageRoot) => {
    const statuses = await inspectStagedRoot(stageRoot, sourceRoot);
    const result: SkillSyncResult = { synced: 0, skipped: 0, unreadable: 0 };
    for (const skill of statuses) {
      if (skill.state === "target-only") continue;
      if (skill.state === "unreadable") {
        result.unreadable += 1;
        continue;
      }
      if (onlyChanged && skill.state === "synced") {
        result.skipped += 1;
        continue;
      }
      await replaceStagedSkill(`${stageRoot}/${skill.name}`, skill.name);
      result.synced += 1;
    }
    return result;
  });
}

function updateSkillSourceRootBuiltin(sourceRoot: string): Promise<SkillSyncResult> {
  return withStagedSourceRoot(sourceRoot, async (stageRoot) => {
    const statuses = await inspectStagedRoot(stageRoot, sourceRoot);
    const plan = planSkillUpdates(statuses);
    for (const skill of plan.updates) {
      await replaceStagedSkill(`${stageRoot}/${skill.name}`, skill.name);
    }
    return { synced: plan.updates.length, skipped: plan.skipped, unreadable: plan.unreadable };
  });
}

function syncSkillFromRootBuiltin(sourceRoot: string, name: string): Promise<void> {
  return withStagedSourceRoot(sourceRoot, async (stageRoot) => {
    await readTextFile(`${stageRoot}/${name}/SKILL.md`);
    await replaceStagedSkill(`${stageRoot}/${name}`, name);
  });
}

export async function syncSkillSourceRoot(
  sourceRoot: string,
  onlyChanged = true,
  options: SkillSyncOptions = {},
): Promise<SkillSyncResult> {
  if (options.backend !== "chezmoi") return syncSkillSourceRootBuiltin(sourceRoot, onlyChanged);

  const statuses = await inspectSkillSourceRoot(sourceRoot);
  const unreadable = statuses.filter((skill) => skill.state === "unreadable").length;
  const candidates = statuses.filter((skill) => skill.state !== "target-only" && skill.state !== "unreadable");
  const selected = onlyChanged
    ? candidates.filter((skill) => skill.state !== "synced")
    : candidates;
  await syncSkillsWithChezmoi({
    command: options.chezmoiCommand || "chezmoi",
    sourceRoot,
    destinationRoot: options.destinationRoot || "",
    skillNames: selected.map((skill) => skill.name),
  });
  return {
    synced: selected.length,
    skipped: onlyChanged ? candidates.length - selected.length : 0,
    unreadable,
  };
}

export async function updateSkillSourceRoot(
  sourceRoot: string,
  options: SkillSyncOptions = {},
): Promise<SkillSyncResult> {
  if (options.backend !== "chezmoi") return updateSkillSourceRootBuiltin(sourceRoot);

  const statuses = await inspectSkillSourceRoot(sourceRoot);
  const plan = planSkillUpdates(statuses);
  await syncSkillsWithChezmoi({
    command: options.chezmoiCommand || "chezmoi",
    sourceRoot,
    destinationRoot: options.destinationRoot || "",
    skillNames: plan.updates.map((skill) => skill.name),
  });
  return {
    synced: plan.updates.length,
    skipped: plan.skipped,
    unreadable: plan.unreadable,
  };
}

export function syncSkillFromRoot(
  sourceRoot: string,
  name: string,
  options: SkillSyncOptions = {},
): Promise<void> {
  if (options.backend !== "chezmoi") return syncSkillFromRootBuiltin(sourceRoot, name);
  return syncSkillsWithChezmoi({
    command: options.chezmoiCommand || "chezmoi",
    sourceRoot,
    destinationRoot: options.destinationRoot || "",
    skillNames: [name],
  });
}

export async function syncSkillDirectory(source: string, requestedName?: string): Promise<{ name: string }> {
  const sourceName = sourceBasename(source);
  const name = (requestedName || sourceName).trim();
  if (!name || name === "." || name === ".." || /[\\/]/u.test(name)) throw new Error("Invalid skill name");

  const stageRoot = `/data/storage/ai/agent/.damophus-skill-stage-${Date.now()}`;
  const stage = `${stageRoot}/${sourceName}`;
  const destination = `${SKILLS_ROOT}/${name}`;
  const backup = `${SKILLS_ROOT}/.damophus-skill-backup-${Date.now()}`;
  let backedUp = false;
  try {
    await fileRequest("/api/file/globalCopyFiles", { srcs: [source], destDir: stageRoot });
    const entries = await fileRequest("/api/file/readDir", { path: stage }) as FileEntry[] | null;
    if (!entries?.some((entry) => entry.name === "SKILL.md" && !entry.isDir && !entry.isSymlink)) {
      throw new Error("The source was not copied as a real skill directory. Use the CLI with --materialize for symbolic-link sources.");
    }

    let installed: FileEntry[] | null = [];
    try {
      installed = await fileRequest("/api/file/readDir", { path: SKILLS_ROOT }) as FileEntry[] | null;
    } catch {
      // A first sync creates the skills directory when the staged source is moved.
    }
    if (installed?.some((entry) => entry.name === name)) {
      await fileRequest("/api/file/renameFile", { path: destination, newPath: backup });
      backedUp = true;
    }
    await fileRequest("/api/file/renameFile", { path: stage, newPath: destination });
    if (backedUp) await fileRequest("/api/file/removeFile", { path: backup });
    return { name };
  } catch (error) {
    if (backedUp) {
      try {
        let destinationExists = true;
        try {
          await fileRequest("/api/file/readDir", { path: destination });
        } catch {
          destinationExists = false;
        }
        if (!destinationExists) await fileRequest("/api/file/renameFile", { path: backup, newPath: destination });
      } catch {
        // Preserve the original error; the backup remains available for recovery.
      }
    }
    throw error;
  } finally {
    await fileRequest("/api/file/removeFile", { path: stageRoot }).catch(() => undefined);
  }
}

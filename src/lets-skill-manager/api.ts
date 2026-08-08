import { fetchSyncPost } from "siyuan";

export interface SkillSummary {
  name: string;
  description: string;
}

export interface SkillDocument {
  name: string;
  content: string;
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

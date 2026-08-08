import { randomUUID } from "node:crypto";
import { cp, lstat, mkdir, readFile, realpath, rename, rm, stat } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

const SKILLS_RELATIVE_PATH = join("data", "storage", "ai", "agent", "skills");
const VALID_SKILL_NAME = /^[^/\\.][^/\\]*$/u;

export interface SyncSkillOptions {
  source: string;
  workspace: string;
  name?: string;
  materialize?: boolean;
}

export interface SyncSkillResult {
  name: string;
  source: string;
  destination: string;
  materialized: boolean;
}

function isWithin(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!isAbsolute(rel) && !rel.startsWith(`..${sep}`) && rel !== "..");
}

function validateSkillName(name: string): void {
  if (!VALID_SKILL_NAME.test(name) || name === "..") throw new Error(`Invalid skill name: ${name}`);
}

async function assertMaterialized(path: string): Promise<void> {
  const entry = await lstat(path);
  if (entry.isSymbolicLink()) throw new Error(`Materialized skill still contains a symbolic link: ${path}`);
  if (!entry.isDirectory()) return;
  const { opendir } = await import("node:fs/promises");
  const directory = await opendir(path);
  for await (const child of directory) await assertMaterialized(join(path, child.name));
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

export async function syncSkill(options: SyncSkillOptions): Promise<SyncSkillResult> {
  const source = resolve(options.source);
  const workspace = resolve(options.workspace);
  const sourceInfo = await stat(source).catch(() => undefined);
  if (!sourceInfo?.isDirectory()) throw new Error(`Skill source is not a directory: ${source}`);

  const name = options.name?.trim() || basename(source);
  validateSkillName(name);

  const skillsRoot = join(workspace, SKILLS_RELATIVE_PATH);
  await mkdir(skillsRoot, { recursive: true });
  const resolvedSkillsRoot = await realpath(skillsRoot);
  const resolvedSource = await realpath(source);
  if (isWithin(resolvedSkillsRoot, resolvedSource)) {
    throw new Error("Skill source must be outside SiYuan's installed skills directory");
  }

  const token = randomUUID();
  const staging = join(skillsRoot, `.damophus-${name}-${token}.tmp`);
  const backup = join(skillsRoot, `.damophus-${name}-${token}.bak`);
  const destination = join(skillsRoot, name);
  let movedOriginal = false;

  try {
    const copySource = options.materialize ? resolvedSource : source;
    await cp(copySource, staging, {
      recursive: true,
      force: false,
      errorOnExist: true,
      dereference: options.materialize === true,
      preserveTimestamps: true,
    });
    const skillFile = join(staging, "SKILL.md");
    const skillInfo = await stat(skillFile).catch(() => undefined);
    if (!skillInfo?.isFile()) throw new Error(`Skill source does not contain SKILL.md: ${source}`);
    await readFile(skillFile, "utf8");
    if (options.materialize) await assertMaterialized(staging);

    if (await pathExists(destination)) {
      await rename(destination, backup);
      movedOriginal = true;
    }
    await rename(staging, destination);
    if (movedOriginal) await rm(backup, { recursive: true, force: true });
  } catch (error) {
    await rm(staging, { recursive: true, force: true }).catch(() => undefined);
    if (movedOriginal && !await pathExists(destination) && await pathExists(backup)) {
      await mkdir(dirname(destination), { recursive: true });
      await rename(backup, destination).catch(() => undefined);
    }
    throw error;
  }

  return {
    name,
    source: isAbsolute(options.source) ? options.source : source,
    destination,
    materialized: options.materialize === true,
  };
}

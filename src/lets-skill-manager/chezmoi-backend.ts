export type SkillSyncBackend = "chezmoi" | "builtin";

export interface ChezmoiSyncOptions {
  command: string;
  sourceRoot: string;
  destinationRoot: string;
  skillNames: string[];
}

export type ChezmoiExecutor = (command: string, args: string[]) => Promise<void>;

function sourcePath(sourceRoot: string, skillName: string): string {
  if (!skillName || /[\\/]/u.test(skillName)) throw new Error(`Invalid skill name: ${skillName}`);
  const separator = sourceRoot.includes("\\") ? "\\" : "/";
  return `${sourceRoot.replace(/[\\/]+$/u, "")}${separator}${skillName}`;
}

export function buildChezmoiArguments(
  operation: "apply" | "verify",
  options: ChezmoiSyncOptions,
): string[] {
  const args = [
    "--source",
    options.sourceRoot,
    "--destination",
    options.destinationRoot,
    "--mode",
    "file",
    "--source-path",
  ];
  if (operation === "apply") args.push("--force", "--no-tty");
  args.push(operation, ...options.skillNames.map((name) => sourcePath(options.sourceRoot, name)));
  return args;
}

function runtimeRequire(): ((id: string) => unknown) | undefined {
  const runtime = globalThis as typeof globalThis & {
    require?: (id: string) => unknown;
    window?: { require?: (id: string) => unknown };
  };
  return runtime.window?.require ?? runtime.require;
}

const executeChezmoi: ChezmoiExecutor = (command, args) => new Promise((resolve, reject) => {
  const require = runtimeRequire();
  if (!require) {
    reject(new Error(
      "ChezMoi synchronization requires SiYuan Desktop. Switch the synchronization backend to built-in copy on this platform.",
    ));
    return;
  }

  try {
    const childProcess = require("node:child_process") as {
      execFile: (
        file: string,
        fileArgs: string[],
        options: { windowsHide: boolean; maxBuffer: number },
        callback: (error: Error | null, stdout: string, stderr: string) => void,
      ) => void;
    };
    childProcess.execFile(command, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, _stdout, stderr) => {
      if (!error) {
        resolve();
        return;
      }
      const detail = stderr.trim() || error.message;
      reject(new Error(
        `ChezMoi synchronization failed: ${detail}. Install ChezMoi or switch the synchronization backend to built-in copy.`,
      ));
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    reject(new Error(
      `Unable to start ChezMoi: ${detail}. Switch the synchronization backend to built-in copy on this platform.`,
    ));
  }
});

export async function syncSkillsWithChezmoi(
  options: ChezmoiSyncOptions,
  executor: ChezmoiExecutor = executeChezmoi,
): Promise<void> {
  if (!options.skillNames.length) return;
  if (!options.destinationRoot.trim()) throw new Error("SiYuan workspace directory is unavailable");
  const command = options.command.trim() || "chezmoi";
  await executor(command, buildChezmoiArguments("apply", options));
  await executor(command, buildChezmoiArguments("verify", options));
}

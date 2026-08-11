import { reportSkillSync, type SkillSyncReporter } from "./operation-log";

export type SkillSyncBackend = "chezmoi" | "builtin";

export interface ChezmoiSyncOptions {
  command: string;
  sourceRoot: string;
  destinationRoot: string;
  skillNames: string[];
  onLog?: SkillSyncReporter;
}

export interface ChezmoiExecutionResult {
  stdout: string;
  stderr: string;
}

export type ChezmoiExecutor = (
  command: string,
  args: string[],
) => Promise<ChezmoiExecutionResult | void>;

function targetPath(destinationRoot: string, skillName: string): string {
  if (!skillName || /[\\/]/u.test(skillName)) throw new Error(`Invalid skill name: ${skillName}`);
  const separator = destinationRoot.includes("\\") ? "\\" : "/";
  return `${destinationRoot.replace(/[\\/]+$/u, "")}${separator}${skillName}`;
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
  ];
  if (operation === "apply") args.push("--force", "--no-tty");
  args.push(operation, ...options.skillNames.map((name) => targetPath(options.destinationRoot, name)));
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
    childProcess.execFile(command, args, { windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (!error) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = [stderr.trim(), stdout.trim(), error.message].filter(Boolean).join("\n");
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
  await runChezmoiStage("apply", command, options, executor);
  await runChezmoiStage("verify", command, options, executor);
}

async function runChezmoiStage(
  operation: "apply" | "verify",
  command: string,
  options: ChezmoiSyncOptions,
  executor: ChezmoiExecutor,
): Promise<void> {
  const args = buildChezmoiArguments(operation, options);
  const startedAt = performance.now();
  reportSkillSync(options.onLog, {
    level: "info",
    stage: operation,
    message: `ChezMoi ${operation} started`,
    detail: [command, ...args].join(" "),
  });
  try {
    const output = await executor(command, args);
    const detail = output
      ? [output.stdout.trim(), output.stderr.trim()].filter(Boolean).join("\n")
      : "";
    reportSkillSync(options.onLog, {
      level: "success",
      stage: operation,
      message: `ChezMoi ${operation} completed in ${Math.round(performance.now() - startedAt)} ms`,
      ...(detail ? { detail } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    reportSkillSync(options.onLog, {
      level: "error",
      stage: operation,
      message: `ChezMoi ${operation} failed in ${Math.round(performance.now() - startedAt)} ms`,
      detail: message,
    });
    throw error;
  }
}

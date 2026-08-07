import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";

const [, , entry, ...args] = process.argv;
if (!entry) throw new Error("Usage: node scripts/run-ts.mjs <entry.ts> [...args]");

const entryPath = resolve(process.cwd(), entry);
const tempDir = await mkdtemp(`${tmpdir()}/damophus-ts-`);
const outfile = resolve(tempDir, "entry.mjs");

try {
  await build({
    entryPoints: [entryPath],
    bundle: true,
    outfile,
    platform: "node",
    format: "esm",
    target: "node20",
    sourcemap: "inline",
    logLevel: "warning",
  });

  const exitCode = await new Promise((resolveExit) => {
    const child = spawn(process.execPath, [outfile, ...args], {
      stdio: "inherit",
      env: process.env,
    });
    child.on("error", (error) => {
      console.error(error);
      resolveExit(1);
    });
    child.on("exit", (code, signal) => resolveExit(code ?? (signal ? 1 : 0)));
  });
  process.exitCode = exitCode;
} finally {
  await rm(dirname(outfile), {recursive: true, force: true});
}

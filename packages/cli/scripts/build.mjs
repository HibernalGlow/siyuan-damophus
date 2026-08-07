import { chmod, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outfile = resolve(root, "dist/index.js");

await mkdir(dirname(outfile), { recursive: true });
await build({
  entryPoints: [resolve(root, "src/index.ts")],
  outfile,
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  banner: { js: "#!/usr/bin/env node" },
  sourcemap: true,
});
await chmod(outfile, 0o755);

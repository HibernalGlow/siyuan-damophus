import path from "node:path";
import process from "node:process";
import {
  access,
  cp,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
} from "node:fs/promises";

const pluginName = "siyuan-damophus";
const sourceDir = path.resolve("dist");

function workspaceArgument() {
  const args = process.argv.slice(2);
  const optionIndex = args.indexOf("--workspace");
  if (optionIndex >= 0) return args[optionIndex + 1];
  return args.find((argument) => !argument.startsWith("--"));
}

function resolveWorkspace() {
  const explicit = workspaceArgument() || process.env.SIYUAN_TEST_WORKSPACE;
  if (explicit) return path.resolve(explicit);
  return path.resolve("ref", "siyuan-e2e-workspace");
}

async function validateSource() {
  const manifest = JSON.parse(await readFile(path.join(sourceDir, "plugin.json"), "utf8"));
  if (manifest.name !== pluginName) {
    throw new Error(`dist/plugin.json names '${manifest.name}', expected '${pluginName}'`);
  }
  for (const name of ["index.js", "index.css", "plugin.json", "icon.png", "preview.png", "README.md"]) {
    const file = await stat(path.join(sourceDir, name));
    if (!file.isFile() || file.size === 0) throw new Error(`dist/${name} is missing or empty`);
  }
}

async function main() {
  await validateSource();
  const workspace = resolveWorkspace();
  const pluginsDir = path.resolve(workspace, "data", "plugins");
  await access(pluginsDir);

  const targetDir = path.resolve(pluginsDir, pluginName);
  if (path.dirname(targetDir) !== pluginsDir || path.basename(targetDir) !== pluginName) {
    throw new Error(`Refusing unexpected deployment target: ${targetDir}`);
  }

  const suffix = `${process.pid}-${Date.now()}`;
  const stagingDir = path.join(pluginsDir, `.${pluginName}.deploy-${suffix}`);
  const backupDir = path.join(pluginsDir, `.${pluginName}.backup-${suffix}`);
  await mkdir(stagingDir, { recursive: false });
  let movedExisting = false;
  try {
    await cp(sourceDir, stagingDir, { recursive: true, force: true });
    try {
      await rename(targetDir, backupDir);
      movedExisting = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    await rename(stagingDir, targetDir);
    if (movedExisting) await rm(backupDir, { recursive: true, force: true });
  } catch (error) {
    await rm(stagingDir, { recursive: true, force: true });
    if (movedExisting) {
      try {
        await rename(backupDir, targetDir);
      } catch (restoreError) {
        throw new Error(
          `Deployment failed and backup restore failed: ${String(error)}; ${String(restoreError)}`,
        );
      }
    }
    throw error;
  }

  console.log(`Deployed ${pluginName} to ${targetDir}`);
  console.log("Reload SiYuan to activate the new build.");
}

await main();

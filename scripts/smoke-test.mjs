import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const expected = {
  id: "siyuan-damophus",
  displayName: "Damophus",
  repository: "https://github.com/HibernalGlow/siyuan-damophus",
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const [packageJson, pluginJson, entrySource, registrySource] = await Promise.all([
  readJson("package.json"),
  readJson("plugin.json"),
  readFile("src/index.ts", "utf8"),
  readFile("src/plugin-registry.ts", "utf8"),
]);

assert.equal(packageJson.name, expected.id);
assert.equal(packageJson.repository, expected.repository);
assert.equal(pluginJson.name, expected.id);
assert.equal(pluginJson.url, expected.repository);
assert.equal(pluginJson.displayName.default, expected.displayName);
assert.equal(pluginJson.displayName["zh-CN"], expected.displayName);
assert.match(entrySource, /_name\s*=\s*["']siyuan-damophus["']/);
assert.match(entrySource, /new Menu\(["']siyuan-damophus-topbar["']\)/);
assert.match(
  registrySource,
  /import\.meta\.glob\([\s\S]*\.\/lets-\*\/index\.ts[\s\S]*\.\/lets-\*\/plugin\.ts/,
);

console.log("Damophus identity and plugin registry smoke checks passed.");

import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";

const expected = {
  id: "siyuan-damophus",
  displayName: "Damophus",
  repository: "https://github.com/HibernalGlow/siyuan-damophus",
};

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

const [
  packageJson,
  pluginJson,
  entrySource,
  registrySource,
  blockAttrMetadataSource,
  sourceEntries,
] = await Promise.all([
  readJson("package.json"),
  readJson("plugin.json"),
  readFile("src/index.ts", "utf8"),
  readFile("src/plugin-registry.ts", "utf8"),
  readFile("src/lets-block-attr/plugin.ts", "utf8"),
  readdir("src", { withFileTypes: true }),
]);

const expectedModules = [
  "lets-agent-bridge",
  "lets-agent-surface",
  "lets-ai-config-sync",
  "lets-animated-image-replay",
  "lets-block-attr",
  "lets-block-drag-performance",
  "lets-callout-appearance",
  "lets-kramdown-export",
  "lets-layout-actions",
  "lets-legacy-block-selection",
  "lets-list-merge",
  "lets-mobile-appearance",
  "lets-mobile-breadcrumb",
  "lets-mobile-liquid-glass",
  "lets-question-bank",
  "lets-selection-highlight",
  "lets-skill-manager",
  "lets-style-brush",
  "lets-table-fit",
  "lets-topic-dictionary",
  "lets-topic-relations",
];

assert.equal(packageJson.name, expected.id);
assert.equal(packageJson.repository, expected.repository);
assert.equal(pluginJson.name, expected.id);
assert.equal(pluginJson.url, expected.repository);
assert.equal(pluginJson.displayName.default, expected.displayName);
assert.equal(pluginJson.displayName["zh-CN"], expected.displayName);
assert.match(entrySource, /new Menu\(["']siyuan-damophus-topbar["']\)/);
assert.match(blockAttrMetadataSource, /enabled:\s*true/);
assert.match(
  registrySource,
  /import\.meta\.glob\([\s\S]*\.\/lets-\*\/index\.ts[\s\S]*\.\/lets-\*\/plugin\.ts/,
);
assert.deepEqual(
  sourceEntries
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("lets-"))
    .map((entry) => entry.name)
    .sort(),
  expectedModules,
);

console.log("Damophus identity, focused module scope, and plugin registry smoke checks passed.");

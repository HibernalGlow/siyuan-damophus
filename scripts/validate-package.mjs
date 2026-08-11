import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";

const requiredFiles = [
  "dist/index.js",
  "dist/index.css",
  "dist/plugin.json",
  "dist/icon.png",
  "dist/preview.png",
  "dist/README.md",
  "dist/assets/readme/hero.svg",
  "dist/assets/readme/mobile-experience.svg",
  "dist/assets/readme/workflow.svg",
  "dist/assets/readme/screenshots/desktop-practice.png",
  "package.zip",
];

for (const path of requiredFiles) {
  const file = await stat(path);
  assert(file.isFile(), `${path} must be a file`);
  assert(file.size > 0, `${path} must not be empty`);
}

const [sourceManifest, packagedManifest] = await Promise.all([
  readFile("plugin.json", "utf8").then(JSON.parse),
  readFile("dist/plugin.json", "utf8").then(JSON.parse),
]);
assert.deepEqual(packagedManifest, sourceManifest);
assert.equal(packagedManifest.name, "siyuan-damophus");
assert.equal(packagedManifest.url, "https://github.com/HibernalGlow/siyuan-damophus");
const [pluginJavaScript, pluginCss] = await Promise.all([
  readFile("dist/index.js", "utf8"),
  readFile("dist/index.css", "utf8"),
]);
assert.match(pluginJavaScript, /question-bank/);

for (const [path, contents] of [["dist/index.js", pluginJavaScript], ["dist/index.css", pluginCss]]) {
  assert.doesNotMatch(
    contents,
    /:has\(/u,
    `${path} must not contain :has(); global relational selectors cause whole-document style invalidation in SiYuan`,
  );
}

console.log("Damophus package structure and manifest checks passed.");

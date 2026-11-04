import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

const settings = read(".vscode/settings.json");
const customData = settings["html.customData"] ?? [];
assert.deepEqual(customData.filter((entry) => /packages\/sparkle\//.test(entry)), [], "VS Code must not load Sparkle HTML custom data");
for (const entry of customData) assert.ok(fs.existsSync(path.join(root, entry)), `html.customData names a missing file: ${entry}`);

const sparkle = read("packages/sparkle/package.json");
assert.equal(sparkle.scripts?.extract, undefined, "Sparkle must not declare the retired extract script");
assert.equal(sparkle.devDependencies?.["@custom-elements-manifest/analyzer"], undefined, "Sparkle must not depend on the custom elements analyzer");
assert.equal(fs.existsSync(path.join(root, "packages/sparkle/vscode.html-custom-data.json")), false, "the stale Sparkle custom data file must stay deleted");

console.log("sparkle-custom-data-retired: ok");

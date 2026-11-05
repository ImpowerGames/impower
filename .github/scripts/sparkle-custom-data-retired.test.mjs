import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

const settings = read(".vscode/settings.json");
const customData = settings["html.customData"] ?? [];
assert.deepEqual(customData.filter((entry) => /packages\/sparkle\//.test(entry)), [], "VS Code must not load Sparkle HTML custom data");
for (const entry of customData) assert.ok(fs.existsSync(path.join(root, entry)), `html.customData names a missing file: ${entry}`);

console.log("sparkle-custom-data-retired: ok");

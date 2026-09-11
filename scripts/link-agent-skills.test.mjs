import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { linkAgentSkills, toolDirectories } from "./link-agent-skills.mjs";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-links-"));
console.log(`Scratch repository: ${scratch}`);
spawnSync("git", ["init", scratch], { windowsHide: true });
const source = path.join(scratch, ".agents", "skills");
fs.mkdirSync(source, { recursive: true });
fs.writeFileSync(path.join(source, "sentinel"), "preserve");
const first = linkAgentSkills(scratch);
const before = first.map(({ destination }) => fs.lstatSync(destination).mtimeMs);
assert.deepEqual(linkAgentSkills(scratch), first);
assert.deepEqual(first.map(({ destination }) => fs.lstatSync(destination).mtimeMs), before);
for (const { destination } of first) {
  assert.ok(fs.lstatSync(destination).isSymbolicLink());
  assert.equal(fs.readFileSync(path.join(destination, "sentinel"), "utf8"), "preserve");
}
// Unlink only, without a trailing separator or recursive removal.
for (const { destination } of first) fs.unlinkSync(destination);
assert.equal(fs.readFileSync(path.join(source, "sentinel"), "utf8"), "preserve");
const blocked = path.join(scratch, toolDirectories.at(-1), "skills");
fs.mkdirSync(blocked);
fs.writeFileSync(path.join(blocked, "precious"), "keep");
assert.throws(() => linkAgentSkills(scratch), /Refusing populated/);
assert.ok(!fs.existsSync(path.join(scratch, toolDirectories[0], "skills")), "preflight must refuse before creating any links");
assert.equal(fs.readFileSync(path.join(blocked, "precious"), "utf8"), "keep");
fs.unlinkSync(path.join(blocked, "precious"));
linkAgentSkills(scratch);
for (const { destination } of first) fs.unlinkSync(destination);
fs.symlinkSync(source, path.join(scratch, ".claude", "skills"), process.platform === "win32" ? "junction" : "dir");
fs.unlinkSync(path.join(scratch, ".claude", "skills"));
const foreign = fs.mkdtempSync(path.join(os.tmpdir(), "impower-foreign-"));
fs.writeFileSync(path.join(foreign, "precious"), "keep");
fs.symlinkSync(foreign, path.join(scratch, ".claude", "skills"), process.platform === "win32" ? "junction" : "dir");
assert.throws(() => linkAgentSkills(scratch), /Refusing foreign/);
assert.equal(fs.readFileSync(path.join(foreign, "precious"), "utf8"), "keep");
fs.unlinkSync(path.join(scratch, ".claude", "skills"));
// Exercise the actual postinstall entry point in a dependency-free fresh clone shape.
fs.mkdirSync(path.join(scratch, "scripts"));
fs.copyFileSync(fileURLToPath(new URL("./link-agent-skills.mjs", import.meta.url)), path.join(scratch, "scripts", "link-agent-skills.mjs"));
fs.writeFileSync(path.join(scratch, "package.json"), JSON.stringify({ private: true, scripts: { postinstall: "node scripts/link-agent-skills.mjs" } }));
const install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock=false", "--ignore-scripts=false", "--no-audit", "--no-fund"], { cwd: scratch, encoding: "utf8", shell: process.platform === "win32", windowsHide: true });
assert.equal(install.status, 0, install.stdout + install.stderr);
assert.equal(fs.realpathSync(path.join(scratch, ".claude", "skills")), source);
console.log("PASS: installer, idempotence, populated-directory refusal, foreign-link preservation and npm postinstall");
// Leave printed scratch evidence available; never recursively remove junction trees.

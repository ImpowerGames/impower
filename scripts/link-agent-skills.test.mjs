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
assert.deepEqual(linkAgentSkills(scratch).map(({ action, ...rest }) => rest), first.map(({ action, ...rest }) => rest));
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
assert.throws(() => linkAgentSkills(scratch, { repairLinks: true }), /Refusing populated/, "repair never replaces a populated real directory");
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
const repaired = linkAgentSkills(scratch, { repairLinks: true });
assert.equal(repaired[0].action, "repair");
assert.ok(repaired[0].previousTarget.includes("impower-foreign-"));
assert.equal(fs.readFileSync(path.join(foreign, "precious"), "utf8"), "keep", "repair unlinks entries, not their targets");
// Exercise the actual postinstall entry point in a dependency-free fresh clone shape.
fs.mkdirSync(path.join(scratch, "scripts"));
fs.copyFileSync(fileURLToPath(new URL("./link-agent-skills.mjs", import.meta.url)), path.join(scratch, "scripts", "link-agent-skills.mjs"));
const postinstall = JSON.parse(fs.readFileSync(new URL("../package.json", import.meta.url), "utf8")).scripts.postinstall;
fs.writeFileSync(path.join(scratch, "package.json"), JSON.stringify({ private: true, scripts: { postinstall } }));
const install = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock=false", "--ignore-scripts=false", "--no-audit", "--no-fund"], { cwd: scratch, encoding: "utf8", shell: process.platform === "win32", windowsHide: true });
assert.equal(install.status, 0, install.stdout + install.stderr);
assert.equal(fs.realpathSync(path.join(scratch, ".claude", "skills")), source);
console.log("PASS: installer, idempotence, populated-directory refusal, foreign-link preservation and npm postinstall");
const moved = scratch + "-moved";
assert.equal(path.dirname(path.resolve(moved)), path.dirname(path.resolve(scratch)));
console.log(`Scratch relocation: ${scratch} -> ${moved}`);
fs.renameSync(scratch, moved);
const relocation = linkAgentSkills(moved, { repairLinks: true });
assert.ok(relocation.every((row) => row.action === (process.platform === "win32" ? "repair" : "exists")));
assert.equal(fs.readFileSync(path.join(moved, ".claude", "skills", "sentinel"), "utf8"), "preserve");
assert.equal(fs.readFileSync(path.join(foreign, "precious"), "utf8"), "keep");
console.log("PASS: Windows relocation repairs junctions; POSIX relative links survive relocation; targets are preserved");
const dangling = path.join(moved, ".claude", "skills");
fs.unlinkSync(dangling);
fs.symlinkSync(path.join(moved, "missing-target"), dangling, process.platform === "win32" ? "junction" : "dir");
assert.equal(linkAgentSkills(moved, { repairLinks: true })[0].action, "repair", "explicit dangling links must be repaired on both platforms");
const realpath = fs.realpathSync;
try {
  fs.realpathSync = (file, ...args) => { if (file === dangling) throw Object.assign(new Error("unavailable"), { code: "EACCES" }); return realpath(file, ...args); };
  assert.throws(() => linkAgentSkills(moved, { repairLinks: true }), /Cannot resolve link/);
} finally { fs.realpathSync = realpath; }
assert.equal(fs.readFileSync(path.join(dangling, "sentinel"), "utf8"), "preserve");
console.log(`Scratch repair failure: ${moved}; foreign target: ${foreign}`);
for (const tool of toolDirectories) { const leaf = path.join(moved, tool, "skills"); fs.unlinkSync(leaf); fs.symlinkSync(foreign, leaf, process.platform === "win32" ? "junction" : "dir"); }
const symlink = fs.symlinkSync;
let recovery;
try {
  fs.symlinkSync = (target, leaf, ...args) => { if (leaf === path.join(moved, ".codex", "skills")) throw new Error("injected creation failure"); return symlink(target, leaf, ...args); };
  assert.throws(() => linkAgentSkills(moved, { repairLinks: true, reportPlan: (plans) => { recovery = plans; assert.equal(realpath(dangling), realpath(foreign), "recovery report must precede the first unlink"); } }), /injected creation failure/);
} finally { fs.symlinkSync = symlink; }
assert.equal(recovery.length, 3);
assert.ok(recovery.every((row) => row.action === "repair" && row.previousTarget.includes("impower-foreign-")));
assert.equal(fs.readFileSync(path.join(foreign, "precious"), "utf8"), "keep");
console.log("PASS: dangling-link repair, unexpected-resolution refusal and pre-mutation recovery records survive partial creation failure");
// Leave printed scratch evidence available; never recursively remove junction trees.

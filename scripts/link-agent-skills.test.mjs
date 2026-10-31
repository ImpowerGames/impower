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
const taskSkill = fs.readFileSync(new URL("../.agents/skills/file-task/SKILL.md", import.meta.url), "utf8");
fs.mkdirSync(path.join(source, "file-task"));
fs.writeFileSync(path.join(source, "file-task", "SKILL.md"), taskSkill);
for (const { destination } of first) {
  const discovered = path.join(destination, "file-task", "SKILL.md");
  assert.equal(fs.readFileSync(discovered, "utf8"), taskSkill);
  assert.equal(fs.realpathSync(discovered), fs.realpathSync(path.join(source, "file-task", "SKILL.md")));
}
console.log("PASS: canonical file-task is discoverable through all existing harness links");
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
const movedSource = path.join(moved, ".agents", "skills");
assert.ok(linkAgentSkills(moved, { repairLinks: true }).every((row) => fs.realpathSync(row.destination) === fs.realpathSync(movedSource)), "the three links are in place before the per-skill case");
const perSkill = path.join(moved, ".claude", "skills");
const skillLink = (name) => fs.symlinkSync(path.join(moved, ".agents", "skills", name), path.join(perSkill, name), process.platform === "win32" ? "junction" : "dir");
fs.unlinkSync(perSkill);
fs.mkdirSync(perSkill);
skillLink("file-task");
skillLink("renamed-away");
assert.throws(() => linkAgentSkills(moved), /Refusing directory of links: .*holds only links \(file-task, renamed-away\).*run node scripts\/link-agent-skills\.mjs --repair-links from this checkout/);
assert.ok(fs.lstatSync(path.join(perSkill, "renamed-away")).isSymbolicLink(), "the default run changes nothing");
assert.ok(!fs.existsSync(path.join(perSkill, "renamed-away")), "the renamed skill's link dangles");
const perSkillRepair = linkAgentSkills(moved, { repairLinks: true }).find((row) => row.destination === perSkill);
assert.equal(perSkillRepair.action, "repair");
assert.deepEqual(Object.keys(perSkillRepair.previousTarget).sort(), ["file-task", "renamed-away"], "the recovery record keeps each entry's raw target");
for (const tool of toolDirectories) {
  const leaf = path.join(moved, tool, "skills");
  assert.ok(fs.lstatSync(leaf).isSymbolicLink(), `${tool}/skills is the shared link`);
  assert.equal(fs.realpathSync(leaf), fs.realpathSync(movedSource));
  assert.equal(fs.readFileSync(path.join(leaf, "file-task", "SKILL.md"), "utf8"), taskSkill, `${tool} resolves the existing skill`);
  assert.ok(!fs.existsSync(path.join(leaf, "renamed-away")), `${tool} holds nothing for the renamed skill`);
}
assert.equal(fs.readFileSync(path.join(movedSource, "file-task", "SKILL.md"), "utf8"), taskSkill, "the targets are untouched");
fs.unlinkSync(perSkill);
fs.mkdirSync(perSkill);
skillLink("renamed-away");
fs.writeFileSync(path.join(perSkill, "notes.md"), "mine");
assert.throws(() => linkAgentSkills(moved), /Refusing populated/);
assert.throws(() => linkAgentSkills(moved, { repairLinks: true }), /Refusing populated/, "a file beside the links is data the repair never removes");
assert.equal(fs.readFileSync(path.join(perSkill, "notes.md"), "utf8"), "mine");
assert.ok(fs.lstatSync(path.join(perSkill, "renamed-away")).isSymbolicLink());
console.log("PASS: a directory of per-skill links, one dangling after a rename, is refused with the repair command named and replaced by the shared links under --repair-links");

const copyCase = fs.mkdtempSync(path.join(os.tmpdir(), "impower-copy-"));
console.log(`Scratch copied-skills repository: ${copyCase}`);
assert.equal(spawnSync("git", ["init", copyCase], { windowsHide: true }).status, 0);
const canonical = path.join(copyCase, ".agents", "skills");
const copied = path.join(copyCase, ".claude", "skills");
fs.mkdirSync(path.join(canonical, "example"), { recursive: true });
fs.writeFileSync(path.join(canonical, "example", "SKILL.md"), "current\ncontent\n");
fs.cpSync(canonical, copied, { recursive: true });
fs.writeFileSync(path.join(copied, "example", "SKILL.md"), "current\r\ncontent\r\n");
const backupParent = fs.mkdtempSync(path.join(os.tmpdir(), "impower-copy-backups-"));
console.log(`Scratch copy backups: ${backupParent}`);
assert.throws(() => linkAgentSkills(copyCase), /Refusing/);
const adopted = linkAgentSkills(copyCase, { adoptCopy: backupParent });
assert.equal(adopted[0].action, "adopt");
assert.equal(fs.readFileSync(path.join(adopted[0].backup, "example", "SKILL.md"), "utf8"), "current\r\ncontent\r\n");
assert.ok(adopted.every((row) => fs.realpathSync(row.destination) === fs.realpathSync(canonical)));
fs.unlinkSync(copied);
fs.cpSync(canonical, copied, { recursive: true });
fs.writeFileSync(path.join(copied, "example", "SKILL.md"), "stale content");
const stale = linkAgentSkills(copyCase, { adoptCopy: backupParent });
assert.equal(fs.readFileSync(path.join(stale[0].backup, "example", "SKILL.md"), "utf8"), "stale content");
assert.notEqual(stale[0].backup, adopted[0].backup);
fs.unlinkSync(copied);
fs.cpSync(canonical, copied, { recursive: true });
fs.writeFileSync(path.join(copied, "personal.md"), "mine");
assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent }), /Refusing populated/);
assert.equal(fs.readFileSync(path.join(copied, "personal.md"), "utf8"), "mine");
fs.unlinkSync(path.join(copied, "personal.md"));
fs.unlinkSync(path.join(copied, "example", "SKILL.md"));
fs.linkSync(path.join(canonical, "example", "SKILL.md"), path.join(copied, "example", "SKILL.md"));
assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent }), /Refusing populated/);
fs.unlinkSync(path.join(copied, "example", "SKILL.md"));
fs.symlinkSync(canonical, path.join(copied, "example", "linked"), process.platform === "win32" ? "junction" : "dir");
assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent }), /Refusing populated/);
assert.equal(fs.readFileSync(path.join(canonical, "example", "SKILL.md"), "utf8"), "current\ncontent\n");
fs.unlinkSync(path.join(copied, "example", "linked"));
fs.writeFileSync(path.join(copied, "example", "SKILL.md"), "stale content");
for (const name of [".state.json", ".state.json.tmp", ".chrome-profile"]) {
  const localArtifact = path.join(copied, "example", name);
  const sharedArtifact = path.join(canonical, "example", name);
  if (name === ".chrome-profile") {
    fs.mkdirSync(localArtifact);
    fs.mkdirSync(sharedArtifact);
    fs.writeFileSync(path.join(localArtifact, "profile"), "local profile");
    fs.writeFileSync(path.join(sharedArtifact, "profile"), "canonical profile");
  } else {
    fs.writeFileSync(localArtifact, "local state");
    fs.writeFileSync(sharedArtifact, "canonical state");
  }
  const beforeBackups = fs.readdirSync(backupParent);
  assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent }), /Refusing populated/);
  assert.deepEqual(fs.readdirSync(backupParent), beforeBackups);
  assert.ok(fs.lstatSync(copied).isDirectory());
  const localData = name === ".chrome-profile" ? path.join(localArtifact, "profile") : localArtifact;
  const sharedData = name === ".chrome-profile" ? path.join(sharedArtifact, "profile") : sharedArtifact;
  assert.equal(fs.readFileSync(localData, "utf8"), name === ".chrome-profile" ? "local profile" : "local state");
  assert.equal(fs.readFileSync(sharedData, "utf8"), name === ".chrome-profile" ? "canonical profile" : "canonical state");
  fs.unlinkSync(localData);
  fs.unlinkSync(sharedData);
  if (name === ".chrome-profile") { fs.rmdirSync(localArtifact); fs.rmdirSync(sharedArtifact); }
}
const lstat = fs.lstatSync;
try {
  fs.lstatSync = (file, ...args) => {
    const stat = lstat(file, ...args);
    return file === path.join(copied, "example", "SKILL.md") ? Object.assign(Object.create(stat), { isFile: () => false }) : stat;
  };
  assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent }), /Refusing populated/);
} finally { fs.lstatSync = lstat; }
assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent, reportPlan: () => fs.writeFileSync(path.join(copied, "example", "SKILL.md"), "changed while planning") }), /changed during planning/);
assert.equal(fs.readFileSync(path.join(copied, "example", "SKILL.md"), "utf8"), "changed while planning");
fs.writeFileSync(path.join(copied, "example", "SKILL.md"), "stale content");
assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: copyCase }), /outside the checkout/);
const backupLink = path.join(backupParent, "linked-parent");
fs.symlinkSync(backupParent, backupLink, process.platform === "win32" ? "junction" : "dir");
assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupLink }), /unsafe backup parent/);
fs.unlinkSync(backupLink);
let failedPlan;
try {
  fs.symlinkSync = () => { throw new Error("injected adoption creation failure"); };
  assert.throws(() => linkAgentSkills(copyCase, { adoptCopy: backupParent, reportPlan: (plans) => { failedPlan = plans; assert.ok(fs.existsSync(copied)); } }), /injected adoption creation failure/);
} finally { fs.symlinkSync = symlink; }
assert.equal(fs.readFileSync(path.join(failedPlan[0].backup, "example", "SKILL.md"), "utf8"), "stale content");
assert.ok(!fs.existsSync(copied));
linkAgentSkills(copyCase);
fs.unlinkSync(copied);
fs.cpSync(canonical, copied, { recursive: true });
fs.writeFileSync(path.join(copied, "example", "SKILL.md"), "stale CLI content");
fs.mkdirSync(path.join(copyCase, "scripts"));
fs.copyFileSync(fileURLToPath(new URL("./link-agent-skills.mjs", import.meta.url)), path.join(copyCase, "scripts", "link-agent-skills.mjs"));
const cli = spawnSync(process.execPath, ["scripts/link-agent-skills.mjs", "--adopt-copy", backupParent], { cwd: copyCase, encoding: "utf8", windowsHide: true });
assert.equal(cli.status, 0, cli.stdout + cli.stderr);
const cliPlan = JSON.parse(cli.stdout.split("\n")[0]);
assert.equal(fs.readFileSync(path.join(cliPlan.plans[0].backup, "example", "SKILL.md"), "utf8"), "stale CLI content");
fs.writeFileSync(path.join(copyCase, "package.json"), JSON.stringify({ private: true, scripts: { postinstall } }));
const repairedInstall = spawnSync(process.platform === "win32" ? "npm.cmd" : "npm", ["install", "--package-lock=false", "--ignore-scripts=false", "--no-audit", "--no-fund"], { cwd: copyCase, encoding: "utf8", shell: process.platform === "win32", windowsHide: true });
assert.equal(repairedInstall.status, 0, repairedInstall.stdout + repairedInstall.stderr);
assert.ok(toolDirectories.every((tool) => fs.realpathSync(path.join(copyCase, tool, "skills")) === fs.realpathSync(canonical)));
console.log("PASS: normalized and stale copies are backed up intact; extra paths, hardlinks and nested links remain protected");
console.log("PASS: unsafe backup parents refused; planned backup survives creation failure; CLI adoption and subsequent npm postinstall succeed");
console.log("PASS: matching driver state/profile artifacts, injected special-file metadata and changed-during-planning copies are refused before replacement");

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { linkAgentSkills } from "../../scripts/link-agent-skills.mjs";
import { probeServers } from "./clean-worktrees/clean-worktrees.mjs";

const skills = path.dirname(fileURLToPath(import.meta.url));
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-linked-drivers-"));
console.log(`Scratch repository: ${scratch}`);
spawnSync("git", ["init", scratch], { windowsHide: true });
const shared = path.join(scratch, ".agents", "skills");
fs.mkdirSync(shared, { recursive: true });
for (const dir of ["drive-web-editor", "drive-vscode-web", "triage-skill-feedback"]) fs.cpSync(path.join(skills, dir), path.join(shared, dir), { recursive: true, filter: (src) => !src.includes(".chrome-profile") && !src.endsWith(".state.json") });
fs.mkdirSync(path.join(scratch, "vscode-sparkdown"));
fs.writeFileSync(path.join(scratch, "vscode-sparkdown", "package.json"), '{"publisher":"test","name":"test"}');
linkAgentSkills(scratch);
for (const driver of ["drive-web-editor", "drive-vscode-web"]) {
  // An unreadable state makes the path observable without launching or stopping processes.
  fs.writeFileSync(path.join(shared, driver, ".state.json"), "{");
  const runs = [".agents", ".claude", ".codex", ".github"].map((dir) => spawnSync(process.execPath, [path.join(scratch, dir, "skills", driver, "driver.mjs"), "status"], { cwd: scratch, encoding: "utf8", windowsHide: true }));
  assert.match(runs[0].stdout + runs[0].stderr, /state file unreadable/i);
  for (const result of runs.slice(1)) assert.deepEqual({ status: result.status, out: result.stdout, err: result.stderr }, { status: runs[0].status, out: runs[0].stdout, err: runs[0].stderr });
}
const calls = [];
const deps = { exists: fs.existsSync, exec: (exe, args) => { calls.push(args[0]); return { out: "down (no state file)", err: "" }; }, pidAlive: () => false };
probeServers(scratch, deps);
assert.equal(calls.length, 2, "linked drivers must not be probed twice");
const legacy = fs.mkdtempSync(path.join(os.tmpdir(), "impower-legacy-drivers-"));
console.log(`Scratch legacy repository: ${legacy}`);
const oldDriver = path.join(legacy, ".claude", "skills", "drive-web-editor", "driver.mjs");
fs.mkdirSync(path.dirname(oldDriver), { recursive: true });
fs.writeFileSync(oldDriver, "");
calls.length = 0;
probeServers(legacy, deps);
assert.deepEqual(calls, [oldDriver], "existing worktrees must retain driver discovery");
console.log("PASS: actual linked CLI dispatch and identical state paths; canonical deduplication and legacy discovery");
for (const driver of ["drive-web-editor", "drive-vscode-web"]) {
  const canonicalDriver = path.join(legacy, ".agents", "skills", driver);
  fs.cpSync(path.join(shared, driver), canonicalDriver, { recursive: true });
  fs.unlinkSync(path.join(canonicalDriver, ".state.json"));
  const state = path.join(legacy, ".claude", "skills", driver, ".state.json");
  fs.mkdirSync(path.dirname(state), { recursive: true });
  fs.writeFileSync(state, "{");
}
fs.mkdirSync(path.join(legacy, "vscode-sparkdown"));
fs.writeFileSync(path.join(legacy, "vscode-sparkdown", "package.json"), '{"publisher":"test","name":"test"}');
for (const driver of ["drive-web-editor", "drive-vscode-web"]) {
  const run = spawnSync(process.execPath, [path.join(legacy, ".agents", "skills", driver, "driver.mjs"), "status"], { cwd: legacy, encoding: "utf8", windowsHide: true });
  assert.match(run.stdout + run.stderr, /state file unreadable/i, driver + " must read existing-checkout state");
  assert.ok((run.stdout + run.stderr).includes(path.join(legacy, ".claude", "skills", driver, ".state.json")));
}
console.log("PASS: canonical commands retain both drivers' state during an existing-checkout migration");

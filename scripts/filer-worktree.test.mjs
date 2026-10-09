import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide } from "../.agents/hooks/policy.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "filer-1766-"));
console.log(`Scratch repository: ${scratch}`);
const main = path.join(scratch, "repo");
fs.mkdirSync(main);
function git(args, cwd = main) {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
}
git(["init", "-b", "main"]);
git(["config", "user.name", "Fixture"]);
git(["config", "user.email", "fixture@example.invalid"]);
fs.writeFileSync(path.join(main, ".gitignore"), "node_modules/\nignored.txt\n");
fs.writeFileSync(path.join(main, "tracked.txt"), "tracked sentinel\n");
git(["add", "."]);
git(["commit", "-m", "fixture"]);
git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
git(["symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main"]);
const external = path.join(scratch, "repo.worktrees", "external");
git(["worktree", "add", "-b", "external", external]);
fs.writeFileSync(path.join(external, "untracked.txt"), "untracked sentinel\n");
fs.writeFileSync(path.join(external, "ignored.txt"), "ignored sentinel\n");
const sentinels = ["tracked.txt", "untracked.txt", "ignored.txt"].map(name => [name, fs.readFileSync(path.join(external, name))]);
function preserved() { for (const [name, bytes] of sentinels) assert.deepEqual(fs.readFileSync(path.join(external, name)), bytes, name); }
const reproduction = path.join(scratch, "repo.worktrees", "borrowed-repro");
git(["worktree", "add", "-b", "repro-fixture", reproduction]);
fs.symlinkSync(external, path.join(reproduction, "node_modules"), process.platform === "win32" ? "junction" : "dir");
const command = `git worktree remove --force "${reproduction}"`;
const reason = decide({ kind: "shell", command, shell: "powershell", cwd: main });
preserved();
assert.ok(reason, "supported direct worktree removal must be refused before deletion");
console.log("PASS: direct cleanup refusal preserves external tracked, untracked and ignored sentinels");

const { create, install, checkLinks, remove, markerName } = await import("./filer-worktree.mjs");
const { decide: cleanup } = await import("../.agents/hooks/worktree-cleanup.mjs");
for (const command of [`Remove-Item -Recurse '${reproduction}/node_modules'`, `rm -rf '${reproduction}'`, `[IO.Directory]::Delete('${reproduction}', $true)`, `(Get-Item '${reproduction}/node_modules').Delete()`]) {
  assert.ok(cleanup(command, "powershell", main), command); preserved();
}
const alias = path.join(scratch, "checkout-alias");
fs.symlinkSync(reproduction, alias, process.platform === "win32" ? "junction" : "dir");
for (const target of [alias, `${alias}/node_modules/tracked.txt`]) {
  assert.ok(cleanup(`Remove-Item -LiteralPath '${target}' -Recurse -Force`, "powershell", main), "filesystem alias traversal must refuse"); preserved();
}
fs.unlinkSync(alias);
for (const [command, shell] of [["Write-Output 'git worktree remove is unsafe'", "powershell"], ["echo 'rm -rf and .Delete() are unsafe'", "bash"], ["# git worktree remove x\ngit status", "bash"], ["Write-Output '[IO.Directory]::Delete(x)'", "powershell"]]) assert.equal(cleanup(command, shell, main), null, command);
const sibling = path.join(scratch, "repo.worktrees", "external-sibling");
fs.mkdirSync(sibling);
fs.writeFileSync(path.join(sibling, "plain.txt"), "safe sibling\n");
for (const target of [path.dirname(external), external, `${reproduction}/node_modules/tracked.txt`]) {
  assert.ok(cleanup(`Remove-Item -LiteralPath '${target}' -Recurse`, "powershell", main), target); preserved();
}
assert.equal(cleanup(`Remove-Item -LiteralPath '${sibling}' -Recurse`, "powershell", main), null);
assert.equal(cleanup(`rm -f '${external}/untracked.txt'`, "bash", main), null, "plain descendant without traversal remains supported");
if (process.platform === "win32") {
  const short = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${reproduction}") do @echo %~sI`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true }).stdout.trim();
  if (short && short.toLowerCase() !== reproduction.toLowerCase()) {
    assert.ok(cleanup(`Remove-Item -Recurse '${short}/node_modules'`, "powershell", main)); preserved();
    console.log("PASS: actual Windows 8.3 short-name cleanup refusal");
  } else console.log("SKIP: actual Windows 8.3 short-name probe (volume did not supply a short spelling; CI's RUNNER~1 fixture remains covered)");
  assert.ok(cleanup(`Remove-Item -Recurse '${external.toUpperCase()}'`, "powershell", main)); preserved();
  assert.equal(cleanup(`Remove-Item -Recurse '${sibling.toUpperCase()}'`, "powershell", main), null);
}
assert.ok(cleanup(`cd '${reproduction}' && rm -rf node_modules`, "bash", main)); preserved();
assert.ok(cleanup(`Set-Location '${reproduction}'; Remove-Item -Recurse node_modules`, "powershell", main)); preserved();
assert.ok(cleanup("Set-Location '/missing-filer-1766'; Remove-Item -Recurse node_modules", "powershell", main));
await assert.rejects(checkLinks(reproduction), /outside|External/); preserved();
// Unlink the scratch link itself, never recursive deletion.
fs.unlinkSync(path.join(reproduction, "node_modules"));
const inside = path.join(reproduction, "inside"), scanParent = path.join(reproduction, "scan-parent");
fs.mkdirSync(inside); fs.mkdirSync(scanParent);
fs.symlinkSync(external, path.join(inside, "external"), process.platform === "win32" ? "junction" : "dir");
fs.symlinkSync(inside, path.join(scanParent, "internal"), process.platform === "win32" ? "junction" : "dir");
assert.ok(cleanup(`Remove-Item -Recurse '${scanParent}'`, "powershell", main), "internal junction must not hide external descendants"); preserved();
fs.unlinkSync(path.join(scanParent, "internal")); fs.unlinkSync(path.join(inside, "external"));
fs.mkdirSync(path.join(main, "packages", "a"), { recursive: true });
fs.writeFileSync(path.join(main, "package.json"), JSON.stringify({ name: "scratch-root", private: true, workspaces: ["packages/a"] }));
fs.writeFileSync(path.join(main, "packages", "a", "package.json"), JSON.stringify({ name: "scratch-workspace", version: "1.0.0" }));
git(["add", "."]); git(["commit", "-m", "local workspace fixture"]);
git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
const owner = "test-session-1766";
const owned = await create({ root: main, owner, toolingOnly: true });
assert.ok(!fs.existsSync(path.join(owned.tree, "node_modules")));
await assert.rejects(remove(owned.record, "another-session"), /ownership/); preserved();
fs.writeFileSync(`${owned.record}.lock`, "uncertain owner");
await assert.rejects(remove(owned.record, owner), /active or uncertain/); preserved();
fs.unlinkSync(`${owned.record}.lock`);
const gitdir = git(["rev-parse", "--absolute-git-dir"], owned.tree);
assert.ok(cleanup(`Remove-Item -Recurse '${owned.tree}'`, "powershell", main));
assert.ok(cleanup(`New-Item -ItemType Junction -Path '${owned.tree}/node_modules' -Target '${external}'`, "powershell", main));
const ownedAlias = path.join(scratch, "owned-alias");
fs.symlinkSync(owned.tree, ownedAlias, process.platform === "win32" ? "junction" : "dir");
fs.symlinkSync(external, path.join(owned.tree, "node_modules"), process.platform === "win32" ? "junction" : "dir");
assert.ok(cleanup(`Remove-Item -LiteralPath '${ownedAlias}/node_modules/untracked.txt' -Recurse -Force`, "powershell", main), "A -> owned T -> registered external E must refuse"); preserved();
fs.unlinkSync(path.join(owned.tree, "node_modules")); fs.unlinkSync(ownedAlias);
const marker = path.join(gitdir, markerName), originalMarker = fs.readFileSync(marker);
fs.writeFileSync(marker, "{}");
await assert.rejects(remove(owned.record, owner), /marker/); preserved();
fs.writeFileSync(marker, originalMarker);
for (const command of ["rm -rf $target", "Remove-Item -Recurse $p", "$item.Delete()", "npm install", "ln -s $source node_modules", "git worktree add $path"])
  assert.ok(cleanup(command, "powershell", owned.tree), command);
assert.ok(cleanup(`Set-Location '${scratch}'; Remove-Item -Recurse $unknown`, "powershell", owned.tree));
const fixtureHookDir = path.join(main, ".agents", "hooks");
fs.mkdirSync(fixtureHookDir, { recursive: true });
for (const name of ["worktree-cleanup.mjs", "typed-issue-hook.mjs"]) fs.copyFileSync(path.join(root, ".agents", "hooks", name), path.join(fixtureHookDir, name));
for (const [command, refused] of [[`Remove-Item -Recurse '${owned.tree}'`, true], [`Remove-Item -Recurse '${sibling}'`, false]]) {
  const payload = JSON.stringify({ tool_name: "PowerShell", cwd: scratch, tool_input: { command } });
  const r = spawnSync(process.execPath, [path.join(fixtureHookDir, "worktree-cleanup.mjs")], { cwd: scratch, input: payload, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(Boolean(r.stdout.includes('"deny"')), refused, "source-checkout inventory fallback"); preserved();
}
assert.equal(cleanup("git status --short", "powershell", owned.tree), null);
assert.equal(cleanup("node scripts/filer-worktree.mjs remove --record x --owner y", "powershell", main), null);
await install(owned.record, owner);
assert.equal(JSON.parse(fs.readFileSync(owned.record)).installed, true);
assert.ok(!fs.lstatSync(path.join(owned.tree, "node_modules")).isSymbolicLink());
assert.equal(fs.realpathSync(path.join(owned.tree, "node_modules", "scratch-workspace")), fs.realpathSync(path.join(owned.tree, "packages", "a")));
await checkLinks(owned.tree); preserved();
console.log("PASS: independent npm install and in-checkout workspace links");
fs.symlinkSync(external, path.join(owned.tree, "node_modules", "borrowed"), process.platform === "win32" ? "junction" : "dir");
await assert.rejects(install(owned.record, owner), /outside|External/);
await assert.rejects(remove(owned.record, owner), /outside|External/); preserved();
fs.unlinkSync(path.join(owned.tree, "node_modules", "borrowed"));
await assert.rejects(remove(owned.record, owner), /uncommitted/); preserved();
fs.unlinkSync(path.join(owned.tree, "package-lock.json"));
git(["worktree", "lock", owned.tree]);
await assert.rejects(remove(owned.record, owner), /ownership/); preserved();
git(["worktree", "unlock", owned.tree]);
const live = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)", owned.tree], { windowsHide: true, stdio: "ignore" });
await new Promise(resolve => live.once("spawn", resolve));
try { await assert.rejects(remove(owned.record, owner), /pid|process/); preserved(); }
finally { live.kill(); await new Promise(resolve => live.once("close", resolve)); }
const hookPayload = JSON.stringify({ tool_name: "PowerShell", cwd: owned.tree, tool_input: { command: "Remove-Item -Recurse $unknown" } });
for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
  const result = spawnSync(process.execPath, [path.join(root, file), ...args], { input: hookPayload, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny");
}
await remove(owned.record, owner); preserved();
assert.ok(!fs.existsSync(owned.tree));
assert.ok(fs.existsSync(owned.artifacts));
assert.equal(JSON.parse(fs.readFileSync(owned.record)).state, "removed");
await assert.rejects(remove(owned.record, owner), /inactive/); preserved();
const config = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json")));
assert.ok(config.hooks.PreToolUse.some(group => group.matcher.includes("PowerShell") && group.hooks.some(hook => hook.command.includes("worktree-cleanup.mjs"))));
for (const file of [".agents/skills/references/runner-filing.md", ".claude/agents/filer-sonnet-5-5-low.md", ".agents/skills/file-bug/references/diagnosis.md"]) assert.match(fs.readFileSync(path.join(root, file), "utf8"), /checked.*lifecycle|filer-worktree\.mjs/i);
console.log(`PASS: ${process.platform === "win32" ? "Windows junction" : "POSIX symlink"} preservation, ownership/live/dirty refusals, permitted guarded cleanup and both hook/route wiring`);

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { decide } from "../.agents/hooks/policy.mjs";
import { relevantFiles } from "../.github/scripts/changed-paths.mjs";

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
const external = path.join(scratch, "repo.worktrees", "external checkout");
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
const colonCommand = `Remove-Item -LiteralPath:'${reproduction}/node_modules/untracked.txt' -Force`;
const additionalLiterals = [
  `Push-Location -LiteralPath '${reproduction}'; Remove-Item -LiteralPath node_modules/tracked.txt -Force`,
  `Remove-Item -LiteralPath ('${reproduction}/node_modules/tracked.txt') -Force`,
  `Remove-Item -LiteralPath @('${reproduction}/node_modules/tracked.txt') -Force`,
  `Remove-Item -LiteralPath 'FileSystem::${reproduction}/node_modules/tracked.txt' -Force`,
];
for (const command of additionalLiterals) { assert.ok(cleanup(command, "powershell", main), "literal location/group/provider must refuse"); preserved(); }
if (process.platform === "win32") for (const command of additionalLiterals) {
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${command} -WhatIf`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /tracked\.txt/, "real shell accepts the literal deletion target under WhatIf"); preserved();
}
for (const command of [colonCommand, `Set-Location -LiteralPath:'${reproduction}'; Remove-Item -LiteralPath 'node_modules/untracked.txt' -Force`]) {
  assert.ok(cleanup(command, "powershell", main), "colon-bound literal parameter must refuse"); preserved();
}
const escapedExternal = external.replaceAll(path.sep, "/").replaceAll(" ", "\\ ");
assert.ok(cleanup(`rm -rf ${escapedExternal}`, "bash", main), "Bash escaped-space literal checkout must refuse"); preserved();
for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
  for (const command of [colonCommand, ...additionalLiterals]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command } });
    const result = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).hookSpecificOutput.permissionDecision, "deny"); preserved();
  }
}
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
const sibling = `${external}-sibling`;
fs.mkdirSync(sibling);
fs.writeFileSync(path.join(sibling, "plain.txt"), "safe sibling\n");
for (const target of [path.dirname(external), external, `${reproduction}/node_modules/tracked.txt`]) {
  assert.ok(cleanup(`Remove-Item -LiteralPath '${target}' -Recurse`, "powershell", main), target); preserved();
}
assert.equal(cleanup(`Remove-Item -LiteralPath '${sibling}' -Recurse`, "powershell", main), null);
assert.equal(cleanup(`Remove-Item -LiteralPath:'${sibling}' -Recurse`, "powershell", main), null, "colon-bound harmless sibling remains permitted");
assert.equal(cleanup(`rm -rf ${sibling.replaceAll(path.sep, "/").replaceAll(" ", "\\ ")}`, "bash", main), null, "escaped-space harmless sibling remains permitted");
for (const target of [`('${sibling}')`, `@('${sibling}')`, `'FileSystem::${sibling}'`]) assert.equal(cleanup(`Remove-Item -LiteralPath ${target} -Recurse`, "powershell", main), null, "verified harmless literal form remains permitted");
assert.equal(cleanup(`Push-Location '${sibling}'; Pop-Location; Remove-Item -LiteralPath '${sibling}' -Recurse`, "powershell", main), null, "verified location stack restores its cwd");
assert.ok(cleanup(`Push-Location '${reproduction}'; Push-Location '${sibling}'; Pop-Location; Remove-Item -LiteralPath node_modules/tracked.txt -Force`, "powershell", main)); preserved();
for (const command of ["Pop-Location; Remove-Item unknown", `Push-Location -StackName custom '${sibling}'; Remove-Item unknown`, "Set-Location; Remove-Item unknown", "Set-Location $unknown; Remove-Item unknown", "Remove-Item -LiteralPath @($unknown)", "Remove-Item -LiteralPath $unknown", "rm -rf *", "Remove-Item -LiteralPath 'CustomDrive:unknown'"])
  assert.ok(cleanup(command, "powershell", main), "ambiguous location/target refuses in known repository");
for (const command of [`Remove-Item -LiteralPath @('${external}','${sibling}')`, `Remove-Item -LiteralPath '${external}','${sibling}'`, `Remove-Item -LiteralPath ('${external}' + '/tracked.txt')`, "Remove-Item -LiteralPath 'Registry::unknown'", "Remove-Item -LiteralPath 'FileSystem::relative'", "Remove-Item -LiteralPath 'C:relative'", "Pop-Location -StackName custom; Remove-Item unknown", "Push-Location -LiteralPath (Get-Location); Remove-Item unknown", "rm -rf path?", "rm -rf [abc]", "Remove-Item -Recurse"])
  assert.ok(cleanup(command, "powershell", main), "unclassified operand/location must not become an invented pathname");
assert.ok(cleanup(`Push-Location -Unknown '${sibling}'; Remove-Item node_modules/tracked.txt`, "powershell", reproduction)); preserved();
assert.ok(cleanup(`pushd -n '${sibling}'; rm -rf node_modules/tracked.txt`, "bash", reproduction)); preserved();
assert.ok(cleanup(`Remove-Item -LiteralPath ${sibling},${reproduction}/node_modules/tracked.txt`, "powershell", main)); preserved();
for (const command of ["rm -rf ~/unknown", "rm -rf prefix{one,two}"]) assert.ok(cleanup(command, "bash", main), "shell expansion-looking operand refuses");
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
assert.ok(cleanup(`New-Item -ItemType:Junction -Path borrowed -Target '${external}'`, "powershell", owned.tree), "colon-bound setup type must refuse"); preserved();
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
const workflow = fs.readFileSync(path.join(root, ".github/workflows/hook-tests.yml"), "utf8");
const driverPatterns = workflow.match(/  driver-changes:[\s\S]*?patterns: \|\r?\n([\s\S]*?)(?=\r?\n  \w)/)?.[1].trim().split(/\r?\n/).map(line => line.trim());
assert.ok(driverPatterns, "driver selection must be readable");
for (const dependency of [".agents/hooks/worktree-cleanup.mjs", ".agents/hooks/typed-issue-hook.mjs", ".agents/hooks/policy.mjs", ".agents/hooks/pre-tool-use.mjs", ".claude/hooks/worktree-cleanup.mjs", ".claude/settings.json"]) {
  assert.deepEqual(relevantFiles([dependency], driverPatterns), [dependency], `hook-only change must select preservation fixture: ${dependency}`);
}
assert.deepEqual(relevantFiles(["README.md"], driverPatterns), [], "unrelated documentation does not select drivers");
const missingHooks = driverPatterns.filter(pattern => !pattern.includes("hooks") && pattern !== ".claude/settings.json");
assert.deepEqual(relevantFiles([".agents/hooks/worktree-cleanup.mjs"], missingHooks), [], "restoring missing dependency patterns reproduces selection gap");
for (const file of [".agents/skills/references/runner-filing.md", ".claude/agents/filer-sonnet-5-5-low.md", ".agents/skills/file-bug/references/diagnosis.md"]) assert.match(fs.readFileSync(path.join(root, file), "utf8"), /checked.*lifecycle|filer-worktree\.mjs/i);
console.log(`PASS: ${process.platform === "win32" ? "Windows junction" : "POSIX symlink"} preservation, ownership/live/dirty refusals, permitted guarded cleanup and both hook/route wiring`);

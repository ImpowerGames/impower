// agent-tooling-timeout-ms: 600000
// Real Windows/Bash controls and complete adapters exceeded 300s locally.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
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
function verifyAdapters(command, shell, cwd, denied, nativeDenied = denied) {
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: shell, cwd, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr);
    if (file.startsWith(".agents/") ? nativeDenied : denied) assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
    else assert.equal(r.stdout, "");
    preserved();
  }
}
const reproduction = path.join(scratch, "repo.worktrees", "borrowed-repro");
git(["worktree", "add", "-b", "repro-fixture", reproduction]);
fs.symlinkSync(external, path.join(reproduction, "node_modules"), process.platform === "win32" ? "junction" : "dir");
const command = `git worktree remove --force "${reproduction}"`;
const reason = decide({ kind: "shell", command, shell: "powershell", cwd: main });
preserved();
assert.ok(reason, "supported direct worktree removal must be refused before deletion");
console.log("PASS: direct cleanup refusal preserves external tracked, untracked and ignored sentinels");

// Only explicit Git outside-repository status may select the known-source
// fallback. Inject discovery failures while preserving both complete adapters.
const discoveryPreload = path.join(scratch, "discovery-preload.mjs");
fs.writeFileSync(discoveryPreload, `import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
const actual = cp.spawnSync;
cp.spawnSync = function(file, args, options) {
  if (file === 'git' && args?.[0] === 'rev-parse' && args[1] === '--show-toplevel' && options?.cwd === process.env.FILER_DISCOVERY_CWD) {
    const mode = process.env.FILER_DISCOVERY_FAILURE;
    if (mode === 'status') return { status: 128, stdout: '', stderr: 'fatal: unreadable checkout metadata' };
    const error = new Error('spawnSync git ' + mode); error.code = mode;
    return { error, status: null, signal: null, stdout: '', stderr: '' };
  }
  return actual(file, args, options);
};
syncBuiltinESMExports();
`);
for (const failure of ["ETIMEDOUT", "EACCES", "status"]) for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
  const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command: `Remove-Item -Recurse '${reproduction}/node_modules'` } });
  const result = spawnSync(process.execPath, ["--import", pathToFileURL(discoveryPreload).href, path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true, env: { ...process.env, FILER_DISCOVERY_CWD: main, FILER_DISCOVERY_FAILURE: failure } });
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout).hookSpecificOutput;
  assert.equal(output.permissionDecision, "deny"); assert.match(output.permissionDecisionReason, /repository discovery cannot be checked/); preserved();
}

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
const bashTarget = `${reproduction.replaceAll(path.sep, "/")}/node_modules/tracked.txt`;
const bashOperands = [
  `'${bashTarget.replace("borrowed-repro", "borrowed-''repro")}'`,
  bashTarget.replace("borrowed-repro", "borrowed-\\repro").replaceAll(" ", "\\ "),
  `'${bashTarget.slice(0, bashTarget.indexOf("borrowed-repro"))}borrowed-'"repro/node_modules/tracked.txt"`,
];
for (const operand of bashOperands) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; printf '%s\n' ${operand}; test -f ${operand}`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); assert.ok(actual.stdout.includes(bashTarget)); preserved();
  for (const command of [`rm -f ${operand}`, `rm -f ${operand}; Set-Location .`]) {
    assert.ok(cleanup(command, "bash", main), "raw Bash literal spelling must not invent a harmless target");
    assert.ok(cleanup(command, undefined, main), "a cmdlet elsewhere cannot launder an ambiguous Bash operand"); preserved();
    for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
      const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "Bash", cwd: main, tool_input: { command } });
      const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny"); preserved();
    }
  }
}
for (const program of ["r''m", "'r''m'", "r\\m"]) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; ${program} --version`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); assert.match(actual.stdout, /rm \(GNU coreutils\)/); preserved();
  const command = `${program} -f '${bashTarget}'`;
  assert.ok(cleanup(command, "bash", main), "literal command-position spelling must not hide cleanup");
  assert.ok(cleanup(command, undefined, main)); preserved();
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "Bash", cwd: main, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny"); preserved();
  }
}
for (const command of ["'f''ish' -c 'echo harmless'", "f\\ish -c 'echo harmless'"]) {
  assert.match(cleanup(command, "bash", main), /command literal cannot be verified/, "prior fish candidate uncertainty refusal remains intact");
  verifyAdapters(command, "Bash", main, true);
}
assert.equal(cleanup("fish -c 'echo harmless'", "bash", main), null, "no new fish child-script analysis is claimed");
for (const command of [`bash -c 'r''m -f ${bashTarget}'`, `'bash' -c "rm -f '${bashTarget}'"`]) {
  assert.ok(cleanup(command, "bash", main), "literal child invocation cannot invent an unrelated command");
  assert.ok(cleanup(command, undefined, main)); preserved();
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "Bash", cwd: main, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny"); preserved();
  }
}
const slashRepro = reproduction.replaceAll(path.sep, "/");
const wrapperAndSelectorCases = [
  ["'env' rm --version", `'env' rm -f '${bashTarget}'`],
  ['"env" rm --version', `"env" rm -f '${bashTarget}'`],
  ["'command' rm --version", `'command' rm -f '${bashTarget}'`],
  ["'env' bash -c 'rm --version'", `'env' bash -c "rm -f '${bashTarget}'"`],
  [`bash -c test\\ -f\\ ${bashTarget}`, `bash -c rm\\ -f\\ ${bashTarget}`],
  ["bash '-''c' 'rm --version'", `bash '-''c' "rm -f '${bashTarget}'"`],
  ["bash -\\c 'rm --version'", `bash -\\c "rm -f '${bashTarget}'"`],
  ["env '-''S' 'rm --version'", `env '-''S' "rm -f '${bashTarget}'"`],
  [`env -C '${slashRepro}' test -f node_modules/tracked.txt`, `env -C '${slashRepro}' rm -f node_modules/tracked.txt`],
  [`env --chdir='${slashRepro}' test -f node_modules/tracked.txt`, `env --chdir='${slashRepro}' rm -f node_modules/tracked.txt`],
  [`env '--ch''dir=${slashRepro}' test -f node_modules/tracked.txt`, `env '--ch''dir=${slashRepro}' rm -f node_modules/tracked.txt`],
  ["git 'work''tree' list", `git 'work''tree' remove --force '${slashRepro}'`],
  ["git w\\orktree list", `git w\\orktree remove --force '${slashRepro}'`],
  ["git worktree 're''move' -h", `git worktree 're''move' --force '${slashRepro}'`, 129],
  ["git worktree 'ad''d' -h", `git worktree 'ad''d' '${slashRepro}'`, 129],
  ["ln '-''s' --help", `ln '-''s' '${external}' '${slashRepro}/new-link'`],
  ["$'rm' --version", `$'rm' -f '${bashTarget}'`],
  ["$'\\162\\155' --version", `$'\\162\\155' -f '${bashTarget}'`],
  ["r$'m' --version", `r$'m' -f '${bashTarget}'`],
  ['$"rm" --version', `$"rm" -f '${bashTarget}'`],
  ["bash $'-c' 'rm --version'", `bash $'-c' "rm -f '${bashTarget}'"`],
  ["git $'worktree' list", `git $'worktree' remove --force '${slashRepro}'`],
  ["git worktree $'remove' -h", `git worktree $'remove' --force '${slashRepro}'`, 129],
  ["git 'work''tree' $'list'", `git 'work''tree' $'remove' --force '${slashRepro}'`],
  [`git '-''C' '${main.replaceAll(path.sep, "/")}' $'worktree' list`, `git '-''C' '${main.replaceAll(path.sep, "/")}' $'worktree' remove --force '${slashRepro}'`],
  ["ln $'-s' --help", `ln $'-s' '${external}' '${slashRepro}/new-link'`],
];
for (const [control, mutation, expectedStatus = 0] of wrapperAndSelectorCases) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; ${control}`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, expectedStatus, actual.stderr); preserved();
  assert.ok(cleanup(mutation, "bash", main), "supported wrapper or selector literal cannot hide a mutation");
  assert.ok(cleanup(mutation, undefined, main)); preserved();
  verifyAdapters(mutation, "Bash", main, true);
}
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
fs.mkdirSync(path.join(sibling, "node_modules"));
fs.writeFileSync(path.join(sibling, "node_modules", "tracked.txt"), "safe local file\n");
const safeBashTarget = `${sibling.replaceAll(path.sep, "/")}/plain.txt`;
for (const command of [
  `env rm -f '${safeBashTarget}'`, `command rm -f '${safeBashTarget}'`,
  `env -C '${slashRepro}' rm -f '${safeBashTarget}'`,
  `env -C '${slashRepro}' true; rm -f tracked.txt`,
  "env bash -c \"echo 'rm -rf is unsafe'\"", "command echo 'rm -rf is unsafe'",
  `env -C '${slashRepro}' bash -c "echo 'rm -rf is unsafe'"`,
  "git status -- 'work''tree'", "git -c note.selector='work''tree' status", "git worktree list --porcelain",
]) {
  assert.equal(cleanup(command, "bash", main), null, "literal unquoted wrappers, independent absolute targets and non-operation arguments remain permitted");
  assert.equal(cleanup(command, undefined, main), null); verifyAdapters(command, "Bash", main, false);
}
for (const command of ["bash -c \"echo encoded \\\$'rm' is documentation\"", "env bash -c \"echo encoded \\\$'rm' is documentation\""]) {
  assert.equal(cleanup(command, "bash", main), null, "authoritative Bash child prose is not an encoded operation selector");
  assert.ok(cleanup(command, undefined, main), "unknown shell retains the documented ambiguity refusal");
  verifyAdapters(command, "Bash", main, false, true);
}
for (const command of ["'env' echo harmless", "'command' echo harmless", "$'echo' harmless"]) {
  assert.match(cleanup(command, "bash", main), /Quoted wrapper child traversal|Encoded command literal/, "documented dispatch uncertainty refuses even benign execution in known context");
  verifyAdapters(command, "Bash", main, true);
}
for (const control of [`env -C '${slashRepro}' true; test -f tracked.txt`, "env bash -c \"echo 'rm -rf is unsafe'\"", "git -c note.selector='work''tree' status"]) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; ${control}`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); preserved();
}
for (const operand of [`'${safeBashTarget}'`, `"${safeBashTarget}"`, safeBashTarget.replaceAll(" ", "\\ ")]) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; printf '%s\n' ${operand}; test -f ${operand}`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); assert.ok(actual.stdout.includes(safeBashTarget)); preserved();
  for (const command of [`rm -f ${operand}`, `'bash' -c "rm -f '${safeBashTarget}'"`]) {
    assert.equal(cleanup(command, "bash", main), null, "verified genuine Bash quoting remains permitted");
    for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
      const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "Bash", cwd: main, tool_input: { command } });
      const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
      assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, "", "safe Bash form remains permitted through full adapter"); preserved();
    }
  }
}
const apostropheTarget = path.join(sibling, "literal's.txt");
fs.writeFileSync(apostropheTarget, "literal quote control\n");
const genuinePowerShell = `Remove-Item -LiteralPath '${apostropheTarget.replaceAll("'", "''")}' -Force`;
if (process.platform === "win32") {
  const actual = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${genuinePowerShell} -WhatIf`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); assert.match(actual.stdout, /literal's\.txt/); preserved();
}
for (const shell of ["powershell", undefined]) assert.equal(cleanup(genuinePowerShell, shell, main), null, "canonical cmdlet retains genuine PowerShell literal grammar");
for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
  const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command: genuinePowerShell } });
  const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout, ""); preserved();
}
const nestedLocations = [
  `$dest = '${reproduction}'; Set-Location -LiteralPath $dest; powershell.exe -NoProfile -NonInteractive -Command "Remove-Item -LiteralPath node_modules/tracked.txt -Force"`,
  `$dest = '${reproduction}'; Set-Location -LiteralPath $dest; Write-Output "$(Remove-Item -LiteralPath node_modules/tracked.txt -Force)"`,
  `Set-Location -LiteralPath '${reproduction}'; Write-Output "$(Remove-Item -LiteralPath node_modules/tracked.txt -Force)"`,
];
for (const command of nestedLocations) {
  if (process.platform === "win32") {
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command.replaceAll(" -Force", " -Force -WhatIf")], { cwd: main, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /tracked\.txt/); preserved();
  }
  assert.ok(cleanup(command, "powershell", main), "nested analysis must retain outer location uncertainty and substitution placement"); preserved();
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny"); preserved();
  }
}
assert.ok(cleanup(`cd "$unknown"; bash -c 'rm -f node_modules/tracked.txt'`, "bash", main), "Bash child inherits unresolved location");
assert.ok(cleanup(`cd '${reproduction}'; echo "$(rm -f node_modules/tracked.txt)"`, "bash", main), "pre-collected Bash substitution has no invented execution cwd"); preserved();
assert.ok(cleanup(`Set-Location $unknown; powershell.exe -Command "npm install"`, "powershell", main), "nested setup also inherits unresolved location");
const safeNested = `$dest = '${reproduction}'; Set-Location -LiteralPath $dest; powershell.exe -NoProfile -NonInteractive -Command "Remove-Item -LiteralPath '${sibling}/plain.txt' -Force"`;
const safeSubstitution = `$dest = '${reproduction}'; Set-Location -LiteralPath $dest; Write-Output "$(Remove-Item -LiteralPath '${sibling}/plain.txt' -Force)"`;
const nestShell = (command, levels) => { for (let i = 0; i < levels; i++) command = `powershell.exe -NoProfile -NonInteractive -Command '${command.replaceAll("'", "''")}'`; return command; };
const deepCleanup = nestShell(`Remove-Item -LiteralPath '${reproduction}/node_modules/tracked.txt' -Force`, 4);
const deepSubstitution = command => { for (let i = 0; i < 4; i++) command = `Write-Output "$(${command})"`; return command; };
for (const command of [deepCleanup, deepSubstitution(`Remove-Item -LiteralPath '${reproduction}/node_modules/tracked.txt' -Force`)]) {
  if (process.platform === "win32") {
    const actual = command === deepCleanup ? nestShell(`Remove-Item -LiteralPath '${reproduction}/node_modules/tracked.txt' -Force -WhatIf`, 4) : deepSubstitution(`Remove-Item -LiteralPath '${reproduction}/node_modules/tracked.txt' -Force -WhatIf`);
    const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", actual], { cwd: main, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /tracked\.txt/); preserved();
  }
  assert.match(cleanup(command, "powershell", main), /nesting exceeded/, "recognized recursion fails closed at its bound"); preserved();
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny");
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.permissionDecisionReason, /nesting exceeded|literal cannot be verified/); preserved();
  }
}
assert.ok(cleanup(nestShell(`Remove-Item -LiteralPath '${reproduction}/node_modules/tracked.txt'`, 3), "powershell", main), "supported boundary still checks the actual target");
assert.equal(cleanup(nestShell("Write-Output harmless", 3), "powershell", main), null, "shallow benign child shells remain permitted");
assert.equal(cleanup(`Write-Output '${deepCleanup.replaceAll("'", "''")}'`, "powershell", main), null, "quoted deeply nested prose is not execution");
for (const command of [safeNested, safeSubstitution, `Set-Location '${sibling}'; powershell.exe -Command "Remove-Item -LiteralPath node_modules/tracked.txt"`, `Write-Output "$(Remove-Item -LiteralPath harmless-relative.txt)"`, `Write-Output '$(Remove-Item unknown)'`]) {
  assert.equal(cleanup(command, "powershell", main), null, "safe absolute, known child location and quoted prose controls");
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), ""); preserved();
  }
}
const splat = `$targets=@('${reproduction}/node_modules/tracked.txt'); Remove-Item -LiteralPath @targets -Force`;
if (process.platform === "win32") {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${splat} -WhatIf`], { cwd: main, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr); assert.match(r.stdout, /tracked\.txt/); preserved();
}
assert.ok(cleanup(splat, "powershell", main), "unresolved splatting must not become a literal pathname"); preserved();
const bracket = path.join(reproduction, "loc[1]"), expanded = path.join(reproduction, "loc1");
fs.mkdirSync(bracket); fs.mkdirSync(expanded);
fs.symlinkSync(external, path.join(expanded, "node_modules"), process.platform === "win32" ? "junction" : "dir");
const uncertainLocations = [
  `Set-Location '${bracket}'; Remove-Item -LiteralPath node_modules/tracked.txt -Force`,
  `Push-Location '${bracket}'; Remove-Item -LiteralPath node_modules/tracked.txt -Force`,
  `Set-Location '${sibling}' extra; Remove-Item -LiteralPath node_modules/tracked.txt -Force`,
  `Set-Location -Path '${sibling}' -LiteralPath '${sibling}'; Remove-Item -LiteralPath node_modules/tracked.txt -Force`,
  `if ($false) { Set-Location '${sibling}' }; Remove-Item -LiteralPath node_modules/tracked.txt -Force`,
  `Remove-Item -LiteralPath ‘${reproduction}/node_modules/tracked.txt’ -Force`,
];
for (const command of uncertainLocations) {
  assert.ok(cleanup(command, "powershell", reproduction), "uncertain location/quotes must refuse"); preserved();
  for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
    const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: reproduction, tool_input: { command } });
    const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
    assert.equal(r.status, 0, r.stderr); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, "deny"); preserved();
  }
}
fs.unlinkSync(path.join(expanded, "node_modules"));
const safeLocation = `Set-Location -LiteralPath '${sibling}'; Remove-Item -LiteralPath node_modules/tracked.txt -Force`;
const outsideLocation = path.join(scratch, "possible-non-git");
fs.mkdirSync(outsideLocation);
verifyAdapters(`Remove-Item -LiteralPath '${sibling}' -Recurse`, "PowerShell", outsideLocation, false);
fs.symlinkSync(external, path.join(outsideLocation, "node_modules"), process.platform === "win32" ? "junction" : "dir");
assert.ok(cleanup(`Set-Location '${outsideLocation}'; Remove-Item -LiteralPath node_modules/tracked.txt -Force`, "powershell", main), "all possible cwd targets use the original known registry"); preserved();
fs.unlinkSync(path.join(outsideLocation, "node_modules"));
const initialChild = path.join(main, "relative-cwd"), movedChild = path.join(sibling, "relative-cwd");
fs.mkdirSync(initialChild); fs.mkdirSync(movedChild);
fs.symlinkSync(external, path.join(initialChild, "node_modules"), process.platform === "win32" ? "junction" : "dir");
assert.ok(cleanup(`Set-Location '${sibling}'; Set-Location relative-cwd; Remove-Item node_modules/tracked.txt`, "powershell", main), "relative locations propagate from every possible prior cwd"); preserved();
assert.ok(cleanup(`Set-Location '${sibling}'; powershell.exe -Command "Set-Location relative-cwd; Remove-Item node_modules/tracked.txt"`, "powershell", main), "child shell retains every possible prior cwd for its own relative transitions"); preserved();
fs.unlinkSync(path.join(initialChild, "node_modules"));
const manyLocations = Array.from({ length: 9 }, (_, i) => {
  const dir = path.join(scratch, `location-state-${i}`); fs.mkdirSync(dir); return `Set-Location '${dir}'`;
}).join("; ");
assert.match(cleanup(`${manyLocations}; Remove-Item relative.txt`, "powershell", main), /states.*bound/, "state overflow refuses rather than truncates");
assert.match(cleanup(`${manyLocations}; powershell.exe -Command "Remove-Item relative.txt"`, "powershell", main), /states.*bound/, "nested shell retains state overflow refusal");
assert.equal(cleanup(`${manyLocations}; Remove-Item -LiteralPath '${sibling}/plain.txt'`, "powershell", main), null, "verified absolute target is independent of uncertain location states");
assert.equal(cleanup(`if ($false) { Set-Location '/missing-filer-1766' }; Remove-Item -LiteralPath '${sibling}/plain.txt'`, "powershell", main), null, "safe absolute literal survives unresolved flow");
assert.ok(cleanup(`Set-Location '/missing-filer-1766'; Remove-Item node_modules/tracked.txt`, "powershell", reproduction)); preserved();
for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
  const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "PowerShell", cwd: main, tool_input: { command: safeLocation } });
  const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "", "both complete adapters permit the supported harmless cmdlet form"); preserved();
}
if (process.platform === "win32") for (const command of [uncertainLocations[2], uncertainLocations[4], "Set-Location '/missing-filer-1766'; Remove-Item -LiteralPath node_modules/tracked.txt -Force"]) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `${command} -WhatIf`], { cwd: reproduction, encoding: "utf8", windowsHide: true });
  assert.match(r.stdout, /tracked\.txt/, "failed/skipped location retains the real initial cwd under WhatIf"); preserved();
}
for (const target of [path.dirname(external), external, `${reproduction}/node_modules/tracked.txt`]) {
  assert.ok(cleanup(`Remove-Item -LiteralPath '${target}' -Recurse`, "powershell", main), target); preserved();
}
assert.equal(cleanup(`Remove-Item -LiteralPath '${sibling}' -Recurse`, "powershell", main), null);
assert.equal(cleanup(`Remove-Item -LiteralPath:'${sibling}' -Recurse`, "powershell", main), null, "colon-bound harmless sibling remains permitted");
assert.equal(cleanup(`rm -rf ${sibling.replaceAll(path.sep, "/").replaceAll(" ", "\\ ")}`, "bash", main), null, "escaped-space harmless sibling remains permitted");
const shortShape = path.join(scratch, "RUNNER~1", "harmless sibling");
fs.mkdirSync(shortShape, { recursive: true });
const shortShapeLiteral = shortShape.replaceAll(path.sep, "/"), escapedShortShape = shortShapeLiteral.replaceAll(" ", "\\ ");
const bash = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
const spelling = spawnSync(bash, ["-c", `printf '%s\n' ${escapedShortShape}`], { encoding: "utf8", windowsHide: true });
assert.equal(spelling.status, 0, spelling.stderr); assert.equal(spelling.stdout.trim(), shortShapeLiteral, "embedded short-name tilde is literal in real Bash");
assert.equal(cleanup(`rm -rf ${escapedShortShape}`, "bash", main), null, "CI short-name path shape remains permitted"); preserved();
for (const [file, args] of [[".agents/hooks/pre-tool-use.mjs", ["codex"]], [".claude/hooks/worktree-cleanup.mjs", []]]) {
  const payload = JSON.stringify({ session_id: "test-session-1766", tool_name: "Bash", cwd: main, tool_input: { command: `rm -rf ${escapedShortShape}` } });
  const r = spawnSync(process.execPath, [path.join(root, file), ...args], { input: payload, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, r.stderr); assert.equal(r.stdout.trim(), "", "both adapters preserve embedded-tilde escaped-space literal control"); preserved();
}
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
const npmAliases = ["install", "add", "i", "in", "ins", "inst", "insta", "instal", "isnt", "isnta", "isntal", "isntall", "ci", "clean-install", "ic", "install-clean", "isntall-clean"];
for (const alias of npmAliases) {
  assert.ok(cleanup(`npm ${alias}`, "bash", owned.tree), `explicit setup alias ${alias} protects ownership`);
  assert.ok(cleanup(`npm ${alias}`, undefined, owned.tree)); preserved();
}
for (const alias of ["i", "add", "isntall", "ic", "clean-install", "install-clean", "isntall-clean"]) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; npm ${alias} --help`], { cwd: owned.tree, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); assert.match(actual.stdout, /npm (?:install|ci)/); preserved();
  verifyAdapters(`npm ${alias}`, "Bash", owned.tree, true);
}
for (const selector of ["'in''stall'", "'c''i'", "i\\nstall", "$'install'", "$'ci'", "'isn''tall'", "$'ic'"]) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; npm ${selector} --help`], { cwd: owned.tree, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); assert.match(actual.stdout, /npm (?:install|ci)/); preserved();
  for (const [command, cwd] of [[`npm ${selector}`, owned.tree], [`npm --prefix '${owned.tree}' ${selector}`, main]]) {
    assert.ok(cleanup(command, "bash", cwd), "literal npm operation selector cannot hide setup");
    assert.ok(cleanup(command, undefined, cwd)); verifyAdapters(command, "Bash", cwd, true);
  }
}
for (const command of ["npm help 'in''stall' --help", "npm config get 'in''stall'", `npm --cache '${owned.artifacts.replaceAll(path.sep, "/")}/in''stall' --version`, "git status -- 'work''tree'", "git status -- $'worktree'", "npm config get $'install'", "echo \"encoded $'rm' is documentation\""]) {
  const executable = process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";
  const actual = spawnSync(executable, ["-c", `pwd; ${command}`], { cwd: owned.tree, encoding: "utf8", windowsHide: true });
  assert.equal(actual.status, 0, actual.stderr); preserved();
  assert.equal(cleanup(command, "bash", owned.tree), null, "non-operation literal arguments are not npm/Git setup selectors");
  assert.equal(cleanup(command, undefined, owned.tree), null); verifyAdapters(command, "Bash", owned.tree, false);
}
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

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { decide } from "./policy.mjs";
import { normalize } from "./pre-tool-use.mjs";
import { testShell } from "../skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const event = (tool_name, tool_input) => ({ session_id: "policy-test", tool_name, tool_input });
// Control bytes are built from their code points so that no tool writing this
// file can decode an escape into the byte itself.
const nul = String.fromCharCode(0), esc = String.fromCharCode(0x1b), bs = String.fromCharCode(92);
const writeHazards = [
  [event("Write", { file_path: "src/key.ts", content: `const SEP = "${nul}";\n` }), true],
  [event("Edit", { file_path: "src/key.ts", old_string: "a", new_string: `b${esc}[0m` }), true],
  [event("apply_patch", { command: `*** Begin Patch\n*** Update File: src/key.ts\n@@\n-a\n+const SEP = "${nul}";\n*** End Patch` }), true],
  [event("Write", { file_path: "src/key.ts", content: `const SEP = "${bs}u0000";\r\n\tx\n` }), false],
  [event("Bash", { command: `Set-Location C:/w; [IO.File]::WriteAllText("packages/a.ts", $t)` }), true],
  [event("Bash", { command: `$p = 'packages/a.ts'; $t = [System.IO.File]::ReadAllText($p)` }), true],
  [event("Bash", { command: `$w = "src"; [IO.File]::WriteAllText("$w/a.ts", $t)` }), true],
  [event("Bash", { command: `[IO.Path]::GetFullPath('a.ts')` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText('C:${bs}w${bs}a.ts', $t); [IO.File]::ReadAllText("/tmp/a")` }), false],
  [event("Bash", { command: `$w = "C:/w"; [System.IO.File]::WriteAllText("$w/a.ts", $t); [IO.File]::ReadAllText((Join-Path $PWD 'a'))` }), false],
  [event("Bash", { command: `Get-ChildItem | % { [IO.File]::ReadAllText($_.FullName) }` }), false],
  // Review round 1 (PR #754): expression arguments, text that only looks like a call, variable roots.
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path 'packages' 'a.ts'), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText(('packages/a.ts'), $t)` }), true],
  [event("Bash", { command: "[IO.File]::WriteAllText( `\n  'packages/a.ts', $t)" }), true],
  [event("Bash", { command: `# [IO.File]::ReadAllText('a.ts')\ngit status` }), false],
  [event("Bash", { command: `$body = @"\n[IO.File]::WriteAllText('a.ts', $t)\n"@\nSet-Content -Path (Join-Path $PWD 'notes.md') -Value $body` }), false],
  [event("Bash", { command: `Write-Output '[IO.File]::WriteAllText(''rel.ts'', $t)'` }), false],
  [event("Bash", { command: `$w = "$env:TEMP/x.ts"; [IO.File]::WriteAllText($w, $t)` }), false],
  [event("Bash", { command: `$r = "C:/w"; $w = "$r/a.ts"; [IO.File]::WriteAllText($w, $t)` }), false],
  [event("Bash", { command: `$r = "src"; $w = "$r/a.ts"; [IO.File]::WriteAllText($w, $t)` }), true],
  // Review round 2 (PR #754): compact assignments, named Join-Path parameters, subexpressions.
  [event("Bash", { command: `$p='packages/a.ts'; [IO.File]::WriteAllText($p, $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -ChildPath 'a.ts' -Path 'packages'), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Path:packages -ChildPath:a.ts), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Resolve 'packages' 'a.ts'), $t)` }), true],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Path $($PWD) -ChildPath 'a.ts'), $t)` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path (Get-Location) 'a.ts'), $t)` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -ChildPath 'a.ts' -Path $PWD), $t)` }), false],
  // Review round 3 (PR #754): a $() subexpression in a double-quoted string runs; common switches take no value.
  [event("Bash", { command: `Write-Output "$([IO.File]::WriteAllText('packages/a.ts', 'x'))"` }), true],
  [event("Bash", { command: `Write-Output "$([IO.File]::WriteAllText('C:/w/a.ts', 'x'))"` }), false],
  [event("Bash", { command: `$r = "C:/w"; Write-Output "$([IO.File]::WriteAllText("$r/a.ts", 'x'))"` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Verbose 'C:/absolute-root' 'child.ts'), 'x')` }), false],
  [event("Bash", { command: `[IO.File]::WriteAllText((Join-Path -Verbose 'packages' 'child.ts'), 'x')` }), true],
];
const checks = [
  [event("Bash", { command: "git stash pop" }), true],
  [event("Bash", { command: "git stash list" }), false],
  [event("Bash", { command: "gh issue create --title x" }), true],
  [event("Bash", { command: "gh issue create --title x --type Task" }), false],
  [event("Bash", { command: 'irm -InFile $(Get-Content "C:\\dist\\") -Method Post -Uri https://api.github.com/repos/ImpowerGames/impower/issues -Body @{title="x"}' }), true],
  [event("Write", { file_path: "C:\\repo\\packages\\sparkdown\\language\\sparkdown.language-grammar.json" }), true],
  [event("Edit", { file_path: "definitions/yaml/sparkdown.language-grammar.yaml" }), false],
  [event("apply_patch", { command: "*** Begin Patch\n*** Update File: ordinary.txt\n@@\n-a\n+b\n*** Add File: packages/sparkdown/language/sparkdown.language-config.json\n+{}\n*** End Patch" }), true],
  [event("apply_patch", { command: "*** Begin Patch\r\n*** Update File: plain.txt\r\n*** Move to: vscode-sparkdown/language/sparkdown.language-snippets.json\r\n@@\r\n-a\r\n+b\r\n*** End Patch" }), true],
  [event("apply_patch", { command: "*** Begin Patch\n*** Delete File: packages/sparkdown/language/sparkdown.language-grammar.json\n*** End Patch" }), true],
  [event("apply_patch", { command: "*** Begin Patch\n*** Add File: docs/example.txt\n+*** Update File: packages/sparkdown/language/sparkdown.language-grammar.json\n*** End Patch" }), false],
  ...writeHazards,
];
const config = JSON.parse(fs.readFileSync(path.join(root, ".codex/hooks.json"), "utf8"));
const group = config.hooks.PreToolUse[0], hook = group.hooks[0];
const shell = process.platform === "win32" ? "powershell.exe" : "bash";
const args = process.platform === "win32" ? ["-NoProfile", "-NonInteractive", "-Command", hook.commandWindows] : ["-c", hook.command];
for (const [payload, blocked] of checks) {
  assert.ok(new RegExp(group.matcher).test(payload.tool_name), "configured matcher covers " + payload.tool_name);
  assert.equal(Boolean(decide(normalize(payload, "codex"))), blocked, JSON.stringify(payload));
  const child = spawnSync(shell, args, { cwd: path.join(root, "scripts"), input: JSON.stringify(payload), encoding: "utf8", windowsHide: true });
  assert.equal(child.status, 0, child.stderr);
  assert.equal(Boolean(child.stdout.trim() && JSON.parse(child.stdout).hookSpecificOutput?.permissionDecision === "deny"), blocked, child.stdout);
}
const malformed = spawnSync(shell, args, { cwd: root, input: "{broken", encoding: "utf8", windowsHide: true });
assert.equal(malformed.status, 2);
assert.match(malformed.stderr, /could not check/);
assert.throws(() => normalize(event("apply_patch", {}), "codex"), /missing/);
assert.throws(() => normalize(event("Bash", {}), "codex"), /missing/);
assert.throws(() => normalize({}, "unknown"), /adapter/);

// The portable command is also checked explicitly with Git for Windows bash.
const bash = process.platform === "win32" ? testShell() : "bash";
const portable = spawnSync(bash, ["-c", hook.command], { cwd: path.join(root, "scripts"), input: JSON.stringify(checks[0][0]), encoding: "utf8", windowsHide: true });
assert.equal(portable.status, 0, portable.stderr);
assert.match(portable.stdout, /permissionDecision.*deny/);
const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
const missingNode = spawnSync(bash, ["-c", "node() { return 127; }; " + settings.hooks.PreToolUse[0].hooks[0].command], { cwd: root, input: JSON.stringify(checks[5][0]), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8", windowsHide: true });
assert.equal(missingNode.status, 2, "missing runtime must block generated-file edits");
assert.match(missingNode.stderr, /node|runtime/i, "a blocking runtime failure needs an actionable reason");
if (process.platform === "win32") {
  const missingCommand = hook.commandWindows.replace("& node ", "& impower_node_missing_probe ");
  assert.notEqual(missingCommand, hook.commandWindows);
  const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", missingCommand], { cwd: root, input: JSON.stringify(checks[0][0]), encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 2, "a missing Windows runtime must block, not report a non-blocking hook failure");
  assert.match(result.stderr, /Repository hook|node|runtime/i);
}
// Claude-only tool shapes: MultiEdit content, the PowerShell dialect, and the
// PowerShell hook that .claude/settings.json ships, run under bash.
assert.ok(decide(normalize(event("MultiEdit", { file_path: "src/key.ts", edits: [{ old_string: "a", new_string: "b" }, { old_string: "c", new_string: `d${nul}` }] }), "claude")));
assert.equal(decide(normalize(event("Bash", { command: `[IO.File]::ReadAllText('a.ts')` }), "claude")), null, "bash has no .NET calls");
const dotnetHook = settings.hooks.PreToolUse.find((g) => g.matcher === "PowerShell").hooks[0].command;
for (const [command, blocked] of [[`$p = 'packages/a.ts'; [IO.File]::WriteAllText($p, $t)`, true], [`[IO.File]::WriteAllText('C:/w/a.ts', $t)`, false], ["git status", false]]) {
  const assertion = decide(normalize(event("PowerShell", { command }), "claude"));
  assert.equal(Boolean(assertion), blocked, command);
  const run = spawnSync(bash, ["-c", dotnetHook], { cwd: root, input: JSON.stringify(event("PowerShell", { command })), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8", windowsHide: true });
  assert.equal(run.status, 0, run.stderr);
  assert.equal(/permissionDecision.*deny/.test(run.stdout), blocked, command + " through the shipped hook");
}
console.log("PASS: shared policy, complete multi-file patches, native hook configuration, nested cwd and blocking failures");

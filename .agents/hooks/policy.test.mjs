import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { decide } from "./policy.mjs";
import { normalize } from "./pre-tool-use.mjs";
import { testShell } from "../skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const event = (tool_name, tool_input) => ({ tool_name, tool_input });
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
const portable = spawnSync(bash, ["-c", hook.command], { cwd: path.join(root, "scripts"), input: JSON.stringify(checks[0][0]), encoding: "utf8" });
assert.equal(portable.status, 0, portable.stderr);
assert.match(portable.stdout, /permissionDecision.*deny/);
const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
const missingNode = spawnSync(bash, ["-c", "node() { return 127; }; " + settings.hooks.PreToolUse[0].hooks[0].command], { cwd: root, input: JSON.stringify(checks[5][0]), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8" });
assert.equal(missingNode.status, 2, "missing runtime must block generated-file edits");
assert.match(missingNode.stderr, /node|runtime/i, "a blocking runtime failure needs an actionable reason");
if (process.platform === "win32") {
  const missingCommand = hook.commandWindows.replace("& node ", "& impower_node_missing_probe ");
  assert.notEqual(missingCommand, hook.commandWindows);
  const result = spawnSync(shell, ["-NoProfile", "-NonInteractive", "-Command", missingCommand], { cwd: root, input: JSON.stringify(checks[0][0]), encoding: "utf8", windowsHide: true });
  assert.equal(result.status, 2, "a missing Windows runtime must block, not report a non-blocking hook failure");
  assert.match(result.stderr, /Repository hook|node|runtime/i);
}
console.log("PASS: shared policy, complete multi-file patches, native hook configuration, nested cwd and blocking failures");

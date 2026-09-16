import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { testShell } from "../skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "impower-title-test-"));
console.log("state directory: " + stateDir);
process.env.IMPOWER_SESSION_TITLE_DIR = stateDir;
const { deriveTitle, deriveWorktree, afterTool, gate, statePath, sessionKey, ackCommand } = await import("./session-title.mjs");

// A disposable checkout whose worktrees sit where the test commands point, standing in for the ones those commands create.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "impower-title-repo-"));
const repo = path.join(fixture, "checkout");
fs.mkdirSync(repo);
console.log("fixture repository: " + repo);
const git = (...args) => spawnSync("git", args, { cwd: repo, encoding: "utf8", windowsHide: true });
const ok = (result) => assert.equal(result.status, 0, result.stderr);
ok(git("init", "-q"));
ok(git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "--allow-empty", "-m", "base"));
ok(git("worktree", "add", "-q", "-b", "fix/302-filterimage-layers", path.join(fixture, "impower.worktrees", "fix", "302-filterimage-layers")));
ok(git("worktree", "add", "-q", "-b", "feat/9-second-thing", path.join(fixture, "y")));

const create = "git worktree add -b fix/302-filterimage-layers ../impower.worktrees/fix/302-filterimage-layers origin/main";
assert.equal(deriveTitle(create), "FIX #302: filterimage layers");
for (const [type, label] of [["feat", "FEAT"], ["perf", "PERF"], ["docs", "DOCS"], ["test", "TEST"], ["refactor", "REFACTOR"], ["ci", "CI"]]) {
  assert.equal(deriveTitle(`git fetch origin main && git worktree add -b ${type}/41-two-words ../impower.worktrees/${type}/41-two-words origin/main`), `${label} #41: two words`);
}
assert.equal(deriveTitle('git worktree add -B "feat/7-quoted-branch" ../x origin/main'), "FEAT #7: quoted branch");
assert.equal(deriveTitle("git worktree add --detach ../x -b=docs/8-equals-form"), null, "only the documented -b <branch> form is recognised");
for (const miss of ["git worktree add -b claude/sparkdown-docs ../x origin/main", "git worktree add -b fix/no-number ../x", "git worktree add ../x fix/302-existing-branch", "git worktree list", "echo fix/302-filterimage-layers", "git worktree add -b chore/9-other-type ../x", `echo ${create}`, `printf '%s' '${create}'`, `Write-Output "${create}"`]) {
  assert.equal(deriveTitle(miss), null, miss);
}
assert.equal(deriveTitle(`cd x; ${create}`), "FIX #302: filterimage layers");
assert.equal(deriveTitle(`if true; then ${create}; fi`), "FIX #302: filterimage layers");
assert.equal(deriveTitle(`# set up\n${create}`), "FIX #302: filterimage layers", "a comment ends at the line break");
assert.equal(deriveTitle(`${create} # new worktree`), "FIX #302: filterimage layers");
assert.equal(deriveTitle(`git worktree add -b fix/302-filterimage-layers ../a#b origin/main`), "FIX #302: filterimage layers", "# inside a word is not a comment");
// Separators and keywords inside quotes do not start a command.
for (const quoted of [`echo 'note; ${create}'`, `echo "note && ${create}"`, `echo note\\; ${create}`, `git commit -m "then ${create}"`, `Write-Output note\`; ${create}`, `Write-Output no-op #; ${create}`, `# ${create}`, `echo "a\`"; ${create}"`]) {
  assert.equal(deriveTitle(quoted), null, quoted);
}
assert.deepEqual(deriveWorktree("git worktree add --lock --reason 'x y' -b docs/5-two-words C:\\work\\wt HEAD"), { branch: "docs/5-two-words", target: "C:\\work\\wt", title: "DOCS #5: two words" }, "Windows paths keep their backslashes");

const shell = (session_id, command, tool_name = "Bash") => ({ session_id, cwd: repo, tool_name, tool_input: { command } });
const rename = (session_id, title, tool_name = "mcp__ccd_session_mgmt__set_session_title", target = "self") => ({ session_id, tool_name, tool_input: tool_name.endsWith("set_thread_title") ? { title } : { session_id: target, title } });

// A worktree command that created nothing (it failed, or its branch has no worktree) records nothing.
assert.equal(afterTool(shell("failed", "git worktree add -b fix/303-never-created ../z origin/main"), "codex"), null);
assert.equal(gate(shell("failed", "git status"), "codex"), null);
assert.equal(afterTool({ ...shell("failed", create), cwd: os.tmpdir() }, "codex"), null, "outside the repository no worktree is listed");
// A failed add for a branch that already has a worktree elsewhere records nothing either.
const duplicate = "git worktree add -b fix/302-filterimage-layers ../second-copy origin/main";
assert.notEqual(git(...duplicate.split(" ").slice(1)).status, 0, "git refuses the duplicate branch");
assert.equal(afterTool(shell("failed", duplicate), "codex"), null);
assert.equal(gate(shell("failed", "git status"), "codex"), null);

// Unrelated sessions and commands record nothing and are never gated.
assert.equal(afterTool(shell("a", "git status"), "claude"), null);
assert.equal(fs.existsSync(statePath("a")), false);
assert.equal(gate(shell("a", "git status"), "claude"), null);

// Creating the worktree records a pending title and names the exact rename call.
const context = afterTool(shell("a", create), "claude");
assert.match(context, /FIX #302: filterimage layers/);
assert.match(context, /set_session_title/);
assert.match(context, /tool search/i);
assert.ok(statePath("a").startsWith(stateDir), "state lives in the private directory");
const fromRoot = path.relative(root, statePath("a"));
assert.ok(fromRoot.startsWith("..") || path.isAbsolute(fromRoot), "state is never inside the checkout: " + fromRoot);

// The next shell command is denied until the rename happens.
const denied = gate(shell("a", "npm test"), "claude");
assert.match(denied, /FIX #302: filterimage layers/);
assert.match(gate(shell("a", "Get-ChildItem", "PowerShell"), "claude"), /set_session_title/);

// A second session in another worktree is unaffected.
assert.equal(gate(shell("b", "npm test"), "claude"), null);

// A rename with a different title does not confirm; the exact title does.
assert.match(afterTool(rename("a", "Something else"), "claude"), /FIX #302: filterimage layers/);
assert.ok(gate(shell("a", "npm test"), "claude"));
assert.match(afterTool(rename("a", "FIX #302: filterimage layers", undefined, "local_other"), "claude"), /FIX #302/, "renaming another session does not confirm");
assert.ok(gate(shell("a", "npm test"), "claude"));
assert.equal(afterTool(rename("a", "FIX #302: filterimage layers"), "claude"), null);
assert.equal(gate(shell("a", "npm test"), "claude"), null);

// A working directory given by its Windows 8.3 short name still matches Git's long-form paths.
if (process.platform === "win32") {
  const short = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${repo}") do @echo %~sI`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true }).stdout.trim();
  if (short && short.toLowerCase() !== repo.toLowerCase()) {
    assert.match(afterTool({ ...shell("short", create), cwd: short }, "codex"), /FIX #302/, short);
    afterTool(rename("short", "FIX #302: filterimage layers", "set_thread_title"), "codex");
  } else console.log("SKIP: 8.3 short names are unavailable for " + repo);
}

// A later worktree in the same session asks again.
afterTool(shell("a", "git worktree add -b feat/9-second-thing ../y origin/main"), "claude");
assert.match(gate(shell("a", "ls"), "claude"), /FEAT #9: second thing/);

// Codex names its own tool and offers the acknowledgement fallback, which the gate lets through.
const codexContext = afterTool(shell("c", create), "codex");
assert.match(codexContext, /set_thread_title/);
const ack = codexContext.match(/`(node [^`]+ confirm [^`]+)`/)?.[1];
assert.ok(ack, codexContext);
assert.ok(gate(shell("c", "npm test"), "codex"));
assert.equal(gate(shell("c", ack), "codex"), null);
const hookPath = path.join(root, ".agents/hooks/session-title.mjs");
const keyC = sessionKey("c");
assert.equal(gate(shell("c", `node ${hookPath.replaceAll("\\", "/")} confirm ${keyC}`), "codex"), null, "an unquoted path to the same script is accepted");
for (const other of [`node "C:/elsewhere/session-title.mjs" confirm ${keyC}`, `node ./session-title.mjs confirm ${keyC}`, `node "${hookPath}" confirm ${sessionKey("d")}`, `node "${hookPath}" confirm c`, `${ack} && npm test`, `${ack}; npm test`, `node "${hookPath}" confirm ${keyC} extra`]) {
  assert.ok(gate(shell("c", other), "codex"), other);
}
assert.equal(afterTool(rename("c", "FIX #302: filterimage layers", "set_thread_title"), "codex"), null);
assert.equal(gate(shell("c", "npm test"), "codex"), null);

// The acknowledgement command confirms only the named session.
afterTool(shell("d", create), "codex");
afterTool(shell("e", create), "codex");
const cli = path.join(root, ".agents/hooks/session-title.mjs");
const confirm = (key) => spawnSync(process.execPath, [cli, "confirm", key], { encoding: "utf8", env: process.env, windowsHide: true });
const confirmed = confirm(sessionKey("d"));
assert.equal(confirmed.status, 0, confirmed.stderr);
assert.equal(gate(shell("d", "npm test"), "codex"), null);
assert.ok(gate(shell("e", "npm test"), "codex"));
assert.equal(confirm(sessionKey("unknown")).status, 1);
assert.equal(confirm("d").status, 2, "only a session key is accepted");

// Session ids with spaces or shell syntax get a usable acknowledgement that contains neither.
const bashShell = process.platform === "win32" ? testShell() : "bash";
for (const odd of ["space id", "x;echo${IFS}INJECTED", "q'uote\"d"]) {
  const message = afterTool(shell(odd, create), "codex");
  const command = message.match(/`(node [^`]+ confirm [^`]+)`/)[1];
  assert.equal(command, ackCommand(odd));
  assert.ok(!command.includes(odd), command);
  assert.equal(gate(shell(odd, command), "codex"), null, odd);
  const ran = spawnSync(bashShell, ["-c", command], { encoding: "utf8", env: process.env, windowsHide: true });
  assert.equal(ran.status, 0, ran.stderr);
  assert.doesNotMatch(ran.stdout, /INJECTED/);
  assert.equal(gate(shell(odd, "npm test"), "codex"), null, "the prescribed command clears the gate for " + odd);
}

// Session ids cannot escape the state directory.
assert.equal(path.dirname(statePath("../../evil")), stateDir);

// Distinct ids never share state, including ids that differ only in case or punctuation.
afterTool(shell("x/y", create), "claude");
afterTool(shell("x?y", "git worktree add -b feat/9-second-thing ../y origin/main"), "claude");
afterTool(shell("X/Y", create), "claude");
assert.notEqual(statePath("x/y"), statePath("x?y"));
assert.notEqual(statePath("x/y").toLowerCase(), statePath("X/Y").toLowerCase());
assert.match(gate(shell("x/y", "ls"), "claude"), /FIX #302/);
assert.match(gate(shell("x?y", "ls"), "claude"), /FEAT #9/);
afterTool(rename("x?y", "FEAT #9: second thing"), "claude");
assert.match(gate(shell("x/y", "ls"), "claude"), /FIX #302/);
assert.match(gate(shell("X/Y", "ls"), "claude"), /FIX #302/);

// Native hook configuration reaches the shared source on both runners.
const bash = process.platform === "win32" ? testShell() : "bash";
const settings = JSON.parse(fs.readFileSync(path.join(root, ".claude/settings.json"), "utf8"));
const run = (command, payload) => spawnSync(bash, ["-c", command], { cwd: path.join(root, "scripts"), input: typeof payload === "string" ? payload : JSON.stringify(payload), env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8", windowsHide: true });
const claudePre = settings.hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes("session-title-hook")));
const claudePost = settings.hooks.PostToolUse;
assert.ok(new RegExp(`^(?:${claudePre.matcher})$`).test("Bash") && new RegExp(`^(?:${claudePre.matcher})$`).test("PowerShell"));
const postShell = claudePost.find((g) => new RegExp(`^(?:${g.matcher})$`).test("Bash"));
const postRename = claudePost.find((g) => new RegExp(`^(?:${g.matcher})$`).test("mcp__ccd_session_mgmt__set_session_title"));
assert.ok(postShell && postRename, "Claude PostToolUse covers shell commands and the rename tool");
let out = run(postShell.hooks[0].command, { ...shell("f", create), hook_event_name: "PostToolUse" });
assert.equal(out.status, 0, out.stderr);
assert.match(JSON.parse(out.stdout).hookSpecificOutput.additionalContext, /FIX #302/);
out = run(claudePre.hooks[0].command, shell("f", "npm test"));
assert.equal(out.status, 0, out.stderr);
assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, "deny");
out = run(postRename.hooks[0].command, rename("f", "FIX #302: filterimage layers"));
assert.equal(out.status, 0, out.stderr);
out = run(claudePre.hooks[0].command, shell("f", "npm test"));
assert.equal(out.status, 0, out.stderr);
assert.equal(out.stdout.trim(), "");
assert.equal(run(claudePre.hooks[0].command, "{broken").status, 2, "a broken gate blocks");

const codex = JSON.parse(fs.readFileSync(path.join(root, ".codex/hooks.json"), "utf8"));
const codexPost = codex.hooks.PostToolUse[0];
assert.ok(new RegExp(codexPost.matcher).test("Bash") && new RegExp(codexPost.matcher).test("set_thread_title"));
const codexPre = codex.hooks.PreToolUse[0].hooks[0];
const native = process.platform === "win32" ? ["powershell.exe", (c) => ["-NoProfile", "-NonInteractive", "-Command", c], "commandWindows"] : ["bash", (c) => ["-c", c], "command"];
const runCodex = (hook, payload) => spawnSync(native[0], native[1](hook[native[2]]), { cwd: path.join(root, "scripts"), input: JSON.stringify(payload), encoding: "utf8", env: process.env, windowsHide: true });
// Codex runs PostToolUse after a failed command too, with only the output text as tool_response.
out = runCodex(codexPost.hooks[0], { ...shell("h", "git worktree add -b fix/1-probe-failure Z:/none/probe no-such-ref"), hook_event_name: "PostToolUse", tool_response: "Preparing worktree (new branch 'fix/1-probe-failure')\nfatal: not a valid object name: 'no-such-ref'\n" });
assert.equal(out.status, 0, out.stderr);
assert.equal(out.stdout.trim(), "");
out = runCodex(codexPre, shell("h", "npm test"));
assert.equal(out.status, 0, out.stderr);
assert.equal(out.stdout.trim(), "", "a failed worktree command leaves the session ungated");
out = runCodex(codexPost.hooks[0], shell("g", create));
assert.equal(out.status, 0, out.stderr);
assert.match(JSON.parse(out.stdout).hookSpecificOutput.additionalContext, /set_thread_title/);
out = runCodex(codexPre, shell("g", "npm test"));
assert.equal(out.status, 0, out.stderr);
assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, "deny");
out = runCodex(codexPost.hooks[0], rename("g", "FIX #302: filterimage layers", "set_thread_title"));
assert.equal(out.status, 0, out.stderr);
out = runCodex(codexPre, shell("g", "npm test"));
assert.equal(out.status, 0, out.stderr);
assert.equal(out.stdout.trim(), "");

fs.rmSync(stateDir, { recursive: true });
fs.rmSync(fixture, { recursive: true, force: true });
console.log("PASS: session title derivation, per-session gate, rename confirmation, acknowledgement fallback and native hook wiring");

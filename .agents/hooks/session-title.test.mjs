import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, spawnSync } from "node:child_process";
import { testShell } from "../skills/drive-web-editor/redgreen.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "impower-title-test-"));
console.log("state directory: " + stateDir);
process.env.IMPOWER_SESSION_TITLE_DIR = stateDir;
const { deriveTitle, deriveWorktree, afterTool, gate, statePath, sessionKey, ackCommand, worktreeId }= await import("./session-title.mjs");

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

const wt302 = path.join(fixture, "impower.worktrees", "fix", "302-filterimage-layers");
const wtY = path.join(fixture, "y");

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
// A shell command run from inside a worktree, where the session-title gate applies.
const inWt = (session_id, command, tool_name = "Bash", cwd = wt302) => ({ ...shell(session_id, command, tool_name), cwd });
const rename = (session_id, title, tool_name = "mcp__ccd_session_mgmt__set_session_title", target = "self") => ({ session_id, tool_name, tool_input: tool_name.endsWith("set_thread_title") ? { title } : { session_id: target, title } });

// A worktree command that created nothing (it failed, or its branch has no worktree) records nothing.
assert.equal(afterTool(shell("failed", "git worktree add -b fix/303-never-created ../z origin/main"), "codex"), null);
assert.equal(gate(inWt("failed", "git status"), "codex"), null);
assert.equal(afterTool({ ...shell("failed", create), cwd: os.tmpdir() }, "codex"), null, "outside the repository no worktree is listed");
// A failed add for a branch that already has a worktree elsewhere records nothing either.
const duplicate = "git worktree add -b fix/302-filterimage-layers ../second-copy origin/main";
assert.notEqual(git(...duplicate.split(" ").slice(1)).status, 0, "git refuses the duplicate branch");
assert.equal(afterTool(shell("failed", duplicate), "codex"), null);
assert.equal(gate(inWt("failed", "git status"), "codex"), null);

// Unrelated sessions and commands record nothing and are never gated.
assert.equal(afterTool(shell("a", "git status"), "claude"), null);
assert.equal(fs.existsSync(statePath("a")), false);
assert.equal(gate(inWt("a", "git status"), "claude"), null);

// Creating the worktree records a pending title and names the exact rename call.
const context = afterTool(shell("a", create), "claude");
assert.match(context, /FIX #302: filterimage layers/);
assert.match(context, /set_session_title/);
assert.match(context, /tool search/i);
assert.ok(statePath("a").startsWith(stateDir), "state lives in the private directory");
const fromRoot = path.relative(root, statePath("a"));
assert.ok(fromRoot.startsWith("..") || path.isAbsolute(fromRoot), "state is never inside the checkout: " + fromRoot);

// The next shell command is denied until the rename happens.
const denied = gate(inWt("a", "git status"), "claude");
assert.match(denied, /FIX #302: filterimage layers/);
assert.match(gate(inWt("a", "Get-ChildItem", "PowerShell"), "claude"), /set_session_title/);

// A second session in another worktree is unaffected.
assert.equal(gate(inWt("b", "git status"), "claude"), null);

// A rename with a different title does not confirm; the exact title does.
assert.match(afterTool(rename("a", "Something else"), "claude"), /FIX #302: filterimage layers/);
assert.ok(gate(inWt("a", "git status"), "claude"));
assert.match(afterTool(rename("a", "FIX #302: filterimage layers", undefined, "local_other"), "claude"), /FIX #302/, "renaming another session does not confirm");
assert.ok(gate(inWt("a", "git status"), "claude"));
assert.equal(afterTool(rename("a", "FIX #302: filterimage layers"), "claude"), null);
assert.equal(gate(inWt("a", "git status"), "claude"), null);

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
assert.match(gate(inWt("a", "ls", "Bash", wtY), "claude"), /FEAT #9: second thing/);

// Codex names its own tool and offers the acknowledgement fallback, which the gate lets through.
const codexContext = afterTool(shell("c", create), "codex");
assert.match(codexContext, /set_thread_title/);
const ack = codexContext.match(/`(node [^`]+ confirm [^`]+)`/)?.[1];
assert.ok(ack, codexContext);
assert.ok(gate(inWt("c", "git status"), "codex"));
assert.equal(gate(inWt("c", ack), "codex"), null);
const hookPath = path.join(root, ".agents/hooks/session-title.mjs");
const keyC = sessionKey("c");
const idC = worktreeId(wt302);
assert.equal(gate(inWt("c", `node ${hookPath.replaceAll("\\", "/")} confirm ${keyC} ${idC}`), "codex"), null, "an unquoted path to the same script is accepted");
for (const other of [`node "C:/elsewhere/session-title.mjs" confirm ${keyC} ${idC}`, `node ./session-title.mjs confirm ${keyC} ${idC}`, `node "${hookPath}" confirm ${sessionKey("d")} ${idC}`, `node "${hookPath}" confirm c ${idC}`, `node "${hookPath}" confirm ${keyC}`, `node "${hookPath}" confirm ${keyC} ${worktreeId(wtY)}`, `${ack} && git status`, `${ack}; git status`, `node "${hookPath}" confirm ${keyC} ${idC} extra`]) {
  assert.ok(gate(inWt("c", other), "codex"), other);
}
assert.equal(afterTool(rename("c", "FIX #302: filterimage layers", "set_thread_title"), "codex"), null);
assert.equal(gate(inWt("c", "git status"), "codex"), null);

// The acknowledgement command confirms only the named session.
afterTool(shell("d", create), "codex");
afterTool(shell("e", create), "codex");
const cli = path.join(root, ".agents/hooks/session-title.mjs");
const confirm = (key, id = worktreeId(wt302)) => spawnSync(process.execPath, [cli, "confirm", key, id], { encoding: "utf8", env: process.env, windowsHide: true });
assert.equal(confirm(sessionKey("d"), worktreeId(wtY)).status, 1, "a worktree with no pending title is not acknowledged");
assert.ok(gate(inWt("d", "git status"), "codex"));
const confirmed = confirm(sessionKey("d"));
assert.equal(confirmed.status, 0, confirmed.stderr);
assert.equal(gate(inWt("d", "git status"), "codex"), null);
assert.ok(gate(inWt("e", "git status"), "codex"));
assert.equal(confirm(sessionKey("unknown")).status, 1);
assert.equal(confirm("d").status, 2, "only a session key is accepted");
assert.equal(spawnSync(process.execPath, [cli, "confirm", sessionKey("e")], { encoding: "utf8", env: process.env, windowsHide: true }).status, 2, "a worktree id is required");

// Session ids with spaces or shell syntax get a usable acknowledgement that contains neither.
const bashShell = process.platform === "win32" ? testShell() : "bash";
for (const odd of ["space id", "x;echo${IFS}INJECTED", "q'uote\"d"]) {
  const message = afterTool(shell(odd, create), "codex");
  const command = message.match(/`(node [^`]+ confirm [^`]+)`/)[1];
  assert.equal(command, ackCommand(odd, wt302));
  assert.ok(!command.includes(odd), command);
  assert.equal(gate(inWt(odd, command), "codex"), null, odd);
  const ran = spawnSync(bashShell, ["-c", command], { encoding: "utf8", env: process.env, windowsHide: true });
  assert.equal(ran.status, 0, ran.stderr);
  assert.doesNotMatch(ran.stdout, /INJECTED/);
  assert.equal(gate(inWt(odd, "git status"), "codex"), null, "the prescribed command clears the gate for " + odd);
}

// Session ids cannot escape the state directory.
assert.equal(path.dirname(statePath("../../evil")), stateDir);

// Distinct ids never share state, including ids that differ only in case or punctuation.
afterTool(shell("x/y", create), "claude");
afterTool(shell("x?y", "git worktree add -b feat/9-second-thing ../y origin/main"), "claude");
afterTool(shell("X/Y", create), "claude");
assert.notEqual(statePath("x/y"), statePath("x?y"));
assert.notEqual(statePath("x/y").toLowerCase(), statePath("X/Y").toLowerCase());
assert.match(gate(inWt("x/y", "ls"), "claude"), /FIX #302/);
assert.match(gate(inWt("x?y", "ls", "Bash", wtY), "claude"), /FEAT #9/);
afterTool(rename("x?y", "FEAT #9: second thing"), "claude");
assert.match(gate(inWt("x/y", "ls"), "claude"), /FIX #302/);
assert.match(gate(inWt("X/Y", "ls"), "claude"), /FIX #302/);

// Sibling writers that share one session id (subagents of one orchestrator) each own a worktree; a pending title
// gates only the shell commands that run in or name its own worktree, and each is cleared on its own.
{
  const wt9 = wtY;
  const at = (cwd, command) => ({ ...shell("shared", command), cwd });
  afterTool(shell("shared", create), "claude");
  afterTool(shell("shared", "git worktree add -b feat/9-second-thing ../y origin/main"), "claude");
  assert.match(gate(at(wt302, "git status"), "claude"), /FIX #302: filterimage layers/);
  assert.doesNotMatch(gate(at(wt302, "git status"), "claude"), /FEAT #9/, "a writer is told only about its own worktree");
  assert.match(gate(at(wt9, "git status"), "claude"), /FEAT #9: second thing/);
  assert.doesNotMatch(gate(at(wt9, "git status"), "claude"), /FIX #302/);
  assert.equal(gate(at(repo, "git status"), "claude"), null, "a writer outside every pending worktree is never refused");
  assert.equal(gate(at(os.tmpdir(), "git status"), "claude"), null);
  assert.match(gate(at(repo, `cd ${wt9.replaceAll("\\", "/")} && git status`), "claude"), /FEAT #9/, "entering a pending worktree from elsewhere is gated");
  assert.equal(gate(at(repo, "git -C ../y-other status"), "claude"), null, "a sibling directory with a longer name is not the worktree");
  // The rename of one title clears only that worktree.
  assert.equal(afterTool(rename("shared", "FIX #302: filterimage layers"), "claude"), null);
  assert.equal(gate(at(wt302, "git status"), "claude"), null);
  assert.match(gate(at(wt9, "git status"), "claude"), /FEAT #9/);
  // A rename issued from inside the sibling's worktree does not acknowledge this worktree's title.
  afterTool(shell("shared", create), "claude");
  const siblingRename = afterTool({ ...rename("shared", "FIX #302: filterimage layers"), cwd: wt9 }, "claude");
  assert.match(siblingRename, /FEAT #9: second thing/, "the sibling is told its own title");
  assert.match(gate(at(wt302, "git status"), "claude"), /FIX #302/, "the rename from another worktree left this one pending");
  assert.equal(afterTool({ ...rename("shared", "FIX #302: filterimage layers"), cwd: wt302 }, "claude"), null);
  assert.equal(gate(at(wt302, "git status"), "claude"), null, "a rename from its own worktree acknowledges it");
  afterTool(shell("shared", create), "claude");
  // The event names no writer, so a rename from outside every pending worktree acknowledges the entry with that exact title and no other.
  assert.equal(afterTool({ ...rename("shared", "FEAT #9: second thing"), cwd: repo }, "claude"), null);
  assert.equal(gate(at(wt9, "git status"), "claude"), null);
  assert.match(gate(at(wt302, "git status"), "claude"), /FIX #302/, "the other worktree stays pending");
  afterTool(shell("shared", "git worktree add -b feat/9-second-thing ../y origin/main"), "claude");
  // The acknowledgement command clears only the worktree it names.
  afterTool(shell("shared", create), "claude");
  assert.equal(gate(at(wt9, ackCommand("shared", wt302)), "claude") === null, false, "the sibling's acknowledgement does not clear this worktree");
  const ackWt9 = ackCommand("shared", wt9);
  assert.equal(gate(at(wt9, ackWt9), "claude"), null);
  const cli = path.join(root, ".agents/hooks/session-title.mjs");
  assert.equal(spawnSync(process.execPath, [cli, "confirm", sessionKey("shared"), worktreeId(wt9)], { encoding: "utf8", env: process.env, windowsHide: true }).status, 0);
  assert.equal(gate(at(wt9, "git status"), "claude"), null);
  assert.match(gate(at(wt302, "git status"), "claude"), /FIX #302/, "confirming one worktree leaves the sibling pending");
  afterTool(rename("shared", "FIX #302: filterimage layers"), "claude");
}

// Sibling writers' hooks are separate processes: updates to one session's record are serialised, so none is lost.
{
  const post = path.join(root, ".agents/hooks/post-tool-use.mjs");
  const runPost = (payload) => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [post, "claude"], { env: process.env, windowsHide: true, stdio: ["pipe", "ignore", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`post hook exited ${code}: ${stderr}`))));
    child.stdin.end(JSON.stringify({ ...payload, hook_event_name: "PostToolUse" }));
  });
  const creation = (i) => {
    const branch = `fix/${600 + i}-race-${i}`;
    const target = path.join(fixture, "race", String(i));
    ok(git("worktree", "add", "-q", "-b", branch, target));
    return { target, title: `FIX #${600 + i}: race ${i}`, payload: shell("race", `git worktree add -b ${branch} ../race/${i} origin/main`) };
  };
  const [first, second, ...rest] = [0, 1, 2, 3, 4, 5, 6, 7].map(creation);
  // While another hook holds the session's lock, an update waits for it rather than overwriting the record.
  const lock = statePath("race") + ".lock";
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(lock, "held");
  const waiting = runPost(first.payload);
  await new Promise((resolve) => setTimeout(resolve, 600));
  assert.equal(fs.existsSync(statePath("race")), false, "an update does not write while the session's lock is held");
  fs.rmSync(lock);
  await waiting;
  assert.match(gate(inWt("race", "ls", "Bash", first.target), "claude"), new RegExp(first.title));
  // Concurrent hook processes each keep their own entry.
  await Promise.all([second, ...rest].map((created) => runPost(created.payload)));
  for (const created of [first, second, ...rest]) assert.match(gate(inWt("race", "ls", "Bash", created.target), "claude"), new RegExp(created.title), created.title);
}

// A command that names the worktree through a different spelling of its path is still gated.
{
  const wt = path.join(fixture, "spelling");
  ok(git("worktree", "add", "-q", "-b", "docs/700-spelled-path", wt));
  afterTool(shell("spelling", "git worktree add -b docs/700-spelled-path ../spelling origin/main"), "claude");
  const cwdElsewhere = (command) => ({ ...shell("spelling", command), cwd: repo });
  assert.match(gate(cwdElsewhere("cd ../spelling && git status"), "claude"), /DOCS #700/, "a relative operand resolves against the working directory");
  assert.match(gate(cwdElsewhere(`git -C "${path.join(wt, "..", "spelling").replaceAll("\\", "/")}" status`), "claude"), /DOCS #700/, "a path with a parent segment resolves to the worktree");
  assert.equal(gate(cwdElsewhere("git -C ../spelling-other status"), "claude"), null);
  if (process.platform === "win32") {
    const short = spawnSync("cmd.exe", ["/d", "/c", `for %I in ("${wt}") do @echo %~sI`], { encoding: "utf8", windowsHide: true, windowsVerbatimArguments: true }).stdout.trim();
    if (short && short.toLowerCase() !== wt.toLowerCase()) assert.match(gate(cwdElsewhere(`cd ${short.replaceAll("\\", "/")} && git status`), "claude"), /DOCS #700/, "the 8.3 spelling names the same worktree");
  }
}

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
out = run(claudePre.hooks[0].command, inWt("f", "git status"));
assert.equal(out.status, 0, out.stderr);
assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, "deny");
out = run(postRename.hooks[0].command, rename("f", "FIX #302: filterimage layers"));
assert.equal(out.status, 0, out.stderr);
out = run(claudePre.hooks[0].command, inWt("f", "git status"));
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
out = runCodex(codexPre, inWt("h", "git status"));
assert.equal(out.status, 0, out.stderr);
assert.equal(out.stdout.trim(), "", "a failed worktree command leaves the session ungated");
out = runCodex(codexPost.hooks[0], shell("g", create));
assert.equal(out.status, 0, out.stderr);
assert.match(JSON.parse(out.stdout).hookSpecificOutput.additionalContext, /set_thread_title/);
out = runCodex(codexPre, inWt("g", "git status"));
assert.equal(out.status, 0, out.stderr);
assert.equal(JSON.parse(out.stdout).hookSpecificOutput.permissionDecision, "deny");
out = runCodex(codexPost.hooks[0], rename("g", "FIX #302: filterimage layers", "set_thread_title"));
assert.equal(out.status, 0, out.stderr);
out = runCodex(codexPre, inWt("g", "git status"));
assert.equal(out.status, 0, out.stderr);
assert.equal(out.stdout.trim(), "");

fs.rmSync(stateDir, { recursive: true });
fs.rmSync(fixture, { recursive: true, force: true });
console.log("PASS: session title derivation, per-session gate, rename confirmation, acknowledgement fallback and native hook wiring");

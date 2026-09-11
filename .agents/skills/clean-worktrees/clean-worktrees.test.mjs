#!/usr/bin/env node
// Pins the decisions behind clean-worktrees.mjs and the commands it runs.
// Run:
//   node .agents/skills/clean-worktrees/clean-worktrees.test.mjs
//
// classify, readReflog, parseArgs, serversFrom, usersOf, strayDirs and
// strayReason take their inputs as parameters, so their tables are pinned
// here without a repository. The command as a whole is pinned by running
// `main` in-process against a stub of everything it asks the system: the stub
// answers each git, driver and process-listing call from a table of worktrees
// in every state the script decides on, models what real git does when
// `git worktree remove` fails (it deletes the tree's entries in directory
// order until one it cannot delete, then drops its record; a refusal before
// that keeps the record and touches nothing), and records what the script
// removes. The dry run must remove nothing; `--apply` must be given the main
// checkout as --root, must remove the merged clean ones only, delete their
// branches and any type directory left empty, keep the held and the changed
// ones untouched, keep a tree holding a link that leads outside it, report a
// gutted tree, a probe that could not be renamed back and a failed branch
// deletion as `failed` with the directory's state, record every row in the
// log, and on the next run list the leftover directory with the branch it
// stranded and read a stranded branch's commits again before advising -D.
// Controls run those same checks against copies of the script with one rule
// cut out, and require them to fail naming the worktree that rule protects.
// The real commands are pinned on a scratch repository with a held worktree,
// one in use, a fresh one, one stacked on a merged tip, one fast-forwarded,
// one fast-forwarded onto a branch merged later, one merged by fast-forward,
// one merged with its reflog expired, one whose remote is ahead, one whose
// removal git cannot finish, one holding a junction to a directory outside
// it, one removable, one dirty and one holding the default branch, by
// running the script as a command. The held tree and the part-way failure
// depend on Windows refusing a rename and a long path, so those two are
// skipped elsewhere. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "clean-worktrees.mjs");
const { classify, readReflog, parseArgs, serversFrom, serverRows, probeServers, recordedServer, usersOf, strayDirs, strayReason, unfinishedRemovals, strandedBranches, readLogRows, parseWorktreeList, formatBytes, scanTree, linkReason, main, LOG_NAME } = await import(pathToFileURL(SCRIPT));
const WIN = process.platform === "win32";
// A case that can only hold where Windows itself supplies the behavior it
// asserts. It names its own reason, because the reasons differ: a refused
// rename, a path too long, a junction, a backslash-and-case command line.
const skip = (name, reason) => console.log(`SKIP: ${name} (Windows only: ${reason})`);

let failures = 0;
const check = async (name, fn) => {
  try {
    await fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

// ------------------------------------------------------------ pure tables ---

await check("parseWorktreeList reads every kind of stanza", () => {
  const text = [
    "worktree C:/repo/impower",
    "HEAD aaaa",
    "branch refs/heads/main",
    "",
    "worktree C:/repo/impower.worktrees/fix/1-x",
    "HEAD bbbb",
    "branch refs/heads/fix/1-x",
    "locked being used",
    "",
    "worktree C:/repo/impower.worktrees/gone",
    "HEAD cccc",
    "detached",
    "prunable gitdir file points to non-existent location",
    "",
  ].join("\n");
  const [main, fix, gone] = parseWorktreeList(text);
  assert.deepEqual(main, { path: "C:/repo/impower", head: "aaaa", branch: "main", detached: false, bare: false, locked: null, prunable: null });
  assert.equal(fix.branch, "fix/1-x");
  assert.equal(fix.locked, "being used");
  assert.equal(gone.branch, null);
  assert.equal(gone.detached, true);
  assert.equal(gone.prunable, "gitdir file points to non-existent location");
});

await check("parseArgs takes --apply only with --root, and --root only with an absolute path", () => {
  const abs = path.resolve("/repo/impower");
  assert.deepEqual(parseArgs([]), { apply: false, root: null });
  assert.deepEqual(parseArgs(["--apply", "--root", abs]), { apply: true, root: abs });
  assert.deepEqual(parseArgs([`--root=${abs}`, "--apply"]), { apply: true, root: abs });
  assert.deepEqual(parseArgs(["--root", abs]), { apply: false, root: abs });
  assert.throws(() => parseArgs(["--apply"]), /--apply needs --root <path>, the main checkout it is to act on/);
  assert.throws(() => parseArgs(["--apply", "--root"]), /--root needs the path of the main checkout after it/);
  assert.throws(() => parseArgs(["--root="]), /--root needs the path/);
  for (const rel of [".", "..", "impower", "../impower", "./impower"]) assert.throws(() => parseArgs(["--apply", "--root", rel]), /--root .* is not an absolute path; --root names the main checkout in full/, `--root ${rel} was accepted`);
  assert.throws(() => parseArgs(["--root=."]), /is not an absolute path/);
  assert.throws(() => parseArgs(["--all"]), /unknown option --all; the options are --apply and --root <path>/);
});

const entry = (over = {}) => ({ path: "C:/repo/impower.worktrees/fix/1-x", head: "bbbb", branch: "fix/1-x", detached: false, bare: false, locked: null, prunable: null, ...over });
const facts = (over = {}) => ({
  isMain: false,
  isDefault: false,
  insideRoot: true,
  root: "C:/repo/impower.worktrees",
  missing: false,
  probeLeft: false,
  unborn: false,
  dirty: 0,
  ignored: [],
  ownCommits: 0,
  unpushed: 0,
  remoteExists: false,
  remoteAhead: 0,
  onFirstParent: false,
  committed: true,
  created: false,
  servers: [],
  users: [],
  ...over,
});

await check("a clean merged branch is removed, whether or not its remote still exists, naming every ignored path it takes", () => {
  let v = classify(entry(), facts());
  assert.equal(v.remove, true);
  assert.deepEqual(v.reasons, ["merged into origin/main; no origin/fix/1-x"]);
  v = classify(entry(), facts({ remoteExists: true, ignored: ["node_modules/", ".agents/skills/drive-web-editor/.chrome-profile/"] }));
  assert.equal(v.remove, true);
  assert.deepEqual(v.reasons, ["merged into origin/main; origin/fix/1-x still exists; takes 2 ignored paths with it (node_modules/, .agents/skills/drive-web-editor/.chrome-profile/)"]);
  const many = Array.from({ length: 15 }, (_, i) => `p${i}/`);
  v = classify(entry(), facts({ ignored: many }));
  assert.deepEqual(v.reasons, [`merged into origin/main; no origin/fix/1-x; takes 15 ignored paths with it (${many.join(", ")})`]);
});

const kept = (e, f, ...phrases) => {
  const v = classify(e, f);
  assert.equal(v.remove, false, `removed: ${v.reasons.join("; ")}`);
  for (const p of phrases) assert.ok(v.reasons.some((r) => r.includes(p)), `no reason says '${p}' in: ${v.reasons.join("; ")}`);
  return v;
};

await check("the main checkout is kept and nothing else about it is judged", () => {
  const v = kept(entry({ path: "C:/repo/impower", branch: "main" }), facts({ isMain: true, insideRoot: false }), "the main checkout");
  assert.equal(v.reasons.length, 1);
});

await check("a path outside the worktrees directory is kept", () => {
  kept(entry({ path: "C:/repo/impower/.claude/worktrees/x" }), facts({ insideRoot: false }), "outside C:/repo/impower.worktrees");
});

await check("a worktree holding the default branch is kept and nothing else about it is judged", () => {
  const v = kept(entry({ path: "C:/repo/impower.worktrees/main-copy", branch: "main", head: "m3" }), facts({ isDefault: true, committed: false, onFirstParent: true }), "the default branch main, which is never removed wherever it is checked out");
  assert.equal(v.reasons.length, 1);
  kept(entry({ path: "C:/repo/impower.worktrees/trunk-copy", branch: "trunk" }), facts({ isDefault: true, dirty: 3 }), "the default branch trunk, which is never removed wherever it is checked out");
});

await check("a dirty tree is kept", () => {
  const v = kept(entry(), facts({ dirty: 4 }), "uncommitted changes (4 files)");
  assert.equal(v.reasons.length, 1);
  kept(entry(), facts({ dirty: 1 }), "uncommitted changes (1 file)");
});

await check("commits on neither origin/main nor a remote are kept", () => {
  kept(entry(), facts({ ownCommits: 2, unpushed: 2 }), "2 commits not on origin/main, and no origin/fix/1-x holds them");
  kept(entry(), facts({ ownCommits: 3, unpushed: 1, remoteExists: true, remoteAhead: 2 }), "1 commit on neither origin/main nor origin/fix/1-x");
});

await check("commits on the remote but not on origin/main are kept as an open pull request, whether the local branch holds them or is behind", () => {
  kept(entry(), facts({ ownCommits: 3, unpushed: 0, remoteExists: true, remoteAhead: 3 }), "3 commits not on origin/main (all on origin/fix/1-x; a pull request may be open)");
  kept(entry(), facts({ remoteExists: true, remoteAhead: 2 }), "origin/fix/1-x has 2 commits not on origin/main and this branch is behind it; a pull request may be open");
});

await check("a detached head is kept and nothing else about it is judged", () => {
  const v = kept(entry({ branch: null, detached: true }), facts({ dirty: 9, servers: [{ state: "up", url: "u", pid: 1 }] }), "detached head");
  assert.equal(v.reasons.length, 1);
});

await check("an unborn branch is kept and nothing else about it is judged", () => {
  const v = kept(entry({ head: "0000000000000000000000000000000000000000" }), facts({ unborn: true, committed: false, onFirstParent: true }), "unborn branch with no commits; left for a person");
  assert.equal(v.reasons.length, 1);
});

await check("a worktree with dev servers up or launching, or a driver that cannot answer, is kept; no driver is no reason", () => {
  kept(entry(), facts({ servers: [{ state: "up", url: "http://localhost:40444", pid: 25992 }] }), "dev servers up at http://localhost:40444 (pid 25992)");
  kept(entry(), facts({ servers: [{ state: "launching", url: "http://localhost:38200", pid: 31268, driver: "drive-web-editor" }] }), "dev servers launching (pid 31268 alive", "through drive-web-editor; the worktree's driver `down` settles it");
  kept(entry(), facts({ servers: [{ state: "unknown", detail: "SyntaxError" }] }), "its driver could not report its servers (SyntaxError)");
  assert.equal(classify(entry(), facts({ servers: [] })).remove, true);
  assert.equal(classify(entry(), facts({ servers: [{ state: "down" }] })).remove, true);
});

await check("every driver's answer but a down is its own row, whatever the other drivers said", () => {
  const web = { state: "up", url: "http://localhost:1", pid: 1, driver: "drive-web-editor" };
  const vsc = { state: "launching", url: "http://localhost:2", pid: 2, driver: "drive-vscode-web" };
  const crashed = { state: "unknown", detail: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module", driver: "drive-vscode-web" };
  const recorded = { state: "recorded", url: "http://localhost:3", pid: 3, detail: "no output", driver: "drive-vscode-web" };
  assert.deepEqual(serverRows([web, vsc]), [web, vsc]);
  assert.deepEqual(serverRows([{ state: "down", driver: "drive-web-editor" }, vsc]), [vsc]);
  assert.deepEqual(serverRows([{ state: "down", driver: "drive-web-editor" }, crashed]), [crashed], "one driver's down says nothing about another driver's servers");
  assert.deepEqual(serverRows([{ state: "down", driver: "drive-web-editor" }, recorded]), [recorded]);
  assert.deepEqual(serverRows([crashed]), [crashed]);
  assert.deepEqual(serverRows([crashed, { state: "unknown", detail: "no output", driver: "drive-web-editor" }]), [crashed, { state: "unknown", detail: "no output", driver: "drive-web-editor" }]);
  assert.deepEqual(serverRows([web, crashed]), [web, crashed], "a live server does not hide a driver that could not answer");
  assert.deepEqual(serverRows([{ state: "down", url: "u", pid: 9, driver: "drive-vscode-web" }]), [], "a stale record read from the state file is a down");
  assert.deepEqual(serverRows([]), []);
  const v = kept(entry(), facts({ servers: [web, vsc] }), "dev servers up at http://localhost:1 (pid 1) through drive-web-editor", "dev servers launching (pid 2 alive, http://localhost:2 not answering) through drive-vscode-web");
  assert.equal(v.reasons.length, 2);
  kept(entry(), facts({ servers: [{ state: "down", driver: "drive-web-editor" }, crashed] }), "its driver through drive-vscode-web could not report its servers (Error [ERR_MODULE_NOT_FOUND]: Cannot find module)");
  kept(entry(), facts({ servers: [{ state: "down", driver: "drive-web-editor" }, recorded] }), "its driver through drive-vscode-web could not report its servers (no output), and its state file records pid 3 alive at http://localhost:3; the worktree's driver `down` settles it once the driver runs, or stop the pid by hand");
  assert.equal(classify(entry(), facts({ servers: [{ state: "down", driver: "drive-web-editor" }, { state: "down", driver: "drive-vscode-web" }] })).remove, true);
});

await check("recordedServer judges a driver that could not answer by its own state file: none is down, a live pid is a recorded server, a dead pid is stale, unreadable or empty stays unknown", () => {
  const file = path.join("C:", "wt", ".agents", "skills", "drive-vscode-web", ".state.json");
  const deps = (content) => ({ exists: (p) => content != null && p === file, readFile: (p) => (p === file ? content : (() => { throw new Error("ENOENT"); })()), pidAlive: (pid) => pid === 5 });
  assert.deepEqual(recordedServer(file, deps(null), "why"), { state: "down", detail: "why" });
  assert.deepEqual(recordedServer(file, deps('{"url":"http://localhost:9","pid":5}'), "why"), { state: "recorded", url: "http://localhost:9", pid: 5, detail: "why" });
  assert.deepEqual(recordedServer(file, deps('{"url":"http://localhost:9","pid":6}'), "why"), { state: "down", detail: "why", url: "http://localhost:9", pid: 6 });
  const unreadable = recordedServer(file, deps("{not json"), "why");
  assert.equal(unreadable.state, "unknown");
  assert.match(unreadable.detail, /^why; its state file could not be read \(.+JSON.*\)$/, "the parse error is named, whatever this Node phrases it as");
  assert.deepEqual(recordedServer(file, deps('{"port":9}'), "why"), { state: "unknown", detail: "why; its state file names no server" });
  assert.deepEqual(recordedServer(file, deps("null"), "why"), { state: "unknown", detail: "why; its state file names no server" });
});

await check("probeServers asks every driver the worktree has, in order, names each answer by its driver, and reads the state file of one that could not answer", () => {
  const wt = path.join("C:", "wt");
  const outputs = {
    [path.join(wt, ".agents", "skills", "drive-web-editor", "driver.mjs")]: "DOWN  url=http://localhost:1  pid=7  mode=same-origin",
    [path.join(wt, ".agents", "skills", "drive-vscode-web", "driver.mjs")]: "UP  url=http://localhost:2  pid=8  project=p  log=l",
  };
  const files = {};
  const ran = [];
  const read = [];
  const deps = {
    exists: (p) => Object.hasOwn(outputs, p) || Object.hasOwn(files, p),
    readFile: (p) => {
      read.push(p);
      return files[p];
    },
    exec: (cmd, args, cwd) => {
      ran.push([args[0], args[1], cwd]);
      return { status: 0, out: outputs[args[0]], err: "" };
    },
    pidAlive: (pid) => pid === 7,
  };
  assert.deepEqual(probeServers(wt, deps), [
    { state: "launching", url: "http://localhost:1", pid: 7, driver: "drive-web-editor" },
    { state: "up", url: "http://localhost:2", pid: 8, driver: "drive-vscode-web" },
  ]);
  assert.deepEqual(ran.map((r) => [r[1], r[2]]), [["status", wt], ["status", wt]]);
  assert.deepEqual(read, [], "a driver that answered is not second-guessed by its state file");
  assert.deepEqual(probeServers(path.join("C:", "elsewhere"), deps), [], "a worktree with no driver has no answers");
  const stateFile = path.join(wt, ".agents", "skills", "drive-vscode-web", ".state.json");
  outputs[path.join(wt, ".agents", "skills", "drive-vscode-web", "driver.mjs")] = "file:///x/driver.mjs:33\nError [ERR_MODULE_NOT_FOUND]: Cannot find module";
  assert.deepEqual(probeServers(wt, deps)[1], { state: "down", detail: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module", driver: "drive-vscode-web" }, "a crashed driver with no state file started nothing");
  files[stateFile] = '{"url":"http://localhost:2","pid":7}';
  assert.deepEqual(probeServers(wt, deps)[1], { state: "recorded", url: "http://localhost:2", pid: 7, detail: "Error [ERR_MODULE_NOT_FOUND]: Cannot find module", driver: "drive-vscode-web" });
  assert.deepEqual(read, [stateFile]);
  // The web editor driver keeps its state beside itself, or under
  // resolve-issue/ where a server launched from there is still recorded;
  // a crashed one is judged by whichever it would read.
  outputs[path.join(wt, ".agents", "skills", "drive-web-editor", "driver.mjs")] = "file:///x/driver.mjs:1\nSyntaxError: bad";
  const beside = path.join(wt, ".agents", "skills", "drive-web-editor", ".state.json");
  const previous = path.join(wt, ".agents", "skills", "resolve-issue", ".state.json");
  assert.deepEqual(probeServers(wt, deps)[0], { state: "down", detail: "SyntaxError: bad", driver: "drive-web-editor" });
  files[previous] = '{"url":"http://localhost:3","pid":7}';
  read.length = 0;
  assert.deepEqual(probeServers(wt, deps)[0], { state: "recorded", url: "http://localhost:3", pid: 7, detail: "SyntaxError: bad", driver: "drive-web-editor" }, "the state file under resolve-issue/ is the web editor driver's when none sits beside it");
  files[beside] = '{"url":"http://localhost:4","pid":8}';
  read.length = 0;
  assert.deepEqual(probeServers(wt, deps)[0], { state: "down", detail: "SyntaxError: bad", url: "http://localhost:4", pid: 8, driver: "drive-web-editor" }, "the file beside the driver is the one it reads when both exist");
  assert.deepEqual(read, [beside, stateFile]);
});

await check("a worktree whose path a running process names is kept, and one whose processes could not be listed", () => {
  kept(entry(), facts({ users: [{ pid: 4012, name: "node.exe" }] }), "its path is on the command line of pid 4012 (node.exe)");
  kept(entry(), facts({ users: [{ pid: 1, name: "a" }, { pid: 2, name: "b" }, { pid: 3, name: "c" }] }), "its path is on the command line of pid 1 (a), pid 2 (b) and 1 more");
  kept(entry(), facts({ users: null }), "the processes on this machine could not be listed");
});

await check("a locked worktree, one whose directory is gone, and one git no longer sees as a worktree are kept", () => {
  kept(entry({ locked: "in use" }), facts(), "locked (in use)");
  kept(entry({ prunable: "gitdir file points to non-existent location" }), facts(), "git no longer sees it as a worktree (gitdir file points to non-existent location) but the directory is still there; delete it by hand");
  kept(entry({ prunable: "gitdir file points to non-existent location" }), facts({ missing: true }), "its directory is gone; `git worktree prune` drops the record");
  kept(entry(), facts({ missing: true }), "its directory is gone; `git worktree prune` drops the record");
  const v = kept(entry({ prunable: "gitdir file points to non-existent location" }), facts({ missing: true, probeLeft: true }), `its directory is gone and ${path.resolve("C:/repo/impower.worktrees/fix/1-x")}.removing is beside it, which is what an interrupted run's probe leaves; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record the renamed tree points at`);
  assert.ok(!v.reasons.some((r) => r.includes("`git worktree prune` drops the record")), `the row still says to prune: ${v.reasons.join("; ")}`);
});

await check("a branch with no commit made on it is kept as a fresh worktree, by its tip on the first-parent line or by a reflog reaching its creation; one whose reflog can tell neither is left for a person; a merged one with a commit in its reflog goes", () => {
  kept(entry(), facts({ committed: false, onFirstParent: true }), "no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none (no origin/fix/1-x); a fresh worktree a session may be working in, so remove it by hand when it is done");
  kept(entry(), facts({ committed: false, created: true, remoteExists: true }), "no commit was made on the branch: its reflog holds its creation and no commit since (origin/fix/1-x exists); a fresh worktree a session may be working in, so remove it by hand when it is done");
  kept(entry(), facts({ committed: false }), "its reflog records neither a commit nor its creation, so whether a commit was made on it cannot be told, and its tip is off origin/main's first-parent line (no origin/fix/1-x); left for a person, and `git worktree remove` plus `git branch -D` by hand once its commits are checked");
  assert.equal(classify(entry(), facts({ committed: true, onFirstParent: true })).remove, true, "a branch merged by fast-forward with commits made on it was kept");
  assert.equal(classify(entry(), facts({ committed: true, created: true })).remove, true, "a merged branch with a full reflog was kept");
});

await check("readReflog reads git's own reflog messages", () => {
  const tip = "a5b64c1dfbd108cf93c1aa0cdcc6c99a477d410d";
  const base = "d1d1875d2f595d6d710436dfaa651cfff1fbaadf";
  assert.deepEqual(readReflog(`${tip}\tmerge origin/main: Fast-forward\n${base}\tbranch: Created from origin/main~1`), { committed: false, created: true });
  assert.deepEqual(readReflog(`${tip}\tmerge feat/a: Fast-forward\n${base}\tbranch: Created from main`), { committed: false, created: true });
  assert.deepEqual(readReflog(`${tip}\trebase (finish): refs/heads/task/rebased onto ${tip}\n${base}\tbranch: Created from origin/main~1`), { committed: false, created: true });
  assert.deepEqual(readReflog(`${tip}\tbranch: Created from fix/locked`), { committed: false, created: true });
  assert.deepEqual(readReflog(`${tip}\tcommit: work\n${base}\tbranch: Created from fix/locked`), { committed: true, created: true });
  assert.deepEqual(readReflog(`${base}\treset: moving to HEAD~1\n${tip}\tcommit (amend): work2\nffff\tcommit: work\n${base}\tbranch: Created from fix/locked`), { committed: true, created: true });
  assert.deepEqual(readReflog(`${tip}\tcherry-pick: x\n${base}\tbranch: Created from origin/main`), { committed: true, created: true });
  assert.deepEqual(readReflog(`${tip}\tmerge fix/d: Merge made by the 'ort' strategy.\n${base}\tbranch: Created from origin/main~1`), { committed: true, created: true });
  assert.deepEqual(readReflog(`${tip}\tmerge origin/main: Fast-forward`), { committed: false, created: false });
  assert.deepEqual(readReflog(`${tip}\tcommit: work`), { committed: true, created: false });
  assert.deepEqual(readReflog(""), { committed: false, created: false });
});

await check("every reason that applies is listed", () => {
  const v = kept(entry(), facts({ dirty: 2, ownCommits: 1, unpushed: 1, servers: [{ state: "up", url: "u", pid: 7 }], users: [{ pid: 9, name: "x" }] }), "uncommitted changes", "1 commit not on origin/main", "dev servers up", "its path is on the command line of pid 9 (x)");
  assert.equal(v.reasons.length, 4);
});

await check("serversFrom reads the driver's status line whatever it exits", () => {
  assert.deepEqual(serversFrom("UP  url=http://localhost:40444  pid=25992  mode=same-origin  state=x\n"), { state: "up", url: "http://localhost:40444", pid: 25992 });
  assert.deepEqual(serversFrom("DOWN  url=http://localhost:38200  pid=31268  mode=same-origin", () => true), { state: "launching", url: "http://localhost:38200", pid: 31268 });
  assert.deepEqual(serversFrom("DOWN  url=http://localhost:38200  pid=31268  mode=same-origin", () => false), { state: "down", url: "http://localhost:38200", pid: 31268 });
  assert.deepEqual(serversFrom("down (no state file)\n"), { state: "down" });
  assert.deepEqual(serversFrom("unknown (state file unreadable: x; `down` removes it)"), { state: "unknown", detail: "unknown (state file unreadable: x; `down` removes it)" }, "a record that cannot be read may name a live server");
  assert.deepEqual(serversFrom("down (state file unreadable: x; `down` removes it)"), { state: "unknown", detail: "down (state file unreadable: x; `down` removes it)" }, "an older driver's wording for the same condition");
  assert.deepEqual(serversFrom("file:///x/driver.mjs:1\nSyntaxError: bad\n"), { state: "unknown", detail: "SyntaxError: bad" }, "the error, not the Node frame before it");
  assert.deepEqual(serversFrom("something odd\n"), { state: "unknown", detail: "something odd" });
  assert.deepEqual(serversFrom(""), { state: "unknown", detail: "no output" });
});

await check("usersOf matches a command line naming the directory or a path under it, either slash and case, at a path boundary, never itself", () => {
  const dir = "C:\\repo\\impower.worktrees\\fix\\1-x";
  const procs = [
    { pid: 1, name: "node.exe", cmd: '"node" "C:\\repo\\impower.worktrees\\fix\\1-x\\node_modules\\vite\\bin\\vite.js"' },
    { pid: 2, name: "node.exe", cmd: "node --import file:///C:/REPO/impower.worktrees/fix/1-x/x.mjs" },
    { pid: 3, name: "node.exe", cmd: "node C:\\repo\\impower.worktrees\\fix\\1-x-other\\a.js" },
    { pid: 4, name: "node.exe", cmd: "node C:\\repo\\impower.worktrees\\fix\\1-x" },
    { pid: 5, name: "node.exe", cmd: "node C:\\repo\\impower.worktrees\\fix\\1-x\\clean.mjs" },
    { pid: 6, name: "svchost.exe", cmd: null },
  ];
  assert.deepEqual(usersOf(dir, procs, 5, "win32").map((p) => p.pid), [1, 2, 4]);
});

await check("usersOf preserves POSIX case and literal backslashes while matching native paths", () => {
  const dir = "/repo/impower.worktrees/fix/1-x";
  const procs = [
    { pid: 1, cmd: 'node "/repo/impower.worktrees/fix/1-x/script.mjs"' },
    { pid: 2, cmd: "node /REPO/impower.worktrees/fix/1-x/script.mjs" },
    { pid: 3, cmd: "node /repo/impower.worktrees/fix/1-x-other/script.mjs" },
    { pid: 4, cmd: "node /repo/impower.worktrees/fix/1-x" },
    { pid: 5, cmd: "node /repo/impower.worktrees/fix/1-x/self.mjs" },
    { pid: 6, cmd: "node /repo/impower.worktrees/fix/1-x\\literal" },
  ];
  assert.deepEqual(usersOf(dir, procs, 5, "linux").map((p) => p.pid), [1, 4]);
});

await check("strayDirs lists directories under the root that are not worktrees and hold none", () => {
  const root = path.resolve("/repo/impower.worktrees");
  const at = (...p) => path.join(root, ...p);
  const entries = [{ path: path.resolve("/repo/impower") }, { path: at("fix", "1-x") }, { path: at("flat") }, { path: at("impower", "deep", "3-z") }];
  const tree = { [root]: ["fix", "flat", "leftover", "impower"], [at("fix")]: ["1-x", "husk"], [at("impower")]: ["deep", "stray2"], [at("impower", "deep")]: ["3-z", "not-listed-this-deep"] };
  const listDirs = (p) => tree[path.resolve(p)] ?? [];
  assert.deepEqual(strayDirs(entries, root, listDirs), [at("fix", "husk"), at("leftover"), at("impower", "stray2")]);
  assert.deepEqual(strayDirs(entries, root, () => []), []);
});

await check("strayReason names the probe's leftover and the branch a failed or interrupted removal stranded, from the log, on the leftover or on the type directory holding it", () => {
  const root = path.resolve("/repo/impower.worktrees");
  const at = (...p) => path.join(root, ...p);
  const ctx = { mainRoot: path.resolve("/repo/impower") };
  const entries = [{ path: at("fix", "1-x") }, { path: at("fix", "2-y") }];
  const present = new Set([at("fix", "2-y")]);
  const branches = new Set(["fix/3-z", "perf/7-t"]);
  const deps = { exists: (p) => present.has(p), exec: (cmd, args) => ({ status: branches.has(args[3]?.replace(/^refs\/heads\//, "")) ? 0 : 1, out: "", err: "" }) };
  const log = [
    JSON.stringify({ at: "t1", run: "--apply --root x", main: "x" }),
    "{not json",
    JSON.stringify({ at: "t1", decision: "removing", path: at("fix", "3-z"), branch: "fix/3-z", why: "merged" }),
    JSON.stringify({ at: "t1", decision: "failed", path: at("fix", "3-z"), branch: "fix/3-z", why: "git worktree remove stopped part-way (boom) and dropped its record" }),
    JSON.stringify({ at: "t2", decision: "failed", path: at("fix", "4-w"), branch: "fix/4-w", why: "the directory was renamed" }),
    JSON.stringify({ at: "t3", decision: "removing", path: at("fix", "5-v"), branch: "fix/5-v", why: "merged" }),
    JSON.stringify({ at: "t3", decision: "removed", path: at("fix", "5-v"), branch: "fix/5-v", why: "merged" }),
    JSON.stringify({ at: "t4", decision: "removing", path: at("perf", "7-t"), branch: "perf/7-t", why: "merged into origin/main; no origin/perf/7-t" }),
  ].join("\n");
  assert.equal(readLogRows(log).length, 7);
  assert.deepEqual(unfinishedRemovals(log).map((r) => `${r.decision} ${r.branch} ${r.at}`), ["failed fix/3-z t1", "failed fix/4-w t2", "removing perf/7-t t4"]);
  const rel = (p) => path.relative(path.resolve("/repo"), p);
  assert.equal(strayReason(at("fix", "1-x.removing"), entries, log, deps, ctx), `the worktree ${rel(at("fix", "1-x"))}, renamed by an interrupted run's probe and not renamed back; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record it points at`);
  assert.equal(strayReason(at("fix", "2-y.removing"), entries, log, deps, ctx), `not a registered worktree, named like the probe of ${rel(at("fix", "2-y"))}, which is registered and present; check it before deleting it by hand`);
  assert.equal(strayReason(at("fix", "3-z"), entries, log, deps, ctx), "not a registered worktree; the --apply run at t1 failed to remove it (git worktree remove stopped part-way (boom) and dropped its record); its branch fix/3-z is still local");
  assert.equal(strayReason(at("fix", "4-w.removing"), entries, log, deps, ctx), "not a registered worktree; the --apply run at t2 failed to remove it (the directory was renamed)");
  assert.equal(strayReason(at("fix", "5-v"), entries, log, deps, ctx), "not a registered worktree, which is what an interrupted removal or add leaves behind; delete it by hand after checking it");
  assert.equal(strayReason(at("fix", "6-u"), entries, "", deps, ctx), "not a registered worktree, which is what an interrupted removal or add leaves behind; delete it by hand after checking it");
  assert.equal(strayReason(at("perf", "7-t"), entries, log, deps, ctx), "not a registered worktree; the --apply run at t4 was removing it when that run stopped (merged into origin/main; no origin/perf/7-t); its branch perf/7-t is still local");
  assert.equal(strayReason(at("perf"), entries, log, deps, ctx), `not a registered worktree; it holds ${rel(at("perf", "7-t"))}, which the --apply run at t4 was removing when that run stopped (merged into origin/main; no origin/perf/7-t); its branch perf/7-t is still local`);
  assert.equal(strayReason(at("fix"), entries, log, deps, ctx), `not a registered worktree; it holds ${rel(at("fix", "3-z"))}, which the --apply run at t1 failed to remove (git worktree remove stopped part-way (boom) and dropped its record); its branch fix/3-z is still local; and ${rel(at("fix", "4-w"))}, which the --apply run at t2 failed to remove (the directory was renamed)`);
});

await check("strandedBranches keys the log by branch, so a worktree recreated at a stranded branch's path does not hide it, and a row with no branch names none", () => {
  const root = path.resolve("/repo/impower.worktrees");
  const at = (...p) => path.join(root, ...p);
  const log = [
    JSON.stringify({ at: "t1", decision: "removing", path: at("fix", "3-z"), branch: "fix/3-z", why: "merged" }),
    JSON.stringify({ at: "t1", decision: "failed", path: at("fix", "3-z"), branch: "fix/3-z", why: "stopped part-way" }),
    JSON.stringify({ at: "t2", decision: "kept", path: at("fix", "3-z"), branch: "fix/3-z-again", why: "uncommitted changes (1 file)" }),
    JSON.stringify({ at: "t3", decision: "removing", path: at("fix", "5-v"), branch: "fix/5-v", why: "merged" }),
    JSON.stringify({ at: "t3", decision: "removed", path: at("fix", "5-v"), branch: "fix/5-v", why: "merged" }),
    JSON.stringify({ at: "t4", decision: "removing", path: at("detached-6"), branch: null, why: "merged" }),
    JSON.stringify({ at: "t5", decision: "removing", path: at("fix", "7-t"), branch: "fix/7-t", why: "merged" }),
  ].join("\n");
  assert.deepEqual(unfinishedRemovals(log).map((r) => `${r.decision} ${r.branch} ${r.at}`), ["removing null t4", "removing fix/7-t t5"]);
  assert.deepEqual(strandedBranches(log).map((r) => `${r.decision} ${r.branch} ${r.at}`), ["failed fix/3-z t1", "removing fix/7-t t5"]);
  assert.deepEqual(strandedBranches(""), []);
});

const LINK_ADVICE = "git worktree remove follows a junction and deletes what it points at, so remove the link itself by hand and run again";
await check("linkReason names a link leading outside the tree, or a directory it could not read, and nothing for a tree whose links stay inside it", () => {
  const dir = path.resolve("/repo/impower.worktrees/fix/1-x");
  const at = (...p) => path.join(dir, ...p);
  const scan = (links, unreadable = []) => ({ bytes: 0, links, unreadable });
  assert.equal(linkReason(scan([{ link: at("node_modules", "impower-dev"), target: at("impower-dev") }, { link: at("self"), target: dir }]), dir), null);
  assert.equal(linkReason(scan([]), dir), null);
  const nm = path.resolve("/mnt/d/nm");
  assert.equal(linkReason(scan([{ link: at("node_modules"), target: nm }]), dir), `1 link inside it points outside it (node_modules -> ${nm}); ${LINK_ADVICE}`);
  for (const target of [path.dirname(dir), `${dir}-other`, path.resolve("/repo/impower")]) assert.ok(linkReason(scan([{ link: at("l"), target }]), dir), `a link to ${target} was read as inside ${dir}`);
  const four = ["a", "b", "c", "d"].map((x) => ({ link: at("node_modules", x), target: path.resolve("/elsewhere", x) }));
  assert.equal(linkReason(scan(four), dir), `4 links inside it point outside it (${four.slice(0, 3).map((l) => `${path.join("node_modules", path.basename(l.link))} -> ${l.target}`).join(", ")} and 1 more); ${LINK_ADVICE}`);
  assert.equal(linkReason(scan([], [`${at("node_modules", "x")}: EPERM`]), dir), `1 directory or link inside it could not be read (${path.join("node_modules", "x")}: EPERM), so whether a link inside it points outside it cannot be told; left for a person`);
  assert.equal(linkReason(scan([{ link: at("node_modules"), target: nm }], [`${at("y")}: EPERM`]), dir), `1 link inside it points outside it (node_modules -> ${nm}); ${LINK_ADVICE}`);
});

await check("scanTree reads the bytes under a directory, every link with its target, follows no link, and reports a directory it cannot read", async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "clean-worktrees-scan-"));
  const tree = path.join(d, "tree");
  try {
    fs.mkdirSync(path.join(tree, "sub"), { recursive: true });
    fs.mkdirSync(path.join(d, "outside"));
    fs.writeFileSync(path.join(tree, "a.txt"), "12345");
    fs.writeFileSync(path.join(tree, "sub", "b.txt"), "123");
    fs.writeFileSync(path.join(d, "outside", "big.txt"), "x".repeat(1000));
    fs.symlinkSync(path.join(d, "outside"), path.join(tree, "out-link"), WIN ? "junction" : "dir");
    fs.symlinkSync(path.join(tree, "sub"), path.join(tree, "in-link"), WIN ? "junction" : "dir");
    const s = await scanTree(tree);
    assert.equal(s.bytes, 8, "a link's target was walked");
    assert.deepEqual(s.links.map((l) => [path.relative(tree, l.link), l.target]).sort(), [["in-link", path.join(tree, "sub")], ["out-link", path.join(d, "outside")]]);
    assert.deepEqual(s.unreadable, []);
    assert.equal(linkReason(s, tree), `1 link inside it points outside it (out-link -> ${path.join(d, "outside")}); ${LINK_ADVICE}`);
    const missing = await scanTree(path.join(d, "nowhere"));
    assert.equal(missing.bytes, 0);
    assert.equal(missing.unreadable.length, 1, "a directory that cannot be read was not reported");
    assert.match(missing.unreadable[0], /nowhere: ENOENT/);
  } finally {
    fs.rmSync(d, { recursive: true, force: true });
  }
});

await check("formatBytes picks the unit", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1.1 * 1024 ** 3), "1.1 GB");
  assert.equal(formatBytes(null), "");
});

// ------------------------------------------------------------ stub world ---
//
// A main checkout at /repo/impower and worktrees in every state under
// /repo/impower.worktrees/, except the one under /repo/elsewhere/, plus three
// directories under the root that are not worktrees. The stub's `exec`
// answers each git command the script runs from that table, the driver
// `status` from the tree's `driver` line and the process listing from
// `processes`; its file-system calls read and change the table, so a removal
// shows up in the next command's answer. A `held` tree refuses the rename
// probe, as Windows does for a directory a process has a file open in; a
// `grabbed` tree is held only after the probe, so `git worktree remove`
// reaches it and does what real git does: deletes what sorts before the held
// entry, drops the record, and fails; a `blockedFirst` tree is one whose
// blocker sorts first, so git deletes nothing, drops the record and fails; a
// `refusesLate` tree is one git refuses before deleting anything, keeping
// its record; a `listFails` tree is one git refuses the same way while the
// `git worktree list` that follows fails once, so whether the record
// survived cannot be read; a `renameBackFails` tree is one whose probe
// rename succeeds and whose rename back does not; a tree's `links` are what
// the sizing walk finds in it, as [path inside the tree, absolute target],
// and its `unreadable` the directories that walk cannot read. origin/HEAD
// names trunk, so main and trunk are both default branches. origin/main's
// first-parent line is m1, m2, m3; every cN head is a merged branch's tip
// off that line.

const R = (...p) => path.resolve("/repo", ...p);
const MAIN = R("impower");
const ROOT = R("impower.worktrees");
const DRIVER = path.join(".agents", "skills", "drive-web-editor", "driver.mjs");
const LIVE_PID = 4242;
const SELF_PID = 100;
const NOW = "2026-09-07T16:00:00.000Z";
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const under = (child, parent) => {
  const rel = path.relative(path.resolve(parent).toLowerCase(), path.resolve(child).toLowerCase());
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};
const GB = 1024 ** 3;

function makeWorld() {
  const w = {
    cwd: MAIN,
    lines: [],
    log: [],
    trees: [
      { path: R("impower.worktrees/fix/1-merged-gone"), head: "c1", branch: "fix/1-merged-gone", size: 1.1 * GB, ignored: ["node_modules/", ".env.local"] },
      { path: R("impower.worktrees/fix/2-merged-kept-remote"), head: "c2", branch: "fix/2-merged-kept-remote", remote: true, size: 0.9 * GB },
      { path: R("impower.worktrees/fix/3-dirty"), head: "c3", branch: "fix/3-dirty", dirty: ["?? scratch.sd"] },
      { path: R("impower.worktrees/fix/4-unpushed"), head: "c4", branch: "fix/4-unpushed", own: 1, unpushed: 1 },
      { path: R("impower.worktrees/fix/5-open"), head: "c5", branch: "fix/5-open", own: 1, unpushed: 0, remote: true, remoteAhead: 1 },
      { path: R("impower.worktrees/fix/6-fresh"), head: "m3", branch: "fix/6-fresh", reflog: ["m3\tbranch: Created from origin/main"] },
      { path: R("impower.worktrees/fix/7-servers-up"), head: "c7", branch: "fix/7-servers-up", driver: "UP  url=http://localhost:1  pid=1  mode=same-origin  state=s" },
      { path: R("impower.worktrees/fix/8-servers-launching"), head: "c8", branch: "fix/8-servers-launching", driver: `DOWN  url=http://localhost:2  pid=${LIVE_PID}  mode=same-origin  state=s` },
      { path: R("impower.worktrees/fix/9-held"), head: "c9", branch: "fix/9-held", size: 2 * GB, held: true },
      { path: R("impower.worktrees/docs/10-merged-gone"), head: "c10", branch: "docs/10-merged-gone", size: 1 * GB },
      { path: R("impower.worktrees/detached-11"), head: "m2", detached: true },
      { path: R("impower.worktrees/fix/12-locked"), head: "c12", branch: "fix/12-locked", locked: "in use" },
      { path: R("elsewhere/fix-13-outside"), head: "c13", branch: "fix/13-outside" },
      { path: R("impower.worktrees/fix/14-grabbed"), head: "c14", branch: "fix/14-grabbed", size: 2 * GB, grabbed: true, remaining: 1.5 * GB },
      { path: R("impower.worktrees/fix/15-branch-fails"), head: "c15", branch: "fix/15-branch-fails", size: 1 * GB, branchFails: true },
      { path: R("impower.worktrees/fix/16-in-use"), head: "c16", branch: "fix/16-in-use", users: [{ pid: 777, name: "node.exe" }] },
      { path: R("impower.worktrees/fix/17-remote-ahead"), head: "c17", branch: "fix/17-remote-ahead", remote: true, remoteAhead: 2 },
      { path: R("impower.worktrees/fix/18-unborn"), head: "0000000000000000000000000000000000000000", branch: "fix/18-unborn" },
      { path: R("impower.worktrees/fix/19-broken"), head: "c19", branch: "fix/19-broken", prunable: "gitdir file points to non-existent location", size: 0.5 * GB },
      { path: R("impower.worktrees/fix/20-missing"), head: "c20", branch: "fix/20-missing", prunable: "gitdir file points to non-existent location", missing: true },
      { path: R("impower.worktrees/fix/21-no-reflog"), head: "c21", branch: "fix/21-no-reflog", size: 1 * GB, reflog: [] },
      { path: R("impower.worktrees/fix/22-commits-late"), head: "c22", branch: "fix/22-commits-late", size: 1 * GB, commitsLate: true },
      { path: R("impower.worktrees/perf/23-rmdir-busy"), head: "c23", branch: "perf/23-rmdir-busy", size: 1 * GB, rmdirBusy: true },
      { path: R("impower.worktrees/fix/24-size-throws"), head: "c24", branch: "fix/24-size-throws", size: 1 * GB, sizeThrows: 2 },
      { path: R("impower.worktrees/fix/25-dirty-late"), head: "c25", branch: "fix/25-dirty-late", size: 1 * GB, dirtyLate: true },
      { path: R("impower.worktrees/fix/26-old-driver-up"), head: "c26", branch: "fix/26-old-driver-up", driver: "UP  url=http://localhost:3  pid=1  mode=same-origin  state=s", oldDriver: true },
      { path: R("impower.worktrees/fix/27-git-fails"), head: "c27", branch: "fix/27-git-fails", statusFails: "fatal: index file corrupt" },
      { path: R("impower.worktrees/fix/28-fast-forwarded"), head: "m3", branch: "fix/28-fast-forwarded", reflog: ["m3\tmerge origin/main: Fast-forward", "m1\tbranch: Created from origin/main"] },
      { path: R("impower.worktrees/fix/29-stacked-fresh"), head: "c1", branch: "fix/29-stacked-fresh", reflog: ["c1\tbranch: Created from fix/1-merged-gone"] },
      { path: R("impower.worktrees/fix/30-ff-merged"), head: "m2", branch: "fix/30-ff-merged", size: 1 * GB, reflog: ["m2\tcommit: work", "m1\tbranch: Created from origin/main"] },
      { path: R("impower.worktrees/fix/31-blocked-first"), head: "c31", branch: "fix/31-blocked-first", size: 1 * GB, blockedFirst: true },
      { path: R("impower.worktrees/fix/32-probe-taken"), head: "c32", branch: "fix/32-probe-taken", size: 1 * GB },
      { path: R("impower.worktrees/fix/33-switched-late"), head: "c33", branch: "fix/33-switched-late", size: 1 * GB, switchedLate: true },
      { path: R("impower.worktrees/fix/34-no-reflog-fresh"), head: "m3", branch: "fix/34-no-reflog-fresh", reflog: [] },
      { path: R("impower.worktrees/fix/35-refuses-late"), head: "c35", branch: "fix/35-refuses-late", size: 1 * GB, refusesLate: true },
      { path: R("impower.worktrees/fix/36-remove-throws"), head: "c36", branch: "fix/36-remove-throws", size: 1 * GB, removeThrows: 1 },
      { path: R("impower.worktrees/fix/37-stacked-ff"), head: "c1", branch: "fix/37-stacked-ff", reflog: ["c1\tmerge fix/1-merged-gone: Fast-forward", "m1\tbranch: Created from origin/main"] },
      { path: R("impower.worktrees/fix/38-partial-reflog"), head: "c38", branch: "fix/38-partial-reflog", size: 1 * GB, reflog: ["c38\tmerge origin/main: Fast-forward"] },
      { path: R("impower.worktrees/main-copy"), head: "m3", branch: "main", size: 1 * GB },
      { path: R("impower.worktrees/ci/40-grabbed-alone"), head: "c40", branch: "ci/40-grabbed-alone", size: 2 * GB, grabbed: true, remaining: 1.5 * GB },
      { path: R("impower.worktrees/fix/41-probe-left"), head: "c41", branch: "fix/41-probe-left", prunable: "gitdir file points to non-existent location", missing: true },
      { path: R("impower.worktrees/fix/42-list-fails"), head: "c42", branch: "fix/42-list-fails", size: 1 * GB, listFails: 1 },
      { path: R("impower.worktrees/fix/43-rename-back-fails"), head: "c43", branch: "fix/43-rename-back-fails", size: 1 * GB, renameBackFails: true },
      { path: R("impower.worktrees/fix/44-link-out"), head: "c44", branch: "fix/44-link-out", size: 1 * GB, ignored: ["node_modules/"], links: [["node_modules/pkg", R("elsewhere/pkg")]] },
      { path: R("impower.worktrees/fix/45-link-in"), head: "c45", branch: "fix/45-link-in", size: 1 * GB, ignored: ["node_modules/"], links: [["node_modules/impower-dev", R("impower.worktrees/fix/45-link-in/impower-dev")]] },
      { path: R("impower.worktrees/fix/46-unreadable"), head: "c46", branch: "fix/46-unreadable", size: 1 * GB, unreadable: [["node_modules/locked", "EPERM"]] },
      { path: R("impower.worktrees/fix/47-two-servers"), head: "c47", branch: "fix/47-two-servers", driver: "UP  url=http://localhost:5  pid=1  mode=same-origin  state=s", vscodeDriver: "UP  url=http://localhost:6  pid=1  project=p  log=l" },
      { path: R("impower.worktrees/fix/48-crashed-driver"), head: "c48", branch: "fix/48-crashed-driver", size: 1 * GB, driver: "down (no state file)", vscodeDriver: "file:///x/driver.mjs:33\nError [ERR_MODULE_NOT_FOUND]: Cannot find module" },
      { path: R("impower.worktrees/fix/49-recorded-server"), head: "c49", branch: "fix/49-recorded-server", driver: "down (no state file)", vscodeDriver: "file:///x/driver.mjs:33\nError [ERR_MODULE_NOT_FOUND]: Cannot find module", vscodeState: { url: "http://localhost:9", pid: LIVE_PID } },
      { path: R("impower.worktrees/fix/50-unknown-state"), head: "c50", branch: "fix/50-unknown-state", driver: "down (no state file)", vscodeDriver: "file:///x/driver.mjs:33\nError [ERR_MODULE_NOT_FOUND]: Cannot find module", vscodeState: "{not json" },
      { path: R("impower.worktrees/fix/51-web-old-state"), head: "c51", branch: "fix/51-web-old-state", driver: "file:///x/driver.mjs:33\nError [ERR_MODULE_NOT_FOUND]: Cannot find module", webState: { url: "http://localhost:11", pid: LIVE_PID } },
      { path: R("impower.worktrees/trunk-copy"), head: "m3", branch: "trunk", size: 1 * GB },
    ],
    strays: [R("impower.worktrees/fix/husk-old"), R("impower.worktrees/leftover"), R("impower.worktrees/fix/32-probe-taken.removing"), R("impower.worktrees/fix/41-probe-left.removing")],
    processes: [
      { pid: SELF_PID, name: "node.exe", cmd: `node ${R("impower.worktrees/fix/1-merged-gone")}/.agents/skills/clean-worktrees/clean-worktrees.mjs` },
      { pid: 777, name: "node.exe", cmd: `"node" "${path.join(R("impower.worktrees/fix/16-in-use"), "node_modules", "vite", "bin", "vite.js")}"` },
      { pid: 778, name: "node.exe", cmd: `node ${path.join(R("impower.worktrees/fix/16-in-use-2"), "a.js")}` },
    ],
    branches: new Set(["main"]),
    // Commits not on origin/main for a branch no tree holds, by branch.
    loose: {},
    gone: [],
    removed: [],
    branchesDeleted: [],
    emptyDirsRemoved: [],
    outsideRemoved: [],
    renames: [],
    fetched: 0,
  };
  for (const t of w.trees) if (t.branch) w.branches.add(t.branch);
  const branchFails = new Set(w.trees.filter((t) => t.branchFails).map((t) => t.branch));
  // What is on disk: every worktree directory that is not missing, and the
  // strays. A gutted tree stays here as a husk after its record is gone.
  w.disk = new Map();
  for (const t of w.trees) if (!t.missing) w.disk.set(t.path.toLowerCase(), { size: t.size ?? 0, tree: t });
  for (const s of w.strays) w.disk.set(s.toLowerCase(), { size: 0.2 * GB, tree: null });
  const onDisk = (p) => w.disk.get(path.resolve(p).toLowerCase());
  const tree = (p) => w.trees.find((t) => same(t.path, p));
  // A branch's tree, registered or not: its commit count outlives its record.
  const byBranch = (b) => w.trees.find((t) => t.branch === b) ?? w.gone.find((t) => t.branch === b);
  const unregister = (t) => {
    if (w.trees.includes(t)) w.gone.push(...w.trees.splice(w.trees.indexOf(t), 1));
  };
  const ok = (out = "") => ({ status: 0, out, err: "" });
  const fail = (err, status = 1) => ({ status, out: "", err });
  const porcelain = () => {
    if (w.emptyList) return "";
    const stanza = (t) => [`worktree ${t.path.replaceAll("\\", "/")}`, `HEAD ${t.head}`, t.bare ? "bare" : null, t.detached ? "detached" : `branch refs/heads/${t.branch}`, t.locked ? `locked ${t.locked}` : null, t.prunable ? `prunable ${t.prunable}` : null, ""].filter((l) => l != null).join("\n");
    return [stanza({ path: MAIN, head: "m3", branch: "main", bare: w.bare }), ...w.trees.map(stanza)].join("\n");
  };
  // The classification asks with --ignored=matching and the re-check before
  // removal asks without, so a tree that turns dirty in between is one whose
  // plain status has a change the classification did not see.
  const gitStatus = (cwd, withIgnored) => {
    const t = tree(cwd);
    if (!t || t.prunable || t.missing) return fail("fatal: not a git repository (or any of the parent directories): .git", 128);
    if (t.statusFails) return fail(t.statusFails, 128);
    const dirty = [...(t.dirty ?? []), ...(t.dirtyLate && !withIgnored ? [" M late.txt"] : [])];
    return ok([...dirty, ...(withIgnored ? (t.ignored ?? []).map((p) => `!! ${p}`) : [])].join("\n"));
  };
  const OLD_DRIVER = path.join(".agents", "skills", "resolve-issue", "driver.mjs");
  const VSCODE_DRIVER = path.join(".agents", "skills", "drive-vscode-web", "driver.mjs");
  const VSCODE_STATE = path.join(".agents", "skills", "drive-vscode-web", ".state.json");
  // The web editor driver's state file at its older location, where a
  // server launched from there is still recorded.
  const WEB_OLD_STATE = path.join(".agents", "skills", "resolve-issue", ".state.json");
  // A tree's state file at `p`: an object is written as JSON, a string as
  // it is (an unreadable file); undefined when no tree has one there.
  const stateAt = (p) => {
    for (const t of w.trees) {
      if (t.vscodeState != null && same(path.join(t.path, VSCODE_STATE), p)) return t.vscodeState;
      if (t.webState != null && same(path.join(t.path, WEB_OLD_STATE), p)) return t.webState;
    }
    return undefined;
  };
  w.deps = {
    cwd: () => w.cwd,
    pid: () => SELF_PID,
    now: () => NOW,
    processes: () => (w.processesFail ? { ok: false, err: "powershell.exe not found" } : { ok: true, list: w.processes }),
    exec(cmd, args, cwd) {
      const a = args.join(" ");
      if (cmd !== "git") {
        const t = tree(cwd);
        assert.ok(t && args[1] === "status", `unexpected command ${cmd} ${a} in ${cwd}`);
        const out = same(args[0], path.join(t.path, VSCODE_DRIVER)) ? t.vscodeDriver : t.driver;
        assert.ok(out != null, `a driver the tree does not have was run: ${args[0]}`);
        return { status: out.startsWith("UP") ? 0 : 1, out, err: "" };
      }
      let m;
      if (a === "rev-parse --show-toplevel") return ok(same(cwd, MAIN) ? MAIN : tree(cwd)?.path ?? cwd);
      if (a === "worktree list --porcelain") {
        if (w.listFailsOnce) {
          w.listFailsOnce = false;
          return { status: null, out: "", err: "spawn git EAGAIN" };
        }
        return ok(porcelain());
      }
      if (a === "symbolic-ref -q refs/remotes/origin/HEAD") return w.noOriginHead ? fail("") : ok("refs/remotes/origin/trunk");
      if (a === "fetch --prune origin") return w.fetched++, ok();
      if (a === "rev-list --first-parent refs/remotes/origin/main") return ok("m3\nm2\nm1");
      if (a === "status --porcelain --ignored=matching") return gitStatus(cwd, true);
      if (a === "status --porcelain") return gitStatus(cwd, false);
      if (a === "symbolic-ref -q HEAD") {
        const t = tree(cwd);
        if (!t || t.detached) return fail("");
        return ok(`refs/heads/${t.switchedLate ? "feat/other" : t.branch}`);
      }
      if ((m = /^rev-parse --verify -q refs\/remotes\/origin\/(.+)$/.exec(a))) return byBranch(m[1])?.remote ? ok("abcd") : fail("");
      if ((m = /^rev-parse --verify -q refs\/heads\/(.+)$/.exec(a))) return w.branches.has(m[1]) ? ok("abcd") : fail("");
      if ((m = /^rev-list --count refs\/remotes\/origin\/(.+?) \^refs\/remotes\/origin\/main$/.exec(a))) return ok(String(byBranch(m[1])?.remoteAhead ?? 0));
      if ((m = /^rev-list --count refs\/heads\/(.+?) \^refs\/remotes\/origin\/main( \^refs\/remotes\/origin\/(.+))?$/.exec(a))) {
        const t = byBranch(m[1]);
        if (!t && w.loose[m[1]] != null) return ok(String(w.loose[m[1]]));
        if (!t) return fail(`fatal: ambiguous argument 'refs/heads/${m[1]}': unknown revision`, 128);
        if (m[2]) return ok(String(t.unpushed ?? 0));
        // A tree that gains a commit during the first --apply, after it was
        // classified: that run's first count is the classification's, every
        // later count in it and every run after it sees the commit. Runs are
        // told apart by the fetch each one starts with.
        if (t.run !== w.fetched) Object.assign(t, { run: w.fetched, counted: 0 });
        t.counted++;
        const late = t.commitsLate && (w.fetched > 2 || (w.fetched === 2 && t.counted > 1));
        return ok(String(late ? 1 : (t.own ?? 0)));
      }
      if ((m = /^reflog show --format=%H%x09%gs refs\/heads\/(.+)$/.exec(a))) {
        const t = byBranch(m[1]);
        return ok((t.reflog ?? [`${t.head}\tcommit: work`, "base\tbranch: Created from origin/main"]).join("\n"));
      }
      if ((m = /^worktree remove (.+)$/.exec(a))) {
        const t = tree(m[1]);
        if (!t) return fail(`fatal: '${m[1]}' is not a working tree`, 128);
        if (t.removeThrows) {
          t.removeThrows--;
          throw new Error("git could not be started");
        }
        if (t.refusesLate) return fail(`fatal: '${t.path}' contains modified or untracked files, use --force to delete it`, 128);
        if (t.listFails) {
          t.listFails--;
          w.listFailsOnce = true;
          return fail(`fatal: '${t.path}' contains modified or untracked files, use --force to delete it`, 128);
        }
        if (!under(t.path, ROOT)) w.outsideRemoved.push(t.path);
        unregister(t);
        if (t.missing || t.prunable) return ok();
        if (t.held || t.grabbed) {
          onDisk(t.path).size = t.remaining;
          onDisk(t.path).gutted = true;
          return fail(`error: failed to delete '${t.path}': Permission denied`, 255);
        }
        if (t.blockedFirst) return fail(`error: failed to delete '${t.path}': Filename too long`, 255);
        w.disk.delete(t.path.toLowerCase());
        w.removed.push(t.branch);
        return ok();
      }
      if ((m = /^branch -D (.+)$/.exec(a))) {
        if (branchFails.has(m[1])) return fail(`error: could not delete '${m[1]}'`);
        w.branches.delete(m[1]);
        w.branchesDeleted.push(m[1]);
        return ok();
      }
      throw new Error(`unexpected command git ${a} in ${cwd}`);
    },
    exists: (p) => {
      if (same(p, MAIN)) return true;
      if (onDisk(p)) return true;
      return w.trees.some((t) => (t.driver && same(path.join(t.path, t.oldDriver ? OLD_DRIVER : DRIVER), p)) || (t.vscodeDriver && same(path.join(t.path, VSCODE_DRIVER), p))) || stateAt(p) !== undefined;
    },
    readFile: (p) => {
      const s = stateAt(p);
      if (s === undefined) throw new Error(`ENOENT: no such file, open '${p}'`);
      return typeof s === "string" ? s : JSON.stringify(s);
    },
    listDirs: (p) => [...new Set([...w.disk.keys()].filter((d) => under(d, p)).map((d) => path.relative(path.resolve(p).toLowerCase(), d).split(path.sep)[0]))],
    isEmptyDir: (p) => ![...w.disk.keys()].some((d) => under(d, p)),
    // Windows refuses a rename while a process has a file open inside the
    // directory, and a rename onto a name that exists, with the same code;
    // a `renameBackFails` tree is refused on the way back only.
    rename: (from, to) => {
      const t = tree(from);
      if (t?.held || onDisk(to) || (from.endsWith(".removing") && tree(to)?.renameBackFails)) {
        const err = new Error("EPERM: operation not permitted, rename");
        err.code = "EPERM";
        throw err;
      }
      const d = onDisk(from);
      w.disk.delete(path.resolve(from).toLowerCase());
      w.disk.set(path.resolve(to).toLowerCase(), d);
      w.renames.push([from, to]);
    },
    removeDir: (p) => {
      const d = onDisk(p);
      if (!under(p, ROOT)) w.outsideRemoved.push(p);
      if (d?.gutted) {
        const err = new Error("EPERM: operation not permitted, rmdir");
        err.code = "EPERM";
        throw err;
      }
      if (d?.tree) {
        unregister(d.tree);
        w.removed.push(d.tree.branch);
      }
      w.disk.delete(path.resolve(p).toLowerCase());
    },
    removeEmptyDir: (p) => {
      if (w.trees.some((t) => t.rmdirBusy && same(path.dirname(t.path), p)) || w.busyDirs?.has(path.resolve(p).toLowerCase())) {
        const err = new Error("EBUSY: resource busy or locked, rmdir");
        err.code = "EBUSY";
        throw err;
      }
      w.emptyDirsRemoved.push(path.relative(ROOT, p));
    },
    // A directory's size is its own plus everything under it, as the real
    // walk would find, so a type directory listed as a stray is sized; the
    // links and unreadable directories are the tree's own.
    scan: async (p) => {
      const t = onDisk(p)?.tree;
      if (t?.sizeThrows) {
        t.sizeThrows--;
        throw new Error("the sizing walk failed");
      }
      const abs = path.resolve(p);
      return {
        bytes: [...w.disk.entries()].filter(([d]) => same(d, p) || under(d, p)).reduce((s, [, d]) => s + d.size, 0),
        links: (t?.links ?? []).map(([l, target]) => ({ link: path.join(abs, l), target })),
        unreadable: (t?.unreadable ?? []).map(([u, code]) => `${path.join(abs, u)}: ${code}`),
      };
    },
    freeSpace: () => 26 * GB,
    pidAlive: (pid) => pid === LIVE_PID,
    readLog: () => w.log.join("\n"),
    appendLog: (p, line) => {
      assert.equal(p, path.join(MAIN, ".git", LOG_NAME));
      w.log.push(line);
    },
    log: (...a) => w.lines.push(a.join(" ")),
  };
  // The busy type directory outlives its tree's record, so remember it.
  w.busyDirs = new Set(w.trees.filter((t) => t.rmdirBusy).map((t) => path.dirname(t.path).toLowerCase()));
  return w;
}

const run = async (mainFn, w, cwd, ...argv) => {
  w.cwd = cwd;
  w.lines = [];
  try {
    return { status: await mainFn(argv, w.deps), out: w.lines.join("\n") };
  } catch (err) {
    return { status: 1, out: `${w.lines.join("\n")}\nERROR: ${err.message}` };
  }
};
// The row for a branch, found by the branch column; a detached worktree's
// column reads (detached), a stray directory's (not a worktree), and a stray
// is found by its path instead.
const rowFor = (out, key) => {
  const row = out.split(/\r?\n/).find((l) => l.includes(key));
  assert.ok(row, `no row for ${key.trim()} in:\n${out}`);
  return { word: row.split(/\s+/)[0], row };
};
const rowProblem = (out, key, word, ...phrases) => {
  try {
    const d = rowFor(out, key.includes(path.sep) ? `${key}  ` : `  ${key}  `);
    if (d.word !== word) return `${key}: expected ${word}, got ${d.word}: ${d.row}`;
    for (const p of phrases) if (!d.row.includes(p)) return `row for ${key} does not say '${p}':\n${d.row}`;
    return null;
  } catch (err) {
    return err.message;
  }
};
const expectRows = (out, rows) => {
  const problems = rows.map((r) => rowProblem(out, ...r)).filter(Boolean);
  assert.equal(problems.length, 0, problems.join("\n"));
};
const rel = (p) => path.relative(path.dirname(MAIN), p);

// The checks over the stub world, against the script's own `main` or a
// control copy's; `report` receives each check's name and its error or null.
async function worldChecks(mainFn, report) {
  const w = makeWorld();
  const step = async (name, fn) => {
    try {
      await fn();
      report(name, null);
    } catch (err) {
      report(name, err);
    }
  };
  const all = [...w.trees];
  const keptRows = ["fix/3-dirty", "fix/4-unpushed", "fix/5-open", "fix/6-fresh", "fix/7-servers-up", "fix/8-servers-launching", "fix/12-locked", "fix/13-outside", "(detached)", "fix/16-in-use", "fix/17-remote-ahead", "fix/18-unborn", "fix/19-broken", "fix/20-missing", "fix/21-no-reflog", "fix/26-old-driver-up", "fix/27-git-fails", "fix/28-fast-forwarded", "fix/29-stacked-fresh", "fix/34-no-reflog-fresh", "fix/37-stacked-ff", "fix/38-partial-reflog", "fix/41-probe-left", "fix/47-two-servers", "fix/49-recorded-server", "fix/50-unknown-state", "fix/51-web-old-state", "main", rel(R("impower.worktrees/main-copy")), rel(R("impower.worktrees/trunk-copy"))];
  const linkOutRow = `1 link inside it points outside it (${path.join("node_modules", "pkg")} -> ${R("elsewhere/pkg")}); ${LINK_ADVICE}`;
  const unreadableRow = `1 directory or link inside it could not be read (${path.join("node_modules", "locked")}: EPERM), so whether a link inside it points outside it cannot be told; left for a person`;
  const untouched = () => {
    assert.equal(w.fetched, 0, "it fetched before refusing");
    assert.deepEqual(w.removed, [], "it removed worktrees");
    assert.deepEqual(w.branchesDeleted, [], "it deleted branches");
    assert.deepEqual(w.log, [], "it wrote the log before refusing");
  };

  await step("an unknown option is refused", async () => {
    const r = await run(mainFn, w, MAIN, "--all");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /unknown option --all/);
    untouched();
  });

  await step("--apply without --root is refused before anything is fetched", async () => {
    const r = await run(mainFn, w, MAIN, "--apply");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: --apply needs --root <path>, the main checkout it is to act on/);
    untouched();
  });

  await step("--apply with a --root that is not the main checkout is refused before anything is fetched", async () => {
    const r = await run(mainFn, w, MAIN, "--apply", "--root", R("elsewhere"));
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, new RegExp(`ERROR: --root .*elsewhere is not the main checkout the current directory belongs to, .*impower; nothing was touched`));
    untouched();
  });

  await step("--apply with a relative --root is refused before anything is fetched", async () => {
    for (const rel of [".", "impower", "../impower"]) {
      const r = await run(mainFn, w, MAIN, "--apply", "--root", rel);
      assert.equal(r.status, 1, r.out);
      assert.match(r.out, /ERROR: --root .* is not an absolute path; --root names the main checkout in full/, `--root ${rel}`);
    }
    untouched();
  });

  await step("a bare first worktree, and an empty worktree list, are refused before anything is fetched", async () => {
    w.bare = true;
    let r = await run(mainFn, w, MAIN, "--apply", "--root", MAIN);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /the first worktree is bare; run from the main checkout/);
    w.bare = false;
    w.emptyList = true;
    r = await run(mainFn, w, MAIN, "--apply", "--root", MAIN);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /git worktree list printed nothing; run from the main checkout/);
    w.emptyList = false;
    untouched();
  });

  await step("run from a worktree it refuses, naming the main checkout, and removes nothing", async () => {
    const r = await run(mainFn, w, all[0].path, "--apply", "--root", MAIN);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /run from the main checkout/);
    untouched();
  });

  await step("--apply without a recorded origin/HEAD is refused before anything is fetched", async () => {
    w.noOriginHead = true;
    const r = await run(mainFn, w, MAIN, "--apply", "--root", MAIN);
    w.noOriginHead = false;
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: origin\/HEAD is not recorded in .*impower, so which branch is the default cannot be told beyond main; `git remote set-head origin --auto` records it; nothing was touched/);
    untouched();
  });

  await step("the dry run classifies every worktree and removes nothing", async () => {
    const r = await run(mainFn, w, MAIN);
    assert.deepEqual(w.removed, [], "the dry run removed worktrees");
    assert.deepEqual(w.branchesDeleted, [], "the dry run deleted branches");
    assert.deepEqual(w.renames, [], "the dry run renamed a directory");
    assert.deepEqual(w.log, [], "the dry run wrote the log");
    assert.equal(w.trees.length, all.length, "the dry run removed a directory");
    assert.equal(r.status, 0, r.out);
    assert.equal(w.fetched, 1, "it did not fetch with --prune first");
    expectRows(r.out, [
      ["main", "keep", "the main checkout"],
      ["fix/1-merged-gone", "remove", "1.1 GB", "merged into origin/main; no origin/fix/1-merged-gone; takes 2 ignored paths with it (node_modules/, .env.local)"],
      ["fix/2-merged-kept-remote", "remove", "origin/fix/2-merged-kept-remote still exists"],
      ["fix/9-held", "remove", "merged into origin/main"],
      ["docs/10-merged-gone", "remove", "merged into origin/main"],
      ["fix/14-grabbed", "remove", "2.0 GB", "merged into origin/main"],
      ["fix/15-branch-fails", "remove", "merged into origin/main"],
      ["fix/21-no-reflog", "keep", "its reflog records neither a commit nor its creation, so whether a commit was made on it cannot be told, and its tip is off origin/main's first-parent line (no origin/fix/21-no-reflog); left for a person, and `git worktree remove` plus `git branch -D` by hand once its commits are checked"],
      ["fix/22-commits-late", "remove", "merged into origin/main"],
      ["perf/23-rmdir-busy", "remove", "merged into origin/main"],
      ["fix/24-size-throws", "remove", "could not be sized (the sizing walk failed); merged into origin/main"],
      ["fix/25-dirty-late", "remove", "merged into origin/main"],
      ["fix/26-old-driver-up", "keep", "dev servers up at http://localhost:3 (pid 1)"],
      ["fix/27-git-fails", "keep", `git could not judge it (git status --porcelain --ignored=matching failed in ${R("impower.worktrees/fix/27-git-fails")}: fatal: index file corrupt); left for a person`],
      ["fix/28-fast-forwarded", "keep", "no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none (no origin/fix/28-fast-forwarded); a fresh worktree a session may be working in"],
      ["fix/29-stacked-fresh", "keep", "no commit was made on the branch: its reflog holds its creation and no commit since (no origin/fix/29-stacked-fresh); a fresh worktree a session may be working in"],
      ["fix/30-ff-merged", "remove", "merged into origin/main; no origin/fix/30-ff-merged"],
      ["fix/31-blocked-first", "remove", "merged into origin/main"],
      ["fix/32-probe-taken", "remove", "merged into origin/main"],
      ["fix/33-switched-late", "remove", "merged into origin/main"],
      ["fix/34-no-reflog-fresh", "keep", "no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none"],
      ["fix/35-refuses-late", "remove", "merged into origin/main"],
      ["fix/36-remove-throws", "remove", "merged into origin/main"],
      ["fix/37-stacked-ff", "keep", "no commit was made on the branch: its reflog holds its creation and no commit since (no origin/fix/37-stacked-ff); a fresh worktree a session may be working in"],
      ["fix/38-partial-reflog", "keep", "its reflog records neither a commit nor its creation, so whether a commit was made on it cannot be told, and its tip is off origin/main's first-parent line (no origin/fix/38-partial-reflog); left for a person"],
      [rel(R("impower.worktrees/main-copy")), "keep", "  main  ", "the default branch main, which is never removed wherever it is checked out"],
      ["ci/40-grabbed-alone", "remove", "2.0 GB", "merged into origin/main"],
      ["fix/41-probe-left", "keep", `its directory is gone and ${R("impower.worktrees/fix/41-probe-left")}.removing is beside it, which is what an interrupted run's probe leaves; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record the renamed tree points at`],
      ["fix/42-list-fails", "remove", "merged into origin/main"],
      ["fix/43-rename-back-fails", "remove", "merged into origin/main"],
      ["fix/44-link-out", "keep", "1.0 GB", linkOutRow],
      ["fix/45-link-in", "remove", "1.0 GB", "merged into origin/main; no origin/fix/45-link-in; takes 1 ignored path with it (node_modules/)"],
      ["fix/46-unreadable", "keep", "1.0 GB", unreadableRow],
      ["fix/47-two-servers", "keep", "dev servers up at http://localhost:5 (pid 1) through drive-web-editor", "dev servers up at http://localhost:6 (pid 1) through drive-vscode-web"],
      ["fix/48-crashed-driver", "remove", "merged into origin/main"],
      ["fix/49-recorded-server", "keep", `its driver through drive-vscode-web could not report its servers (Error [ERR_MODULE_NOT_FOUND]: Cannot find module), and its state file records pid ${LIVE_PID} alive at http://localhost:9; the worktree's driver \`down\` settles it once the driver runs, or stop the pid by hand`],
      ["fix/50-unknown-state", "keep", "its driver through drive-vscode-web could not report its servers (Error [ERR_MODULE_NOT_FOUND]: Cannot find module; its state file could not be read ("],
      ["fix/51-web-old-state", "keep", `its driver through drive-web-editor could not report its servers (Error [ERR_MODULE_NOT_FOUND]: Cannot find module), and its state file records pid ${LIVE_PID} alive at http://localhost:11; the worktree's driver \`down\` settles it once the driver runs, or stop the pid by hand`],
      [rel(R("impower.worktrees/trunk-copy")), "keep", "  trunk  ", "the default branch trunk, which is never removed wherever it is checked out"],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
      ["fix/4-unpushed", "keep", "1 commit not on origin/main, and no origin/fix/4-unpushed holds them"],
      ["fix/5-open", "keep", "1 commit not on origin/main (all on origin/fix/5-open; a pull request may be open)"],
      ["fix/6-fresh", "keep", "no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none (no origin/fix/6-fresh); a fresh worktree a session may be working in"],
      ["fix/7-servers-up", "keep", "dev servers up at http://localhost:1 (pid 1)"],
      ["fix/8-servers-launching", "keep", `dev servers launching (pid ${LIVE_PID} alive`],
      ["(detached)", "keep", "detached head"],
      ["fix/12-locked", "keep", "locked (in use)"],
      ["fix/13-outside", "keep", `outside ${ROOT}`],
      ["fix/16-in-use", "keep", "its path is on the command line of pid 777 (node.exe)"],
      ["fix/17-remote-ahead", "keep", "origin/fix/17-remote-ahead has 2 commits not on origin/main and this branch is behind it; a pull request may be open"],
      ["fix/18-unborn", "keep", "unborn branch with no commits; left for a person"],
      ["fix/19-broken", "keep", "512.0 MB", "git no longer sees it as a worktree (gitdir file points to non-existent location) but the directory is still there; delete it by hand"],
      ["fix/20-missing", "keep", "its directory is gone; `git worktree prune` drops the record"],
      [rel(R("impower.worktrees/fix/husk-old")), "keep", "(not a worktree)", "204.8 MB", "not a registered worktree, which is what an interrupted removal or add leaves behind; delete it by hand after checking it"],
      [rel(R("impower.worktrees/leftover")), "keep", "(not a worktree)"],
      [rel(R("impower.worktrees/fix/32-probe-taken.removing")), "keep", "(not a worktree)", `not a registered worktree, named like the probe of ${rel(R("impower.worktrees/fix/32-probe-taken"))}, which is registered and present; check it before deleting it by hand`],
      [rel(R("impower.worktrees/fix/41-probe-left.removing")), "keep", "(not a worktree)", `the worktree ${rel(R("impower.worktrees/fix/41-probe-left"))}, renamed by an interrupted run's probe and not renamed back; rename it back by hand, and do not run \`git worktree prune\`, which would drop the record it points at`],
    ]);
    assert.ok(!r.out.includes("fix/16-in-use-2"), "a process of a directory whose name extends another's was claimed");
    assert.ok(!rowFor(r.out, "  fix/44-link-out  ").row.includes("merged into origin/main"), "the row for a tree kept for its link still reads as merged");
    assert.match(r.out, /52 worktrees besides the main checkout: 21 to remove \(23\.0 GB\), 31 kept; 4 directories under the worktrees root are not worktrees \(819\.2 MB\)\./);
    assert.match(r.out, new RegExp(`Dry run; nothing was removed\\. Run again with --apply --root .*impower to remove the 21\\.`));
  });

  await step("--apply removes the merged clean ones, keeps a held or changed tree untouched, and reports a gutted tree and a failed branch deletion with what is left", async () => {
    const r = await run(mainFn, w, MAIN, "--apply", "--root", MAIN);
    assert.deepEqual(w.outsideRemoved, [], "the script removed a path outside the root");
    expectRows(r.out, [
      ["fix/1-merged-gone", "removed"],
      ["fix/2-merged-kept-remote", "removed"],
      ["docs/10-merged-gone", "removed", `removed the empty docs${path.sep}`],
      ["perf/23-rmdir-busy", "removed", `the empty perf${path.sep} could not be removed (EBUSY)`],
      ["fix/30-ff-merged", "removed"],
      ["fix/31-blocked-first", "removed", `git worktree remove stopped part-way (error: failed to delete '${R("impower.worktrees/fix/31-blocked-first")}': Filename too long) and dropped its record; the rest of the directory was removed directly`],
      ["fix/9-held", "kept", "the directory could not be renamed (EPERM), which on Windows happens while a process has a file open or its current directory inside it; no process names the path, so find what has a file open in it (an editor, an indexer, a shell) and run again"],
      ["fix/22-commits-late", "kept", "changed since it was classified: 1 commit not on origin/main; the tree is untouched"],
      ["fix/24-size-throws", "kept", "could not be sized (the sizing walk failed); the tree is untouched"],
      ["fix/25-dirty-late", "kept", "changed since it was classified: uncommitted changes (1 file); the tree is untouched"],
      ["fix/32-probe-taken", "kept", `${R("impower.worktrees/fix/32-probe-taken.removing")} already exists, which is what an interrupted run leaves beside a worktree; check it and rename it back or delete it by hand, then run again`],
      ["fix/33-switched-late", "kept", "changed since it was classified: now on feat/other; the tree is untouched"],
      ["fix/35-refuses-late", "kept", `git worktree remove refused (fatal: '${R("impower.worktrees/fix/35-refuses-late")}' contains modified or untracked files, use --force to delete it) and kept its record; nothing more was touched`],
      ["fix/14-grabbed", "failed", `git worktree remove stopped part-way (error: failed to delete '${R("impower.worktrees/fix/14-grabbed")}': Permission denied) and dropped its record, so ${R("impower.worktrees/fix/14-grabbed")} is no longer a worktree; 1.5 GB remain there; delete the directory by hand once nothing holds it, then \`git branch -D fix/14-grabbed\`; the branch stays until then`],
      ["fix/15-branch-fails", "failed", "the directory is gone; git branch -D fix/15-branch-fails failed (error: could not delete 'fix/15-branch-fails'), so delete the branch by hand"],
      ["fix/36-remove-throws", "failed", "git could not be started; the directory is still there"],
      ["ci/40-grabbed-alone", "failed", "1.5 GB remain there"],
      ["fix/42-list-fails", "failed", `git worktree remove failed (fatal: '${R("impower.worktrees/fix/42-list-fails")}' contains modified or untracked files, use --force to delete it) and whether git still holds its record could not be read (git worktree list failed: spawn git EAGAIN); nothing more was touched; check the directory and \`git worktree list\` by hand; the branch stays until then`],
      ["fix/43-rename-back-fails", "failed", `the directory was renamed to ${R("impower.worktrees/fix/43-rename-back-fails")}.removing to test whether a process holds it and could not be renamed back (EPERM); rename it back by hand`],
      ["fix/44-link-out", "kept", linkOutRow],
      ["fix/45-link-in", "removed"],
      ["fix/46-unreadable", "kept", unreadableRow],
      ["fix/48-crashed-driver", "removed"],
      ...keptRows.map((b) => [b, "kept"]),
      [rel(R("impower.worktrees/fix/husk-old")), "kept", "(not a worktree)"],
    ]);
    assert.equal(r.status, 1, `exit code ${r.status} though a removal failed:\n${r.out}`);
    assert.match(r.out, /Removed 8 worktrees and their branches, freeing 10\.0 GB; 38 worktrees kept; 6 failed \(see the rows above for what is left\); 4 directories under the worktrees root are not worktrees \(819\.2 MB\)\. Free space now 26\.0 GB\./);
    assert.deepEqual(w.removed.sort(), ["docs/10-merged-gone", "fix/1-merged-gone", "fix/15-branch-fails", "fix/2-merged-kept-remote", "fix/30-ff-merged", "fix/31-blocked-first", "fix/45-link-in", "fix/48-crashed-driver", "perf/23-rmdir-busy"]);
    assert.deepEqual(w.branchesDeleted.sort(), ["docs/10-merged-gone", "fix/1-merged-gone", "fix/2-merged-kept-remote", "fix/30-ff-merged", "fix/31-blocked-first", "fix/45-link-in", "fix/48-crashed-driver", "perf/23-rmdir-busy"]);
    for (const b of ["ci/40-grabbed-alone", "fix/14-grabbed", "fix/15-branch-fails", "fix/21-no-reflog", "fix/22-commits-late", "fix/25-dirty-late", "fix/32-probe-taken", "fix/33-switched-late", "fix/35-refuses-late", "fix/36-remove-throws", "fix/37-stacked-ff", "fix/38-partial-reflog", "fix/42-list-fails", "fix/43-rename-back-fails", "fix/44-link-out", "fix/46-unreadable", "fix/9-held", "main", "trunk"]) assert.ok(w.branches.has(b), `the branch ${b} was deleted`);
    for (const b of ["fix/21-no-reflog", "fix/25-dirty-late", "fix/32-probe-taken", "fix/33-switched-late", "fix/35-refuses-late", "fix/36-remove-throws", "fix/37-stacked-ff", "fix/38-partial-reflog", "fix/42-list-fails", "fix/44-link-out", "fix/46-unreadable", "fix/9-held", "main-copy", "trunk-copy"]) assert.ok(w.trees.some((t) => same(t.path, R("impower.worktrees", b))) && w.disk.has(R("impower.worktrees", b).toLowerCase()), `the tree ${b} was removed or lost its record`);
    assert.ok(w.disk.get(R("impower.worktrees/fix/14-grabbed").toLowerCase())?.gutted, "the gutted tree's husk is gone");
    assert.ok(w.disk.has(`${R("impower.worktrees/fix/43-rename-back-fails")}.removing`.toLowerCase()), "the probe that could not be renamed back is gone");
    assert.deepEqual(w.emptyDirsRemoved, ["docs"]);
    const probed = ["fix/1-merged-gone", "fix/2-merged-kept-remote", "docs/10-merged-gone", "fix/14-grabbed", "fix/15-branch-fails", "perf/23-rmdir-busy", "fix/30-ff-merged", "fix/31-blocked-first", "fix/35-refuses-late", "fix/36-remove-throws", "ci/40-grabbed-alone", "fix/42-list-fails", "fix/43-rename-back-fails", "fix/45-link-in", "fix/48-crashed-driver"].map((b) => R("impower.worktrees", b));
    assert.deepEqual(w.renames.filter(([f]) => !f.endsWith(".removing")).map(([f]) => f), probed, "every removal probed the directory by rename");
    assert.deepEqual(w.renames.filter(([f]) => f.endsWith(".removing")).map(([, t]) => t), probed.filter((p) => !p.endsWith("43-rename-back-fails")), "every probe but the refused one renamed the directory back");
    const logged = readLogRows(w.log.join("\n"));
    assert.equal(logged[0].run, `--apply --root ${MAIN}`, "the log does not start with the run");
    const grabbed = logged.find((row) => row.branch === "fix/14-grabbed" && row.decision !== "removing");
    assert.ok(grabbed && grabbed.decision === "failed" && grabbed.at === NOW && grabbed.why.includes("stopped part-way"), `the failed row is not in the log:\n${w.log.join("\n")}`);
    // Every removal that started has a `removing` row before its outcome row,
    // so a run killed mid-removal has still named the branch; the row is
    // written before the re-checks too, so every removable tree but the one
    // that could not be sized has one.
    for (const p of probed) {
      const i = logged.findIndex((row) => row.decision === "removing" && same(row.path, p));
      assert.ok(i >= 0, `no removing row for ${path.relative(ROOT, p)} in the log:\n${w.log.join("\n")}`);
      const outcome = logged.findIndex((row, j) => j > i && row.decision && row.decision !== "removing" && same(row.path, p));
      assert.ok(outcome > i, `no outcome row after the removing row for ${path.relative(ROOT, p)}`);
    }
    assert.equal(logged.filter((row) => row.decision === "removing").length, 20, "the removing rows are not one per removable tree that was sized and holds no link leading out");
    assert.ok(!logged.some((row) => row.decision === "removing" && same(row.path, R("impower.worktrees/fix/44-link-out"))), "a tree kept for its link was recorded as removing");
    assert.equal(logged.filter((row) => row.decision && row.decision !== "removing").length, rows(r.out) - 4, "the log does not hold every worktree row, or holds a stray one");
    assert.ok(!logged.some((row) => row.path && same(row.path, R("impower.worktrees/fix/husk-old"))), "a stray directory was recorded as a decision");
    assert.match(logged.at(-1).summary, /^Removed 8 worktrees/);
  });

  await step("a second --apply lists the gutted tree's husk and the type directory holding another with the branches they stranded, lists the branch a failed deletion left with no directory, keeps the held tree again, and removes what it can now", async () => {
    const r = await run(mainFn, w, MAIN, "--apply", "--root", MAIN);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      [rel(R("impower.worktrees/fix/14-grabbed")), "kept", "(not a worktree)", "1.5 GB", `not a registered worktree; the --apply run at ${NOW} failed to remove it (git worktree remove stopped part-way (error: failed to delete '${R("impower.worktrees/fix/14-grabbed")}': Permission denied) and dropped its record`, "; its branch fix/14-grabbed is still local"],
      [rel(R("impower.worktrees/ci")), "kept", "(not a worktree)", "1.5 GB", `not a registered worktree; it holds ${rel(R("impower.worktrees/ci/40-grabbed-alone"))}, which the --apply run at ${NOW} failed to remove (git worktree remove stopped part-way (error: failed to delete '${R("impower.worktrees/ci/40-grabbed-alone")}': Permission denied) and dropped its record`, "; its branch ci/40-grabbed-alone is still local"],
      [rel(R("impower.worktrees/fix/15-branch-fails")), "kept", "  fix/15-branch-fails  ", `its branch fix/15-branch-fails is still local and no worktree holds it: the --apply run at ${NOW} failed to remove it (the directory is gone; git branch -D fix/15-branch-fails failed (error: could not delete 'fix/15-branch-fails'), so delete the branch by hand; merged into origin/main; no origin/fix/15-branch-fails); every commit on it is on origin/main, so \`git branch -D fix/15-branch-fails\` finishes that removal`],
      ["fix/43-rename-back-fails", "kept", `its directory is gone and ${R("impower.worktrees/fix/43-rename-back-fails")}.removing is beside it, which is what an interrupted run's probe leaves; rename it back by hand`],
      [rel(R("impower.worktrees/fix/43-rename-back-fails.removing")), "kept", "(not a worktree)", "1.0 GB", `the worktree ${rel(R("impower.worktrees/fix/43-rename-back-fails"))}, renamed by an interrupted run's probe and not renamed back; rename it back by hand`],
      ["fix/44-link-out", "kept", linkOutRow],
      ["fix/46-unreadable", "kept", unreadableRow],
      ["fix/9-held", "kept", "the directory could not be renamed (EPERM)"],
      ["fix/22-commits-late", "kept", "1 commit not on origin/main, and no origin/fix/22-commits-late holds them"],
      ["fix/25-dirty-late", "kept", "changed since it was classified: uncommitted changes (1 file)"],
      ["fix/24-size-throws", "removed"],
      ["fix/36-remove-throws", "removed"],
      ["fix/42-list-fails", "removed"],
    ]);
    assert.ok(!rowFor(r.out, `${rel(R("impower.worktrees/fix/15-branch-fails"))}  `).row.includes("(not a worktree)"), "the stranded branch row reads as a directory");
    assert.equal(r.out.split(/\r?\n/).filter((l) => l.includes("  fix/43-rename-back-fails  ")).length, 1, "the branch of the probe that could not be renamed back was listed as stranded too");
    assert.match(r.out, /Removed 3 worktrees and their branches, freeing 3\.0 GB; 38 worktrees kept; 7 directories under the worktrees root are not worktrees \(4\.8 GB\); 1 branch whose worktree is gone is still local \(fix\/15-branch-fails\)\./);
    assert.ok(w.branches.has("fix/15-branch-fails"), "the stranded branch was deleted by the listing");
  });

  await step("when the processes cannot be listed every worktree is kept and the summary says so, and a third run still names the branches the log holds", async () => {
    w.processesFail = true;
    const r = await run(mainFn, w, MAIN);
    w.processesFail = false;
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["fix/9-held", "keep", "the processes on this machine could not be listed, so whether one is using it is unknown"],
      [rel(R("impower.worktrees/fix/14-grabbed")), "keep", "(not a worktree)", "; its branch fix/14-grabbed is still local"],
      [rel(R("impower.worktrees/ci")), "keep", "(not a worktree)", "; its branch ci/40-grabbed-alone is still local"],
      [rel(R("impower.worktrees/fix/15-branch-fails")), "keep", "  fix/15-branch-fails  ", "its branch fix/15-branch-fails is still local and no worktree holds it"],
    ]);
    assert.match(r.out, /0 to remove \(0 B\), 38 kept; 7 directories under the worktrees root are not worktrees \(4\.8 GB\); 1 branch whose worktree is gone is still local \(fix\/15-branch-fails\); the processes on this machine could not be listed \(powershell\.exe not found\), which kept every worktree\./);
  });

  await step("a stranded branch's commits are read again before -D is advised, a branch a registered worktree holds is not listed as stranded, and a branch stranded at a path a later worktree reused is still listed", async () => {
    for (const b of ["task/8-loose", "old/stranded", "task/11-uncounted"]) w.branches.add(b);
    w.loose = { "task/8-loose": 1, "old/stranded": 0 };
    const seed = (obj) => w.log.push(JSON.stringify({ at: "t9", ...obj }));
    seed({ decision: "failed", path: R("impower.worktrees/task/8-loose"), branch: "task/8-loose", why: "merged into origin/main; no origin/task/8-loose" });
    seed({ decision: "removing", path: R("impower.worktrees/fix/3-dirty"), branch: "old/stranded", why: "merged into origin/main; no origin/old/stranded" });
    seed({ decision: "kept", path: R("impower.worktrees/fix/3-dirty"), branch: "fix/3-dirty", why: "uncommitted changes (1 file)" });
    seed({ decision: "failed", path: R("impower.worktrees/task/9-live-old"), branch: "fix/3-dirty", why: "merged into origin/main; no origin/fix/3-dirty" });
    seed({ decision: "removing", path: R("impower.worktrees/task/11-uncounted"), branch: "task/11-uncounted", why: "merged into origin/main; no origin/task/11-uncounted" });
    const r = await run(mainFn, w, MAIN);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["task/8-loose", "keep", "its branch task/8-loose is still local and no worktree holds it: the --apply run at t9 failed to remove it (merged into origin/main; no origin/task/8-loose); it holds 1 commit not on origin/main; left for a person"],
      ["old/stranded", "keep", "its branch old/stranded is still local and no worktree holds it: the --apply run at t9 was removing it when that run stopped (merged into origin/main; no origin/old/stranded); every commit on it is on origin/main, so `git branch -D old/stranded` finishes that removal"],
      ["task/11-uncounted", "keep", "its branch task/11-uncounted is still local and no worktree holds it: the --apply run at t9 was removing it when that run stopped (merged into origin/main; no origin/task/11-uncounted); whether its commits are on origin/main could not be read (fatal: ambiguous argument 'refs/heads/task/11-uncounted': unknown revision); left for a person"],
      ["fix/15-branch-fails", "keep", "every commit on it is on origin/main, so `git branch -D fix/15-branch-fails` finishes that removal"],
    ]);
    for (const b of ["task/8-loose", "task/11-uncounted"]) assert.ok(!rowFor(r.out, `  ${b}  `).row.includes("branch -D"), `${b}, whose commits are not known to be on origin/main, is advised -D`);
    assert.equal(r.out.split(/\r?\n/).filter((l) => l.includes("  fix/3-dirty  ")).length, 1, "a branch a registered worktree holds, fix/3-dirty, was listed as stranded too");
    assert.ok(!r.out.includes("9-live-old"), "the old path of a branch a registered worktree holds was listed");
    assert.match(r.out, /4 branches whose worktree is gone are still local \(fix\/15-branch-fails, task\/8-loose, old\/stranded, task\/11-uncounted\)/);
  });

  await step("a dry run without a recorded origin/HEAD says so and goes on", async () => {
    w.noOriginHead = true;
    const r = await run(mainFn, w, MAIN);
    w.noOriginHead = false;
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /^origin\/HEAD is not recorded in .*impower, so main alone counts as the default branch; `git remote set-head origin --auto` records it$/m);
    expectRows(r.out, [
      [rel(R("impower.worktrees/main-copy")), "keep", "  main  ", "the default branch main"],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
    ]);
  });
}
const rows = (out) => out.split(/\r?\n/).filter((l) => /^(keep|remove|kept|removed|failed)\s/.test(l)).length;

await worldChecks(main, (name, err) => check(name, () => (err ? Promise.reject(err) : undefined)));

// --------------------------------------------------------------- controls ---
//
// Each copy of the script has one rule cut out. Run against it, the world
// checks must fail, and must name the worktree that rule protects.

const source = fs.readFileSync(SCRIPT, "utf8");
const controls = fs.mkdtempSync(path.join(os.tmpdir(), "clean-worktrees-controls-"));
const control = async (label, cuts, names) => {
  await check(`control: ${label}`, async () => {
    let text = source;
    for (const [needle, replacement] of cuts) {
      assert.ok(text.includes(needle), `the fixture was not built: the script no longer contains ${JSON.stringify(needle)}`);
      text = text.replace(needle, () => replacement);
    }
    const copy = path.join(controls, `${label.replace(/\W+/g, "-")}.mjs`);
    fs.writeFileSync(copy, text);
    const failed = [];
    await worldChecks((await import(pathToFileURL(copy))).main, (name, err) => err && failed.push(`${name}\n${err.message}`));
    const out = failed.join("\n");
    assert.ok(failed.length, "the checks passed against the broken copy");
    for (const name of names) assert.ok(out.includes(name), `the failure does not name ${name}:\n${out}`);
  });
};
try {
  await control("a dirty tree is not refused", [["if (facts.dirty > 0)", "if (false)"]], ["fix/3-dirty: expected keep, got remove"]);
  await control("unpushed commits are not refused", [["if (facts.unpushed > 0) keep.push(", "if (false) keep.push("], ["else if (facts.ownCommits > 0) keep.push(", "else if (false) keep.push("]], ["fix/4-unpushed: expected keep, got remove", "row for fix/5-open does not say"]);
  await control("commits on the remote alone are not refused", [["else if (facts.remoteAhead > 0) keep.push(", "else if (false) keep.push("]], ["fix/17-remote-ahead: expected keep, got remove"]);
  await control("servers up are not refused", [['if (s.state === "up")', "if (false)"]], ["fix/7-servers-up: expected keep, got remove"]);
  await control("servers launching are not refused", [['else if (s.state === "launching")', "else if (false)"]], ["fix/8-servers-launching: expected keep, got remove"]);
  await control("a process naming the directory is not refused", [["else if (facts.users.length) keep.push(", "else if (false) keep.push("]], ["fix/16-in-use: expected keep, got remove"]);
  const freshCuts = [["else if (!facts.committed && facts.onFirstParent) keep.push(", "else if (false) keep.push("], ["else if (!facts.committed && facts.created) keep.push(", "else if (false) keep.push("], ["else if (!facts.committed) keep.push(", "else if (false) keep.push("]];
  await control("a branch with no commit made on it is not refused", freshCuts, ["fix/6-fresh: expected keep, got remove", "fix/28-fast-forwarded: expected keep, got remove", "fix/29-stacked-fresh: expected keep, got remove", "fix/34-no-reflog-fresh: expected keep, got remove", "fix/37-stacked-ff: expected keep, got remove", "fix/21-no-reflog: expected keep, got remove", "fix/38-partial-reflog: expected keep, got remove"]);
  await control("a fresh worktree on origin/main's first-parent line is not told by its tip", [freshCuts[0]], ["row for fix/6-fresh does not say", "row for fix/28-fast-forwarded does not say", "row for fix/34-no-reflog-fresh does not say"]);
  await control("a fresh worktree stacked on a merged tip, or fast-forwarded onto one, is not told by its reflog reaching its creation", [freshCuts[1]], ["row for fix/29-stacked-fresh does not say", "row for fix/37-stacked-ff does not say"]);
  await control("a branch whose reflog can tell neither is removed as merged", [freshCuts[2]], ["fix/21-no-reflog: expected keep, got remove", "fix/38-partial-reflog: expected keep, got remove"]);
  await control("the default branch is not refused", [["if (facts.isDefault) keep.push(", "if (false) keep.push("]], [`${rel(R("impower.worktrees/main-copy"))}: expected keep, got remove`]);
  await control("the default branch is removed once the classification lets it through", [["if (facts.isDefault) keep.push(", "if (false) keep.push("], ["if (ctx.defaultBranches.has(entry.branch)) return kept(", "if (false) return kept("]], [`${rel(R("impower.worktrees/main-copy"))}: expected kept, got removed`]);
  await control("a relative --root is accepted", [["if (!path.isAbsolute(opts.root)) die(", "if (false) die("]], ["--apply with a relative --root is refused before anything is fetched"]);
  await control("the probe's leftover beside a missing worktree is not seen", [["facts.probeLeft = facts.missing && deps.exists(`${abs}${PROBE_SUFFIX}`);", "facts.probeLeft = false;"]], ["row for fix/41-probe-left does not say"]);
  await control("a detached head is not refused", [['if (entry.detached) keep.push("detached head', 'if (false) keep.push("detached head']], ["(detached): expected keep, got remove"]);
  await control("an unborn branch is not refused", [['if (facts.unborn) keep.push("unborn branch', 'if (false) keep.push("unborn branch']], ["fix/18-unborn: expected keep, got remove"]);
  await control("a locked worktree is not refused", [["if (entry.locked) keep.push", "if (false) keep.push"]], ["fix/12-locked: expected keep, got remove"]);
  await control("the main checkout and a path outside the root are not refused", [["if (!facts.insideRoot) keep.push", "if (false) keep.push"]], ["main: expected keep, got remove", "fix/13-outside: expected keep, got remove"]);
  await control("the removal reaches outside the root", [["if (!facts.insideRoot) keep.push", "if (false) keep.push"], ["if (!isUnder(abs, ctx.root)) return kept(", "if (false) return kept("]], ["the script removed a path outside the root"]);
  await control("the dry run removes", [["const { apply, root: namedRoot } = parseArgs(argv);", "const { root: namedRoot } = parseArgs(argv); const apply = true;"]], ["the dry run removed worktrees"]);
  await control("--apply runs without --root", [["if (opts.apply && !opts.root) die(", "if (false) die("]], ["--apply without --root is refused before anything is fetched"]);
  await control("--apply runs with a --root that is not the main checkout", [["if (namedRoot && !samePath(namedRoot, mainRoot)) die(", "if (false) die("]], ["--apply with a --root that is not the main checkout is refused before anything is fetched"]);
  await control("the run does not fetch first", [['gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);', ""]], ["it did not fetch with --prune first"]);
  await control("a held directory is not probed before git worktree remove", [["deps.rename(abs, probe);", ""]], ["fix/9-held: expected kept, got failed"]);
  await control("the probe name is not checked before use", [["if (deps.exists(probe)) return kept(", "if (false) return kept("]], ["row for fix/32-probe-taken does not say"]);
  await control("the branch is deleted without reading its commits again", [["if (own.status !== 0 || Number(own.out) > 0) return kept(", "if (false) return kept("]], ["fix/22-commits-late: expected kept, got removed"]);
  await control("the checked-out branch is not read again", [["if (head.status !== 0 || head.out !== ref) return kept(", "if (false) return kept("]], ["fix/33-switched-late: expected kept, got removed"]);
  await control("a refusal that kept git's record is removed directly", [["      if (reg.registered) {", "      if (false) {"]], ["fix/35-refuses-late: expected kept, got removed"]);
  await control("a registration that could not be read is read as dropped", [["if (!reg.known) return failed(", "if (false) return failed("]], ["fix/42-list-fails: expected failed, got removed"]);
  await control("a removal is not recorded before it starts", [['    record({ decision: "removing", path: path.resolve(row.entry.path), branch: row.entry.branch, why: row.why });', ""]], [`no removing row for ${path.join("fix", "1-merged-gone")} in the log`]);
  await control("a stray type directory is not matched to the removal it holds", [["const held = unfinishedRemovals(log).filter((r) => isUnder(r.path, p));", "const held = [];"]], [`row for ${rel(R("impower.worktrees/ci"))} does not say`]);
  await control("a branch stranded with no directory is not listed", [["for (const r of strandedBranches(earlier)) {", "for (const r of []) {"]], [`no row for ${rel(R("impower.worktrees/fix/15-branch-fails"))}`]);
  await control("a failed branch deletion is reported as removed", [["if (del.status !== 0) return failed(", "if (false) return failed("]], ["fix/15-branch-fails: expected failed, got removed"]);
  await control("a type directory that refuses to go stops the run", [[`    try {\n      deps.removeEmptyDir(parent);\n      notes.push(\`removed the empty \${rel}\`);\n    } catch (err) {\n      notes.push(\`the empty \${rel} could not be removed (\${err.code ?? err.message})\`);\n    }`, "    deps.removeEmptyDir(parent);\n    notes.push(`removed the empty ${rel}`);"]], ["perf/23-rmdir-busy: expected removed, got failed"]);
  await control("a row whose sizing fails is removed or loses its row", [[".catch(sizeError(row))", ""]], ["row for fix/24-size-throws does not say"]);
  await control("a row that throws loses the table", [[".catch(rowError(row))", ""]], ["--apply removes the merged clean ones"]);
  await control("directories that are not worktrees are not listed", [["const strayPaths = strayDirs(entries, ctx.root, deps.listDirs);", "const strayPaths = [];"]], ["no row for impower.worktrees"]);
  await control("the rows are not recorded for the next run", [["if (!row.stray) record({ decision: row.decision, path: path.resolve(row.entry.path), branch: row.entry.branch, why: row.why });", ""]], [`row for ${rel(R("impower.worktrees/fix/14-grabbed"))} does not say`]);
  await control("a stray row is recorded over the removal it reports", [["if (!row.stray) record({ decision: row.decision,", "record({ decision: row.decision,"]], ["the log does not hold every worktree row, or holds a stray one", `row for ${rel(R("impower.worktrees/fix/14-grabbed"))} does not say '; its branch fix/14-grabbed is still local'`]);
  await control("a failed removal exits 0", [["return failed ? 1 : 0;", "return 0;"]], ["exit code 0 though a removal failed"]);
  await control("a tree that turned dirty after classification is removed", [["if (dirty > 0) return kept(", "if (false) return kept("]], ["fix/25-dirty-late: expected kept, got removed"]);
  await control("the older driver location is not looked at", [['".agents/skills/resolve-issue/driver.mjs"', '".agents/skills/resolve-issue/driver-elsewhere.mjs"']], ["fix/26-old-driver-up: expected keep, got remove"]);
  await control("the VS Code driver is not asked", [['  { driver: ".agents/skills/drive-vscode-web/driver.mjs", states: [".agents/skills/drive-vscode-web/.state.json"] },\n', ""]], ["row for fix/47-two-servers does not say 'dev servers up at http://localhost:6 (pid 1) through drive-vscode-web'"]);
  await control("the web editor driver's older state file location is not looked at", [['states: [".agents/skills/drive-web-editor/.state.json", ".agents/skills/resolve-issue/.state.json"]', 'states: [".agents/skills/drive-web-editor/.state.json"]']], ["fix/51-web-old-state: expected keep, got remove"]);
  await control("only one live server is reported", [['  return results.filter((s) => s.state !== "down");', '  return results.filter((s) => s.state !== "down").slice(0, 1);']], ["row for fix/47-two-servers does not say 'dev servers up at http://localhost:6 (pid 1) through drive-vscode-web'"]);
  await control("a driver that cannot answer loses its row to another driver's down", [['  return results.filter((s) => s.state !== "down");', '  return results.some((s) => s.state === "down") ? [] : results.filter((s) => s.state !== "down");']], ["fix/49-recorded-server: expected keep, got remove", "fix/50-unknown-state: expected keep, got remove"]);
  await control("a driver that cannot answer is not judged by its state file", [['    const judged = answer.state === "unknown" ? recordedServer(stateFileOf(worktree, d, deps.exists), deps, answer.detail) : answer;', "    const judged = answer;"]], ["fix/48-crashed-driver: expected remove, got keep", "row for fix/49-recorded-server does not say", "row for fix/51-web-old-state does not say"]);
  await control("a worktree git cannot answer for stops the run", [["      verdict = { remove: false, reasons: [`git could not judge it (${err.message}); left for a person`] };", "      throw err;"]], ["the dry run classifies every worktree and removes nothing"]);
  await control("a worktree git no longer sees, or whose directory is gone, is asked for its status", [["if (facts.isMain || facts.isDefault || entry.detached || entry.prunable || facts.missing || facts.unborn) return facts;", "if (facts.isMain || facts.isDefault || entry.detached || facts.unborn) return facts;"]], ["row for fix/19-broken does not say", "row for fix/20-missing does not say"]);
  await control("a link leading outside the tree is not refused", [["if (out.length) return `", "if (false) return `"]], ["fix/44-link-out: expected keep, got remove"]);
  await control("a directory the walk cannot read is not refused", [["if (scan.unreadable.length) return `", "if (false) return `"]], ["fix/46-unreadable: expected keep, got remove"]);
  await control("a probe that could not be renamed back is reported as kept", [["return failed(`the directory was renamed to ${probe} to test whether a process holds it and could not be renamed back", "return kept(`the directory was renamed to ${probe} to test whether a process holds it and could not be renamed back"]], ["fix/43-rename-back-fails: expected failed, got kept"]);
  await control("the branch origin/HEAD names is not refused", [["ctx.defaultBranches.add(originHead.out.slice(", "void (originHead.out.slice("]], [`${rel(R("impower.worktrees/trunk-copy"))}: expected keep, got remove`]);
  await control("--apply runs without a recorded origin/HEAD", [["else if (apply) die(`origin/HEAD is not recorded", "else if (false) die(`origin/HEAD is not recorded"]], ["--apply without a recorded origin/HEAD is refused before anything is fetched"]);
  await control("a stranded branch's commits are not read before -D is advised", [["Number(own.out) > 0 ? `it holds", "false ? `it holds"]], ["row for task/8-loose does not say"]);
  await control("a branch a registered worktree holds is listed as stranded", [["if (entries.some((e) => e.branch === r.branch) || strayPaths.some(", "if (strayPaths.some("]], ["a branch a registered worktree holds, fix/3-dirty, was listed as stranded too"]);
  await control("the stranded branches are read by path, so a worktree recreated at the path hides one", [['export const strandedBranches = (log) => unfinished(log, "branch");', 'export const strandedBranches = (log) => unfinished(log, "path");']], ["no row for old/stranded"]);
} finally {
  fs.rmSync(controls, { recursive: true, force: true });
}

// ------------------------------------------------------- real commands ---
//
// A scratch repository under the temp directory: a bare origin, a main
// checkout named `impower`, and worktrees that are merged and deleted on the
// remote, merged with a file left behind, fresh from origin/main, fresh from
// a merged tip, named by a running process, held by a process's current
// directory, merged locally while the remote has a commit more, merged with
// an ignored path too long for git to delete, fast-forwarded to origin/main
// with no commit made, merged with its reflog expired, merged into main by
// fast-forward, fast-forwarded with no commit made onto a branch merged
// later, merged and holding a junction (a symlink elsewhere) to a directory
// outside the worktrees root, and, last, one holding main while the main
// checkout is parked on another branch. The script runs as a command, so
// this also pins its exit codes, its refusals, the log it writes, and the
// process listing, the rename probe and the link scan on the real system.

const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "clean-worktrees-")));
console.log(`Scratch repository: ${scratch}`);
const mainRoot = path.join(scratch, "impower");
const root = path.join(scratch, "impower.worktrees");
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "check",
  GIT_AUTHOR_EMAIL: "check@example.invalid",
  GIT_COMMITTER_NAME: "check",
  GIT_COMMITTER_EMAIL: "check@example.invalid",
  GIT_CONFIG_COUNT: "3",
  GIT_CONFIG_KEY_0: "commit.gpgsign",
  GIT_CONFIG_VALUE_0: "false",
  GIT_CONFIG_KEY_1: "init.defaultBranch",
  GIT_CONFIG_VALUE_1: "main",
  GIT_CONFIG_KEY_2: "core.longpaths",
  GIT_CONFIG_VALUE_2: "false",
};
const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, env, encoding: "utf8", windowsHide: true });
  assert.equal(r.status, 0, `git ${args.join(" ")} in ${cwd}:\n${r.stderr}${r.stdout}`);
  return r.stdout.trim();
};
const cli = (cwd, ...args) => {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, env, encoding: "utf8", windowsHide: true, timeout: 120_000 });
  return { status: r.status, out: (r.stdout ?? "") + (r.stderr ?? "") };
};
const wt = (branch) => path.join(root, branch);
const commitIn = (branch, name) => {
  fs.writeFileSync(path.join(wt(branch), `${name}.txt`), `${name}\n`);
  git(wt(branch), "add", "-A");
  git(wt(branch), "commit", "-q", "-m", name);
};
const mergedWorktree = (branch, deleteRemote) => {
  git(mainRoot, "worktree", "add", "-q", "-b", branch, wt(branch), "origin/main");
  commitIn(branch, branch.replace("/", "-"));
  git(wt(branch), "push", "-q", "-u", "origin", branch);
  git(mainRoot, "merge", "--no-ff", "-q", "-m", `Merge ${branch}`, branch);
  git(mainRoot, "push", "-q", "origin", "main");
  if (deleteRemote) git(mainRoot, "push", "-q", "origin", "--delete", branch);
};
const branches = () => git(mainRoot, "for-each-ref", "--format=%(refname:short)", "refs/heads/").split(/\r?\n/).filter(Boolean).sort();
const worktreePaths = () => git(mainRoot, "worktree", "list", "--porcelain").split(/\r?\n/).filter((l) => l.startsWith("worktree ")).length;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const holders = [];
const hold = (cwd, ...args) => {
  const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 300000)", ...args], { cwd, windowsHide: true, stdio: "ignore" });
  holders.push(child);
  return child;
};
const stopHolder = async (child) => {
  child.kill();
  for (let i = 0; i < 40 && child.exitCode === null && child.signalCode === null; i++) await sleep(100);
  await sleep(200);
};

try {
  git(scratch, "init", "-q", "--bare", "origin.git");
  git(scratch, "init", "-q", "impower");
  git(mainRoot, "remote", "add", "origin", path.join(scratch, "origin.git"));
  fs.writeFileSync(path.join(mainRoot, "README.md"), "scratch\n");
  fs.writeFileSync(path.join(mainRoot, ".gitignore"), ".env.local\n.deep/\nnode_modules\n");
  git(mainRoot, "add", "-A");
  git(mainRoot, "commit", "-q", "-m", "initial");
  git(mainRoot, "push", "-q", "-u", "origin", "main");
  mergedWorktree("fix/1-merged-gone", true);
  fs.writeFileSync(path.join(wt("fix/1-merged-gone"), ".env.local"), "SECRET=x\n");
  mergedWorktree("fix/3-dirty", true);
  fs.writeFileSync(path.join(wt("fix/3-dirty"), "scratch.sd"), "left behind\n");
  git(mainRoot, "worktree", "add", "-q", "-b", "fix/4-fresh", wt("fix/4-fresh"), "origin/main");
  git(mainRoot, "worktree", "add", "-q", "-b", "fix/5-stacked", wt("fix/5-stacked"), "fix/1-merged-gone");
  mergedWorktree("fix/6-in-use", true);
  const inUse = hold(scratch, wt("fix/6-in-use"));
  mergedWorktree("fix/7-held", true);
  fs.mkdirSync(path.join(wt("fix/7-held"), "node_modules", "pkg"), { recursive: true });
  const held = hold(path.join(wt("fix/7-held"), "node_modules", "pkg"));
  mergedWorktree("fix/8-remote-ahead", false);
  commitIn("fix/8-remote-ahead", "after-merge");
  git(wt("fix/8-remote-ahead"), "push", "-q", "origin", "fix/8-remote-ahead");
  git(wt("fix/8-remote-ahead"), "reset", "-q", "--hard", "HEAD~1");
  if (WIN) {
    mergedWorktree("fix/9-deep", true);
    const long = path.join(wt("fix/9-deep"), ".deep", ...Array.from({ length: 12 }, (_, i) => `segment-${i}-abcdefghijklmnopqrstuvwxyz`));
    fs.mkdirSync(long, { recursive: true });
    fs.writeFileSync(path.join(long, "f.txt"), "x");
  }
  git(mainRoot, "worktree", "add", "-q", "-b", "task/10-fast-forwarded", wt("task/10-fast-forwarded"), "origin/main~1");
  git(wt("task/10-fast-forwarded"), "merge", "-q", "--ff-only", "origin/main");
  mergedWorktree("fix/11-no-reflog", true);
  git(mainRoot, "reflog", "expire", "--expire=all", "refs/heads/fix/11-no-reflog");
  git(mainRoot, "worktree", "add", "-q", "-b", "fix/12-ff-merged", wt("fix/12-ff-merged"), "origin/main");
  commitIn("fix/12-ff-merged", "fix-12-ff-merged");
  git(wt("fix/12-ff-merged"), "push", "-q", "-u", "origin", "fix/12-ff-merged");
  git(mainRoot, "merge", "-q", "--ff-only", "fix/12-ff-merged");
  git(mainRoot, "push", "-q", "origin", "main");
  git(mainRoot, "push", "-q", "origin", "--delete", "fix/12-ff-merged");
  // fix/13-stacked-ff is created from origin/main with no commit and
  // fast-forwarded onto fix/14-base, which is then merged: its tip is the
  // second parent of that merge, off the first-parent line.
  git(mainRoot, "worktree", "add", "-q", "-b", "fix/14-base", wt("fix/14-base"), "origin/main");
  commitIn("fix/14-base", "fix-14-base");
  git(mainRoot, "worktree", "add", "-q", "-b", "fix/13-stacked-ff", wt("fix/13-stacked-ff"), "origin/main");
  git(wt("fix/13-stacked-ff"), "merge", "-q", "--ff-only", "fix/14-base");
  git(wt("fix/14-base"), "push", "-q", "-u", "origin", "fix/14-base");
  git(mainRoot, "merge", "--no-ff", "-q", "-m", "Merge fix/14-base", "fix/14-base");
  git(mainRoot, "push", "-q", "origin", "main");
  git(mainRoot, "push", "-q", "origin", "--delete", "fix/14-base");
  // fix/15-junction is merged and clean, and its ignored node_modules is a
  // junction to a directory outside the worktrees root holding a file.
  mergedWorktree("fix/15-junction", true);
  const outside = path.join(scratch, "outside", "nm");
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(outside, "precious.txt"), "do not delete\n");
  fs.symlinkSync(outside, path.join(wt("fix/15-junction"), "node_modules"), WIN ? "junction" : "dir");
  await sleep(800);
  const made = ["fix/1-merged-gone", "fix/11-no-reflog", "fix/12-ff-merged", "fix/13-stacked-ff", "fix/14-base", "fix/15-junction", "fix/3-dirty", "fix/4-fresh", "fix/5-stacked", "fix/6-in-use", "fix/7-held", "fix/8-remote-ahead", ...(WIN ? ["fix/9-deep"] : []), "main", "task/10-fast-forwarded"].sort();
  assert.deepEqual(branches(), made);
  const before = made.length;
  assert.equal(worktreePaths(), before);
  assert.equal(git(mainRoot, "reflog", "show", "--format=%H", "refs/heads/fix/11-no-reflog"), "", "the reflog of fix/11-no-reflog did not expire");
  assert.equal(git(mainRoot, "rev-list", "--count", "refs/heads/fix/13-stacked-ff", "^refs/remotes/origin/main"), "0", "fix/13-stacked-ff is not merged");
  if (WIN) assert.equal(git(wt("fix/15-junction"), "status", "--porcelain", "--ignored=matching"), "!! node_modules/", "the junction is not an ignored directory to git");
  else assert.equal(git(wt("fix/15-junction"), "status", "--porcelain", "--ignored=matching"), "!! node_modules", "git reports the ignored POSIX symlink as a file-type entry");

  await check("as a command, --apply on a repository that never recorded origin/HEAD exits 1 and touches nothing, until `git remote set-head` records it", () => {
    const r = cli(mainRoot, "--apply", "--root", mainRoot);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: origin\/HEAD is not recorded in .*, so which branch is the default cannot be told beyond main; `git remote set-head origin --auto` records it; nothing was touched/);
    assert.equal(worktreePaths(), before);
    assert.deepEqual(branches(), made);
    assert.ok(!fs.existsSync(path.join(mainRoot, ".git", LOG_NAME)), "a refused run wrote the log");
    git(mainRoot, "remote", "set-head", "origin", "--auto");
    assert.equal(git(mainRoot, "symbolic-ref", "-q", "refs/remotes/origin/HEAD"), "refs/remotes/origin/main");
  });

  await check("as a command, run from a worktree it exits 1 naming the main checkout", () => {
    const r = cli(wt("fix/1-merged-gone"), "--apply", "--root", mainRoot);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: run from the main checkout/);
    assert.ok(fs.existsSync(wt("fix/1-merged-gone")));
  });

  await check("as a command, --apply without --root, with the wrong one, or with a relative one, exits 1 and touches nothing", () => {
    let r = cli(mainRoot, "--apply");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: --apply needs --root <path>, the main checkout it is to act on/);
    r = cli(mainRoot, "--apply", "--root", scratch);
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: --root .* is not the main checkout the current directory belongs to, .*; nothing was touched/);
    r = cli(mainRoot, "--apply", "--root", ".");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: --root \. is not an absolute path; --root names the main checkout in full/);
    assert.equal(worktreePaths(), before);
    assert.deepEqual(branches(), made);
    assert.ok(!fs.existsSync(path.join(mainRoot, ".git", LOG_NAME)), "a refused run wrote the log");
  });

  await check("as a command, the dry run on a real repository classifies and removes nothing", () => {
    const r = cli(mainRoot);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["main", "keep", "the main checkout"],
      ["fix/1-merged-gone", "remove", "merged into origin/main; no origin/fix/1-merged-gone; takes 1 ignored path with it (.env.local)"],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
      ["fix/4-fresh", "keep", "no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none (no origin/fix/4-fresh); a fresh worktree a session may be working in"],
      ["fix/5-stacked", "keep", "no commit was made on the branch: its reflog holds its creation and no commit since (no origin/fix/5-stacked); a fresh worktree a session may be working in"],
      // Up to the open paren: what follows is the process name the system
      // reports, which is node.exe on Windows and MainThread on Linux.
      ["fix/6-in-use", "keep", `its path is on the command line of pid ${inUse.pid} (`],
      ["fix/7-held", "remove", "merged into origin/main; no origin/fix/7-held"],
      ["fix/8-remote-ahead", "keep", "origin/fix/8-remote-ahead has 1 commit not on origin/main and this branch is behind it; a pull request may be open"],
      ...(WIN ? [["fix/9-deep", "remove", "merged into origin/main; no origin/fix/9-deep; takes 1 ignored path with it (.deep/)"]] : []),
      ["task/10-fast-forwarded", "keep", "no commit was made on the branch: its tip is on origin/main's first-parent line and its reflog records none (no origin/task/10-fast-forwarded)"],
      ["fix/11-no-reflog", "keep", "its reflog records neither a commit nor its creation, so whether a commit was made on it cannot be told, and its tip is off origin/main's first-parent line (no origin/fix/11-no-reflog); left for a person"],
      ["fix/12-ff-merged", "remove", "merged into origin/main; no origin/fix/12-ff-merged"],
      ["fix/13-stacked-ff", "keep", "no commit was made on the branch: its reflog holds its creation and no commit since (no origin/fix/13-stacked-ff); a fresh worktree a session may be working in"],
      ["fix/14-base", "remove", "merged into origin/main; no origin/fix/14-base"],
      ["fix/15-junction", "keep", `1 link inside it points outside it (node_modules -> ${outside}); ${LINK_ADVICE}`],
    ]);
    assert.match(r.out, new RegExp(`Run again with --apply --root .* to remove the ${WIN ? 5 : 4}\\.`));
    assert.ok(fs.existsSync(wt("fix/1-merged-gone")), "the dry run removed a directory");
    assert.equal(worktreePaths(), before);
    assert.ok(!fs.existsSync(path.join(mainRoot, ".git", LOG_NAME)), "the dry run wrote the log");
  });

  await check("as a command, --apply removes the merged worktrees and their branches, finishes the one git could not, keeps the dirty one, the fresh ones, the expired one and a held tree untouched, and records every row with a removing row before each removal", () => {
    const r = cli(mainRoot, "--apply", "--root", mainRoot);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["fix/1-merged-gone", "removed"],
      ["fix/3-dirty", "kept"],
      ["fix/5-stacked", "kept"],
      ["fix/6-in-use", "kept", "its path is on the command line of pid"],
      ["fix/11-no-reflog", "kept"],
      ["fix/12-ff-merged", "removed"],
      ["fix/13-stacked-ff", "kept"],
      ["fix/14-base", "removed"],
      ["fix/15-junction", "kept", "1 link inside it points outside it (node_modules -> "],
      ["task/10-fast-forwarded", "kept"],
    ]);
    assert.equal(fs.existsSync(wt("fix/1-merged-gone")), false, "fix/1-merged-gone is still on disk");
    assert.equal(fs.existsSync(wt("fix/12-ff-merged")), false, "fix/12-ff-merged is still on disk");
    assert.equal(fs.existsSync(wt("fix/14-base")), false, "fix/14-base is still on disk");
    assert.ok(fs.existsSync(path.join(outside, "precious.txt")), "the file the junction points at, outside the worktrees root, is gone");
    assert.ok(fs.existsSync(path.join(wt("fix/15-junction"), ".git")), "the tree holding the junction lost its .git link");
    assert.ok(fs.existsSync(path.join(wt("fix/3-dirty"), "scratch.sd")), "the dirty tree lost its file");
    assert.ok(fs.existsSync(wt("task/10-fast-forwarded")), "the fast-forwarded fresh tree is gone");
    assert.ok(fs.existsSync(wt("fix/13-stacked-ff")), "the fresh tree fast-forwarded onto a merged branch is gone");
    assert.ok(fs.existsSync(wt("fix/11-no-reflog")), "the tree whose reflog expired is gone");
    const logged = readLogRows(fs.readFileSync(path.join(mainRoot, ".git", LOG_NAME), "utf8"));
    assert.equal(logged[0].run, `--apply --root ${mainRoot}`);
    // The dry run classifies fix/7-held as remove on both platforms, and only
    // Windows then refuses the rename while the holder has the directory open,
    // so it survives --apply there and is removed here.
    const removed = ["fix/1-merged-gone", "fix/12-ff-merged", "fix/14-base", ...(WIN ? ["fix/9-deep"] : ["fix/7-held"])].sort();
    assert.deepEqual(logged.filter((row) => row.decision === "removed").map((row) => row.branch).sort(), removed);
    assert.deepEqual(logged.filter((row) => row.decision === "removing").map((row) => row.branch).sort(), [...removed, ...(WIN ? ["fix/7-held"] : [])].sort(), "a removing row is missing or extra");
    for (const b of removed) assert.ok(logged.findIndex((row) => row.decision === "removing" && row.branch === b) < logged.findIndex((row) => row.decision === "removed" && row.branch === b), `the removing row for ${b} is not before its outcome`);
    assert.match(logged.at(-1).summary, /^Removed \d worktrees/);
    if (!WIN) return skip("the held tree and the part-way failure under --apply", "it depends on the system refusing a rename or a long path");
    expectRows(r.out, [
      ["fix/7-held", "kept", "the directory could not be renamed (EPERM), which on Windows happens while a process has a file open or its current directory inside it; no process names the path"],
      ["fix/9-deep", "removed", "git worktree remove stopped part-way (error: failed to delete '", "': Filename too long) and dropped its record; the rest of the directory was removed directly"],
    ]);
    assert.match(r.out, /Removed 4 worktrees and their branches/);
    assert.equal(fs.existsSync(wt("fix/9-deep")), false, "fix/9-deep is still on disk");
    assert.ok(fs.existsSync(path.join(wt("fix/7-held"), ".git")), "the held tree lost its .git link");
    assert.ok(fs.existsSync(path.join(wt("fix/7-held"), "fix-7-held.txt")), "the held tree lost a tracked file");
    assert.equal(git(wt("fix/7-held"), "status", "--porcelain"), "", "the held tree is no longer clean");
    assert.deepEqual(branches(), ["fix/11-no-reflog", "fix/13-stacked-ff", "fix/15-junction", "fix/3-dirty", "fix/4-fresh", "fix/5-stacked", "fix/6-in-use", "fix/7-held", "fix/8-remote-ahead", "main", "task/10-fast-forwarded"]);
    assert.equal(worktreePaths(), before - 4);
  });

  await check("as a command, once the holder is gone the next --apply removes the tree it kept", async () => {
    if (!WIN) return skip("the held tree's second run", "it depends on the system refusing a rename or a long path");
    await stopHolder(held);
    const r = cli(mainRoot, "--apply", "--root", mainRoot);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [["fix/7-held", "removed"]]);
    assert.equal(fs.existsSync(wt("fix/7-held")), false, "fix/7-held is still on disk");
    assert.deepEqual(branches(), ["fix/11-no-reflog", "fix/13-stacked-ff", "fix/15-junction", "fix/3-dirty", "fix/4-fresh", "fix/5-stacked", "fix/6-in-use", "fix/8-remote-ahead", "main", "task/10-fast-forwarded"]);
    assert.equal(worktreePaths(), before - 5);
    const runs = readLogRows(fs.readFileSync(path.join(mainRoot, ".git", LOG_NAME), "utf8")).filter((row) => row.run);
    assert.equal(runs.length, 2, "the log does not hold both runs");
  });

  await check("as a command, a stranded branch's commits are read again before -D is advised, and a branch a worktree holds is not listed as stranded", () => {
    git(mainRoot, "branch", "loose/1", "origin/fix/8-remote-ahead");
    assert.equal(git(mainRoot, "rev-list", "--count", "refs/heads/loose/1", "^refs/remotes/origin/main"), "1");
    const seed = (obj) => `${JSON.stringify({ at: "t9", ...obj })}\n`;
    fs.appendFileSync(path.join(mainRoot, ".git", LOG_NAME), seed({ decision: "failed", path: wt("loose/1"), branch: "loose/1", why: "merged" }) + seed({ decision: "failed", path: wt("fix/4-fresh-old"), branch: "fix/4-fresh", why: "merged" }));
    const r = cli(mainRoot);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [["loose/1", "keep", "its branch loose/1 is still local and no worktree holds it: the --apply run at t9 failed to remove it (merged); it holds 1 commit not on origin/main; left for a person"]]);
    assert.ok(!rowFor(r.out, "  loose/1  ").row.includes("branch -D"), "a branch holding a commit not on origin/main is advised -D");
    assert.equal(r.out.split(/\r?\n/).filter((l) => l.includes("  fix/4-fresh  ")).length, 1, "fix/4-fresh, checked out in a worktree, was listed as stranded too");
    assert.ok(!r.out.includes("4-fresh-old"), "the old path of a branch a worktree holds was listed");
    assert.match(r.out, /1 branch whose worktree is gone is still local \(loose\/1\)\./);
    assert.ok(branches().includes("loose/1"), "the dry run deleted the stranded branch");
  });

  await check("as a command, a worktree holding main while the main checkout is parked elsewhere is kept as the default branch", () => {
    git(mainRoot, "checkout", "-q", "-b", "wip/parked");
    git(mainRoot, "worktree", "add", "-q", wt("main-copy"), "main");
    const r = cli(mainRoot);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["wip/parked", "keep", "the main checkout"],
      [path.relative(scratch, wt("main-copy")), "keep", "  main  ", "the default branch main, which is never removed wherever it is checked out"],
    ]);
    assert.ok(branches().includes("main"), "the local main is gone");
  });
} finally {
  for (const h of holders) await stopHolder(h);
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passing");

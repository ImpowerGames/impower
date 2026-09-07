#!/usr/bin/env node
// Pins the decisions behind clean-worktrees.mjs and the commands it runs.
// Run:
//   node .claude/skills/clean-worktrees/clean-worktrees.test.mjs
//
// classify, serversFrom, usersOf and strayDirs take their inputs as
// parameters, so their tables are pinned here without a repository. The
// command as a whole is pinned by running `main` in-process against a stub of
// everything it asks the system: the stub answers each git, driver and
// process-listing call from a table of worktrees in every state the script
// decides on, models what real git does to a held tree (`git worktree remove`
// deletes the tracked files and the .git link, drops the record, then fails),
// and records what the script removes. The dry run must remove nothing;
// `--apply` must remove the merged clean ones only, delete their branches and
// any type directory left empty, keep the held and the changed ones
// untouched, report a gutted tree and a failed branch deletion as `failed`
// with the directory's state, and list the leftover directory on the next
// run. Controls run those same checks against copies of the script with one
// rule cut out, and require them to fail naming the worktree that rule
// protects. The real commands are pinned on a scratch repository with a held
// worktree, one in use, a fresh one, one stacked on a merged tip, one whose
// remote is ahead, one removable and one dirty, by running the script as a
// command. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "clean-worktrees.mjs");
const { classify, serversFrom, usersOf, strayDirs, parseWorktreeList, formatBytes, main } = await import(pathToFileURL(SCRIPT));

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

const entry = (over = {}) => ({ path: "C:/repo/impower.worktrees/fix/1-x", head: "bbbb", branch: "fix/1-x", detached: false, bare: false, locked: null, prunable: null, ...over });
const facts = (over = {}) => ({
  isMain: false,
  insideRoot: true,
  root: "C:/repo/impower.worktrees",
  missing: false,
  unborn: false,
  dirty: 0,
  ignored: [],
  ownCommits: 0,
  unpushed: 0,
  remoteExists: false,
  remoteAhead: 0,
  moved: true,
  servers: { state: "none" },
  users: [],
  ...over,
});

await check("a clean merged branch is removed, whether or not its remote still exists, naming the ignored paths it takes", () => {
  let v = classify(entry(), facts());
  assert.equal(v.remove, true);
  assert.deepEqual(v.reasons, ["merged into origin/main; no origin/fix/1-x"]);
  v = classify(entry(), facts({ remoteExists: true, ignored: ["node_modules/", ".claude/skills/drive-web-editor/.chrome-profile/"] }));
  assert.equal(v.remove, true);
  assert.deepEqual(v.reasons, ["merged into origin/main; origin/fix/1-x still exists; takes 2 ignored paths with it (node_modules/, .claude/skills/drive-web-editor/.chrome-profile/)"]);
  v = classify(entry(), facts({ ignored: ["a/", "b/", "c/", "d/", "e/"] }));
  assert.deepEqual(v.reasons, ["merged into origin/main; no origin/fix/1-x; takes 5 ignored paths with it (a/, b/, c/ and 2 more)"]);
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
  const v = kept(entry({ branch: null, detached: true }), facts({ dirty: 9, servers: { state: "up", url: "u", pid: 1 } }), "detached head");
  assert.equal(v.reasons.length, 1);
});

await check("an unborn branch is kept and nothing else about it is judged", () => {
  const v = kept(entry({ head: "0000000000000000000000000000000000000000" }), facts({ unborn: true, moved: false }), "unborn branch with no commits; left for a person");
  assert.equal(v.reasons.length, 1);
});

await check("a worktree with dev servers up or launching, or a driver that cannot answer, is kept; no driver is no reason", () => {
  kept(entry(), facts({ servers: { state: "up", url: "http://localhost:40444", pid: 25992 } }), "dev servers up at http://localhost:40444 (pid 25992)");
  kept(entry(), facts({ servers: { state: "launching", url: "http://localhost:38200", pid: 31268 } }), "dev servers launching (pid 31268 alive");
  kept(entry(), facts({ servers: { state: "unknown", detail: "SyntaxError" } }), "its driver could not report its servers (SyntaxError)");
  assert.equal(classify(entry(), facts({ servers: { state: "none" } })).remove, true);
  assert.equal(classify(entry(), facts({ servers: { state: "down" } })).remove, true);
});

await check("a worktree a running process names is kept, and one whose processes could not be listed", () => {
  kept(entry(), facts({ users: [{ pid: 4012, name: "node.exe" }] }), "in use by pid 4012 (node.exe)");
  kept(entry(), facts({ users: [{ pid: 1, name: "a" }, { pid: 2, name: "b" }, { pid: 3, name: "c" }] }), "in use by pid 1 (a), pid 2 (b) and 1 more");
  kept(entry(), facts({ users: null }), "the processes on this machine could not be listed");
});

await check("a locked worktree, one whose directory is gone, and one git no longer sees as a worktree are kept", () => {
  kept(entry({ locked: "in use" }), facts(), "locked (in use)");
  kept(entry({ prunable: "gitdir file points to non-existent location" }), facts(), "git no longer sees it as a worktree (gitdir file points to non-existent location) but the directory is still there; delete it by hand");
  kept(entry({ prunable: "gitdir file points to non-existent location" }), facts({ missing: true }), "its directory is gone; `git worktree prune` drops the record");
  kept(entry(), facts({ missing: true }), "its directory is gone; `git worktree prune` drops the record");
});

await check("a branch that has not moved since it was created is kept as a fresh worktree, and one without a reflog is left for a person", () => {
  kept(entry(), facts({ moved: false }), "the branch has not moved since it was created (no origin/fix/1-x); a fresh worktree a session may be working in, so remove it by hand when it is done");
  kept(entry(), facts({ moved: false, remoteExists: true }), "the branch has not moved since it was created (origin/fix/1-x exists)");
  kept(entry(), facts({ moved: null }), "the branch has no reflog, so whether commits were made in it cannot be told; left for a person");
});

await check("every reason that applies is listed", () => {
  const v = kept(entry(), facts({ dirty: 2, ownCommits: 1, unpushed: 1, servers: { state: "up", url: "u", pid: 7 }, users: [{ pid: 9, name: "x" }] }), "uncommitted changes", "1 commit not on origin/main", "dev servers up", "in use by pid 9 (x)");
  assert.equal(v.reasons.length, 4);
});

await check("serversFrom reads the driver's status line whatever it exits", () => {
  assert.deepEqual(serversFrom("UP  url=http://localhost:40444  pid=25992  mode=same-origin  state=x\n"), { state: "up", url: "http://localhost:40444", pid: 25992 });
  assert.deepEqual(serversFrom("DOWN  url=http://localhost:38200  pid=31268  mode=same-origin", () => true), { state: "launching", url: "http://localhost:38200", pid: 31268 });
  assert.deepEqual(serversFrom("DOWN  url=http://localhost:38200  pid=31268  mode=same-origin", () => false), { state: "down", url: "http://localhost:38200", pid: 31268 });
  assert.deepEqual(serversFrom("down (no state file)\n"), { state: "down" });
  assert.deepEqual(serversFrom("down (state file unreadable: x; `down` removes it)"), { state: "down" });
  assert.deepEqual(serversFrom("file:///x/driver.mjs:1\nSyntaxError: bad\n"), { state: "unknown", detail: "file:///x/driver.mjs:1" });
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
  assert.deepEqual(usersOf(dir, procs, 5).map((p) => p.pid), [1, 2, 4]);
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

await check("formatBytes picks the unit", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1.1 * 1024 ** 3), "1.1 GB");
  assert.equal(formatBytes(null), "");
});

// ------------------------------------------------------------ stub world ---
//
// A main checkout at /repo/impower and worktrees in every state under
// /repo/impower.worktrees/, except the one under /repo/elsewhere/, plus two
// directories under the root that are not worktrees. The stub's `exec`
// answers each git command the script runs from that table, the driver
// `status` from the tree's `driver` line and the process listing from
// `processes`; its file-system calls read and change the table, so a removal
// shows up in the next command's answer. A `held` tree refuses the rename
// probe; a `grabbed` tree is held only after the probe, so `git worktree
// remove` reaches it and does what real git does: deletes the tracked files
// and the .git link, drops the record, and fails.

const R = (...p) => path.resolve("/repo", ...p);
const MAIN = R("impower");
const ROOT = R("impower.worktrees");
const DRIVER = path.join(".claude", "skills", "drive-web-editor", "driver.mjs");
const LIVE_PID = 4242;
const SELF_PID = 100;
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
    trees: [
      { path: R("impower.worktrees/fix/1-merged-gone"), head: "c1", branch: "fix/1-merged-gone", size: 1.1 * GB, ignored: ["node_modules/", ".env.local"] },
      { path: R("impower.worktrees/fix/2-merged-kept-remote"), head: "c2", branch: "fix/2-merged-kept-remote", remote: true, size: 0.9 * GB },
      { path: R("impower.worktrees/fix/3-dirty"), head: "c3", branch: "fix/3-dirty", dirty: ["?? scratch.sd"] },
      { path: R("impower.worktrees/fix/4-unpushed"), head: "c4", branch: "fix/4-unpushed", own: 1, unpushed: 1 },
      { path: R("impower.worktrees/fix/5-open"), head: "c5", branch: "fix/5-open", own: 1, unpushed: 0, remote: true, remoteAhead: 1 },
      { path: R("impower.worktrees/fix/6-fresh"), head: "m3", branch: "fix/6-fresh", fresh: true },
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
      { path: R("impower.worktrees/fix/21-no-reflog"), head: "c21", branch: "fix/21-no-reflog", noReflog: true },
      { path: R("impower.worktrees/fix/22-commits-late"), head: "c22", branch: "fix/22-commits-late", size: 1 * GB, commitsLate: true },
      { path: R("impower.worktrees/perf/23-rmdir-busy"), head: "c23", branch: "perf/23-rmdir-busy", size: 1 * GB, rmdirBusy: true },
      { path: R("impower.worktrees/fix/24-size-throws"), head: "c24", branch: "fix/24-size-throws", size: 1 * GB, sizeThrows: 2 },
      { path: R("impower.worktrees/fix/25-dirty-late"), head: "c25", branch: "fix/25-dirty-late", size: 1 * GB, dirtyLate: true },
      { path: R("impower.worktrees/fix/26-old-driver-up"), head: "c26", branch: "fix/26-old-driver-up", driver: "UP  url=http://localhost:3  pid=1  mode=same-origin  state=s", oldDriver: true },
      { path: R("impower.worktrees/fix/27-git-fails"), head: "c27", branch: "fix/27-git-fails", statusFails: "fatal: index file corrupt" },
    ],
    strays: [R("impower.worktrees/fix/husk-old"), R("impower.worktrees/leftover")],
    processes: [
      { pid: SELF_PID, name: "node.exe", cmd: `node ${R("impower.worktrees/fix/1-merged-gone")}/.claude/skills/clean-worktrees/clean-worktrees.mjs` },
      { pid: 777, name: "node.exe", cmd: `"node" "${R("impower.worktrees/fix/16-in-use")}\\node_modules\\vite\\bin\\vite.js"` },
      { pid: 778, name: "node.exe", cmd: `node ${R("impower.worktrees/fix/16-in-use-2")}\\a.js` },
    ],
    branches: new Set(["main"]),
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
  const byBranch = (b) => w.trees.find((t) => t.branch === b);
  const unregister = (t) => w.trees.splice(w.trees.indexOf(t), 1);
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
  const OLD_DRIVER = path.join(".claude", "skills", "resolve-issue", "driver.mjs");
  w.deps = {
    cwd: () => w.cwd,
    pid: () => SELF_PID,
    processes: () => ({ ok: true, list: w.processes }),
    exec(cmd, args, cwd) {
      const a = args.join(" ");
      if (cmd !== "git") {
        const t = tree(cwd);
        assert.ok(t && args[1] === "status", `unexpected command ${cmd} ${a} in ${cwd}`);
        return { status: t.driver.startsWith("UP") ? 0 : 1, out: t.driver, err: "" };
      }
      let m;
      if (a === "rev-parse --show-toplevel") return ok(same(cwd, MAIN) ? MAIN : tree(cwd)?.path ?? cwd);
      if (a === "worktree list --porcelain") return ok(porcelain());
      if (a === "fetch --prune origin") return w.fetched++, ok();
      if (a === "status --porcelain --ignored=matching") return gitStatus(cwd, true);
      if (a === "status --porcelain") return gitStatus(cwd, false);
      if ((m = /^rev-parse --verify -q refs\/remotes\/origin\/(.+)$/.exec(a))) return byBranch(m[1])?.remote ? ok("abcd") : fail("");
      if ((m = /^rev-list --count refs\/remotes\/origin\/(.+?) \^refs\/remotes\/origin\/main$/.exec(a))) return ok(String(byBranch(m[1])?.remoteAhead ?? 0));
      if ((m = /^rev-list --count refs\/heads\/(.+?) \^refs\/remotes\/origin\/main( \^refs\/remotes\/origin\/(.+))?$/.exec(a))) {
        const t = byBranch(m[1]);
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
      if ((m = /^reflog show --format=%H refs\/heads\/(.+)$/.exec(a))) {
        const t = byBranch(m[1]);
        return ok(t.noReflog ? "" : t.fresh ? t.head : `${t.head}\nbase`);
      }
      if ((m = /^worktree remove (.+)$/.exec(a))) {
        const t = tree(m[1]);
        if (!t) return fail(`fatal: '${m[1]}' is not a working tree`, 128);
        if (!under(t.path, ROOT)) w.outsideRemoved.push(t.path);
        unregister(t);
        if (t.missing || t.prunable) return ok();
        if (t.held || t.grabbed) {
          onDisk(t.path).size = t.remaining;
          onDisk(t.path).gutted = true;
          return fail(`error: failed to delete '${t.path}': Permission denied`, 255);
        }
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
      const dir = path.dirname(p);
      const t = tree(dir);
      if (path.basename(p) === ".git") return Boolean(t && !t.prunable && !t.missing && onDisk(dir) && !onDisk(dir).gutted);
      return w.trees.some((t) => t.driver && same(path.join(t.path, t.oldDriver ? OLD_DRIVER : DRIVER), p));
    },
    listDirs: (p) => [...new Set([...w.disk.keys()].filter((d) => under(d, p)).map((d) => path.relative(path.resolve(p).toLowerCase(), d).split(path.sep)[0]))],
    isEmptyDir: (p) => ![...w.disk.keys()].some((d) => under(d, p)),
    rename: (from, to) => {
      const t = tree(from);
      if (t?.held) {
        const err = new Error("EPERM: operation not permitted, rename");
        err.code = "EPERM";
        throw err;
      }
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
    dirSize: async (p) => {
      const t = onDisk(p)?.tree;
      if (t?.sizeThrows) {
        t.sizeThrows--;
        throw new Error("the sizing walk failed");
      }
      return onDisk(p)?.size ?? 0;
    },
    freeSpace: () => 26 * GB,
    pidAlive: (pid) => pid === LIVE_PID,
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
    const d = rowFor(out, key.includes(path.sep) ? key : `  ${key}  `);
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
  const keptRows = ["fix/3-dirty", "fix/4-unpushed", "fix/5-open", "fix/6-fresh", "fix/7-servers-up", "fix/8-servers-launching", "fix/12-locked", "fix/13-outside", "(detached)", "fix/16-in-use", "fix/17-remote-ahead", "fix/18-unborn", "fix/19-broken", "fix/20-missing", "fix/21-no-reflog", "fix/26-old-driver-up", "fix/27-git-fails", "main"];

  await step("an unknown option is refused", async () => {
    const r = await run(mainFn, w, MAIN, "--all");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /unknown option --all/);
    assert.equal(w.fetched, 0, "it fetched before refusing");
  });

  await step("a bare first worktree, and an empty worktree list, are refused before anything is fetched", async () => {
    w.bare = true;
    let r = await run(mainFn, w, MAIN, "--apply");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /the first worktree is bare; run from the main checkout/);
    w.bare = false;
    w.emptyList = true;
    r = await run(mainFn, w, MAIN, "--apply");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /git worktree list printed nothing; run from the main checkout/);
    w.emptyList = false;
    assert.equal(w.fetched, 0, "it fetched before refusing");
    assert.deepEqual(w.removed, [], "it removed worktrees");
  });

  await step("run from a worktree it refuses, naming the main checkout, and removes nothing", async () => {
    const r = await run(mainFn, w, all[0].path, "--apply");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /run from the main checkout/);
    assert.deepEqual(w.removed, [], "it removed worktrees");
    assert.deepEqual(w.branchesDeleted, [], "it deleted branches");
  });

  await step("the dry run classifies every worktree and removes nothing", async () => {
    const r = await run(mainFn, w, MAIN);
    assert.deepEqual(w.removed, [], "the dry run removed worktrees");
    assert.deepEqual(w.branchesDeleted, [], "the dry run deleted branches");
    assert.deepEqual(w.renames, [], "the dry run renamed a directory");
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
      ["fix/22-commits-late", "remove", "merged into origin/main"],
      ["perf/23-rmdir-busy", "remove", "merged into origin/main"],
      ["fix/24-size-throws", "remove", "the sizing walk failed; the directory is still there; merged into origin/main"],
      ["fix/25-dirty-late", "remove", "merged into origin/main"],
      ["fix/26-old-driver-up", "keep", "dev servers up at http://localhost:3 (pid 1)"],
      ["fix/27-git-fails", "keep", `git could not judge it (git status --porcelain --ignored=matching failed in ${R("impower.worktrees/fix/27-git-fails")}: fatal: index file corrupt); left for a person`],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
      ["fix/4-unpushed", "keep", "1 commit not on origin/main, and no origin/fix/4-unpushed holds them"],
      ["fix/5-open", "keep", "1 commit not on origin/main (all on origin/fix/5-open; a pull request may be open)"],
      ["fix/6-fresh", "keep", "the branch has not moved since it was created (no origin/fix/6-fresh); a fresh worktree a session may be working in"],
      ["fix/7-servers-up", "keep", "dev servers up at http://localhost:1 (pid 1)"],
      ["fix/8-servers-launching", "keep", `dev servers launching (pid ${LIVE_PID} alive`],
      ["(detached)", "keep", "detached head"],
      ["fix/12-locked", "keep", "locked (in use)"],
      ["fix/13-outside", "keep", `outside ${ROOT}`],
      ["fix/16-in-use", "keep", "in use by pid 777 (node.exe)"],
      ["fix/17-remote-ahead", "keep", "origin/fix/17-remote-ahead has 2 commits not on origin/main and this branch is behind it; a pull request may be open"],
      ["fix/18-unborn", "keep", "unborn branch with no commits; left for a person"],
      ["fix/19-broken", "keep", "512.0 MB", "git no longer sees it as a worktree (gitdir file points to non-existent location) but the directory is still there; delete it by hand"],
      ["fix/20-missing", "keep", "its directory is gone; `git worktree prune` drops the record"],
      ["fix/21-no-reflog", "keep", "the branch has no reflog"],
      [rel(R("impower.worktrees/fix/husk-old")), "keep", "(not a worktree)", "204.8 MB", "not a registered worktree, which is what an interrupted removal or add leaves behind; delete it by hand after checking it"],
      [rel(R("impower.worktrees/leftover")), "keep", "(not a worktree)"],
    ]);
    assert.ok(!r.out.includes("fix/16-in-use-2"), "a process of a directory whose name extends another's was claimed");
    assert.match(r.out, /27 worktrees besides the main checkout: 10 to remove \(11\.0 GB\), 17 kept; 2 directories under the worktrees root are not a worktree \(409\.6 MB\)\./);
    assert.match(r.out, /Dry run; nothing was removed\. Run again with --apply to remove the 10\./);
  });

  await step("--apply removes the merged clean ones, keeps a held or changed tree untouched, and reports a gutted tree and a failed branch deletion with what is left", async () => {
    const r = await run(mainFn, w, MAIN, "--apply");
    assert.deepEqual(w.outsideRemoved, [], "the script removed a path outside the root");
    expectRows(r.out, [
      ["fix/1-merged-gone", "removed"],
      ["fix/2-merged-kept-remote", "removed"],
      ["docs/10-merged-gone", "removed", `removed the empty docs${path.sep}`],
      ["perf/23-rmdir-busy", "removed", `the empty perf${path.sep} could not be removed (EBUSY)`],
      ["fix/9-held", "kept", "a process holds the directory (rename refused: EPERM); stop it and run again"],
      ["fix/22-commits-late", "kept", "changed since it was classified: 1 commit not on origin/main; the tree is untouched"],
      ["fix/25-dirty-late", "kept", "changed since it was classified: uncommitted changes (1 file); the tree is untouched"],
      ["fix/14-grabbed", "failed", `git worktree remove deleted the tracked files and the .git link, then stopped (error: failed to delete '${R("impower.worktrees/fix/14-grabbed")}': Permission denied); 1.5 GB remain at ${R("impower.worktrees/fix/14-grabbed")}, which is no longer a worktree, so delete the directory by hand once nothing holds it; the branch fix/14-grabbed stays until then`],
      ["fix/15-branch-fails", "failed", "the directory is gone; git branch -D fix/15-branch-fails failed (error: could not delete 'fix/15-branch-fails'), so delete the branch by hand"],
      ["fix/24-size-throws", "failed", "the sizing walk failed; the directory is still there"],
      ...keptRows.map((b) => [b, "kept"]),
      [rel(R("impower.worktrees/fix/husk-old")), "kept", "(not a worktree)"],
    ]);
    assert.equal(r.status, 1, `exit code ${r.status} though a removal failed:\n${r.out}`);
    assert.match(r.out, /Removed 4 worktrees and their branches, freeing 5\.5 GB; 20 worktrees kept; 3 failed \(see the rows above for what is left\); 2 directories under the worktrees root are not a worktree \(409\.6 MB\)\. Free space now 26\.0 GB\./);
    assert.deepEqual(w.removed.sort(), ["docs/10-merged-gone", "fix/1-merged-gone", "fix/15-branch-fails", "fix/2-merged-kept-remote", "perf/23-rmdir-busy"]);
    assert.deepEqual(w.branchesDeleted.sort(), ["docs/10-merged-gone", "fix/1-merged-gone", "fix/2-merged-kept-remote", "perf/23-rmdir-busy"]);
    assert.ok(w.branches.has("fix/14-grabbed"), "the gutted tree's branch was deleted");
    assert.ok(w.branches.has("fix/15-branch-fails"));
    assert.ok(w.branches.has("fix/22-commits-late"), "a branch with a commit made after classification was deleted");
    assert.ok(w.branches.has("fix/25-dirty-late") && w.trees.some((t) => t.branch === "fix/25-dirty-late"), "a tree that turned dirty after classification was removed");
    assert.ok(w.disk.has(R("impower.worktrees/fix/9-held").toLowerCase()), "the held tree is gone");
    assert.ok(w.trees.some((t) => t.branch === "fix/9-held"), "the held tree's record is gone");
    assert.ok(w.disk.get(R("impower.worktrees/fix/14-grabbed").toLowerCase())?.gutted, "the gutted tree's husk is gone");
    assert.deepEqual(w.emptyDirsRemoved, ["docs"]);
    const probed = ["fix/1-merged-gone", "fix/2-merged-kept-remote", "docs/10-merged-gone", "fix/14-grabbed", "fix/15-branch-fails", "perf/23-rmdir-busy"].map((b) => R("impower.worktrees", b));
    assert.deepEqual(w.renames.filter(([f]) => !f.endsWith(".removing")).map(([f]) => f), probed, "every removal probed the directory by rename");
    assert.deepEqual(w.renames.filter(([f]) => f.endsWith(".removing")).map(([, t]) => t), probed, "every probe renamed the directory back");
    assert.ok(w.branches.has("main"));
  });

  await step("a second --apply lists the gutted tree's husk as a directory that is not a worktree, keeps the held tree again, and removes what it can now size", async () => {
    const r = await run(mainFn, w, MAIN, "--apply");
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      [rel(R("impower.worktrees/fix/14-grabbed")), "kept", "(not a worktree)", "1.5 GB", "not a registered worktree"],
      ["fix/9-held", "kept", "a process holds the directory"],
      ["fix/22-commits-late", "kept", "1 commit not on origin/main, and no origin/fix/22-commits-late holds them"],
      ["fix/25-dirty-late", "kept", "changed since it was classified: uncommitted changes (1 file)"],
      ["fix/24-size-throws", "removed"],
    ]);
    assert.match(r.out, /Removed 1 worktree and its branch, freeing 1\.0 GB; 20 worktrees kept; 3 directories under the worktrees root are not a worktree \(1\.9 GB\)\./);
  });
}

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
  await control("a branch that has not moved is not refused", [["else if (!facts.moved) keep.push(", "else if (false) keep.push("]], ["fix/6-fresh: expected keep, got remove"]);
  await control("a detached head is not refused", [['if (entry.detached) keep.push("detached head', 'if (false) keep.push("detached head']], ["(detached): expected keep, got remove"]);
  await control("an unborn branch is not refused", [['if (facts.unborn) keep.push("unborn branch', 'if (false) keep.push("unborn branch']], ["fix/18-unborn: expected keep, got remove"]);
  await control("a locked worktree is not refused", [["if (entry.locked) keep.push", "if (false) keep.push"]], ["fix/12-locked: expected keep, got remove"]);
  await control("the main checkout and a path outside the root are not refused", [["if (!facts.insideRoot) keep.push", "if (false) keep.push"]], ["main: expected keep, got remove", "fix/13-outside: expected keep, got remove"]);
  await control("the removal reaches outside the root", [["if (!facts.insideRoot) keep.push", "if (false) keep.push"], ["if (!isUnder(abs, ctx.root)) return kept(", "if (false) return kept("]], ["the script removed a path outside the root"]);
  await control("the dry run removes", [['const apply = argv.includes("--apply");', "const apply = true;"]], ["the dry run removed worktrees"]);
  await control("the run does not fetch first", [['gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);', ""]], ["it did not fetch with --prune first"]);
  await control("a held directory is not probed before git worktree remove", [["deps.rename(abs, probe);", ""]], ["fix/9-held: expected kept, got failed"]);
  await control("the branch is deleted without reading its commits again", [["if (own.status !== 0 || Number(own.out) > 0) return kept(", "if (false) return kept("]], ["fix/22-commits-late: expected kept, got removed"]);
  await control("a gutted tree is reported as still a worktree", [['else if (deps.exists(path.join(abs, ".git"))) {', "else if (true) {"]], ["row for fix/14-grabbed does not say"]);
  await control("a failed branch deletion is reported as removed", [["if (del.status !== 0) return failed(", "if (false) return failed("]], ["fix/15-branch-fails: expected failed, got removed"]);
  await control("a type directory that refuses to go stops the run", [[`    try {\n      deps.removeEmptyDir(parent);\n      notes.push(\`removed the empty \${rel}\`);\n    } catch (err) {\n      notes.push(\`the empty \${rel} could not be removed (\${err.code ?? err.message})\`);\n    }`, "    deps.removeEmptyDir(parent);\n    notes.push(`removed the empty ${rel}`);"]], ["perf/23-rmdir-busy: expected removed, got failed"]);
  await control("a row that throws loses the table", [[".catch(rowError(row))", ""]], ["the dry run classifies every worktree and removes nothing"]);
  await control("directories that are not worktrees are not listed", [["for (const p of strayDirs(entries, ctx.root, deps.listDirs)) {", "for (const p of []) {"]], ["no row for impower.worktrees"]);
  await control("a failed removal exits 0", [["return failed ? 1 : 0;", "return 0;"]], ["exit code 0 though a removal failed"]);
  await control("a tree that turned dirty after classification is removed", [["if (dirty > 0) return kept(", "if (false) return kept("]], ["fix/25-dirty-late: expected kept, got removed"]);
  await control("the older driver location is not looked at", [['".claude/skills/resolve-issue/driver.mjs"', '".claude/skills/resolve-issue/driver-elsewhere.mjs"']], ["fix/26-old-driver-up: expected keep, got remove"]);
  await control("a worktree git cannot answer for stops the run", [["      verdict = { remove: false, reasons: [`git could not judge it (${err.message}); left for a person`] };", "      throw err;"]], ["the dry run classifies every worktree and removes nothing"]);
  await control("a worktree git no longer sees, or whose directory is gone, is asked for its status", [["if (facts.isMain || entry.detached || entry.prunable || facts.missing || facts.unborn) return facts;", "if (facts.isMain || entry.detached || facts.unborn) return facts;"]], ["row for fix/19-broken does not say", "row for fix/20-missing does not say"]);
} finally {
  fs.rmSync(controls, { recursive: true, force: true });
}

// ------------------------------------------------------- real commands ---
//
// A scratch repository under the temp directory: a bare origin, a main
// checkout named `impower`, and worktrees that are merged and deleted on the
// remote, merged with a file left behind, fresh from origin/main, fresh from a
// merged tip, named by a running process, held by a process's current
// directory, and merged locally while the remote has a commit more. The
// script runs as a command, so this also pins its exit codes, its refusal
// from a worktree, and the process listing and rename probe on the real
// system.

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "clean-worktrees-"));
const mainRoot = path.join(scratch, "impower");
const root = path.join(scratch, "impower.worktrees");
const env = {
  ...process.env,
  GIT_AUTHOR_NAME: "check",
  GIT_AUTHOR_EMAIL: "check@example.invalid",
  GIT_COMMITTER_NAME: "check",
  GIT_COMMITTER_EMAIL: "check@example.invalid",
  GIT_CONFIG_COUNT: "2",
  GIT_CONFIG_KEY_0: "commit.gpgsign",
  GIT_CONFIG_VALUE_0: "false",
  GIT_CONFIG_KEY_1: "init.defaultBranch",
  GIT_CONFIG_VALUE_1: "main",
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
  fs.writeFileSync(path.join(mainRoot, ".gitignore"), ".env.local\n");
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
  await sleep(800);
  assert.deepEqual(branches(), ["fix/1-merged-gone", "fix/3-dirty", "fix/4-fresh", "fix/5-stacked", "fix/6-in-use", "fix/7-held", "fix/8-remote-ahead", "main"]);

  await check("as a command, run from a worktree it exits 1 naming the main checkout", () => {
    const r = cli(wt("fix/1-merged-gone"), "--apply");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /ERROR: run from the main checkout/);
    assert.ok(fs.existsSync(wt("fix/1-merged-gone")));
  });

  await check("as a command, the dry run on a real repository classifies and removes nothing", () => {
    const r = cli(mainRoot);
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["main", "keep", "the main checkout"],
      ["fix/1-merged-gone", "remove", "merged into origin/main; no origin/fix/1-merged-gone; takes 1 ignored path with it (.env.local)"],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
      ["fix/4-fresh", "keep", "the branch has not moved since it was created (no origin/fix/4-fresh); a fresh worktree a session may be working in"],
      ["fix/5-stacked", "keep", "the branch has not moved since it was created (no origin/fix/5-stacked); a fresh worktree a session may be working in"],
      ["fix/6-in-use", "keep", `in use by pid ${inUse.pid} (node`],
      ["fix/7-held", "remove", "merged into origin/main; no origin/fix/7-held"],
      ["fix/8-remote-ahead", "keep", "origin/fix/8-remote-ahead has 1 commit not on origin/main and this branch is behind it; a pull request may be open"],
    ]);
    assert.ok(fs.existsSync(wt("fix/1-merged-gone")), "the dry run removed a directory");
    assert.equal(worktreePaths(), 8);
  });

  await check("as a command, --apply removes the merged worktree and its branch, keeps the dirty one, and keeps a held tree untouched", () => {
    const r = cli(mainRoot, "--apply");
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["fix/1-merged-gone", "removed"],
      ["fix/3-dirty", "kept"],
      ["fix/5-stacked", "kept"],
      ["fix/6-in-use", "kept", "in use by pid"],
      ["fix/7-held", "kept", "a process holds the directory (rename refused: EPERM); stop it and run again"],
    ]);
    assert.match(r.out, /Removed 1 worktree and its branch/);
    assert.equal(fs.existsSync(wt("fix/1-merged-gone")), false, "fix/1-merged-gone is still on disk");
    assert.ok(fs.existsSync(path.join(wt("fix/3-dirty"), "scratch.sd")), "the dirty tree lost its file");
    assert.ok(fs.existsSync(path.join(wt("fix/7-held"), ".git")), "the held tree lost its .git link");
    assert.ok(fs.existsSync(path.join(wt("fix/7-held"), "fix-7-held.txt")), "the held tree lost a tracked file");
    assert.equal(git(wt("fix/7-held"), "status", "--porcelain"), "", "the held tree is no longer clean");
    assert.deepEqual(branches(), ["fix/3-dirty", "fix/4-fresh", "fix/5-stacked", "fix/6-in-use", "fix/7-held", "fix/8-remote-ahead", "main"]);
    assert.equal(worktreePaths(), 7);
  });

  await check("as a command, once the holder is gone the next --apply removes the tree it kept", async () => {
    await stopHolder(held);
    const r = cli(mainRoot, "--apply");
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [["fix/7-held", "removed"]]);
    assert.equal(fs.existsSync(wt("fix/7-held")), false, "fix/7-held is still on disk");
    assert.deepEqual(branches(), ["fix/3-dirty", "fix/4-fresh", "fix/5-stacked", "fix/6-in-use", "fix/8-remote-ahead", "main"]);
    assert.equal(worktreePaths(), 6);
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

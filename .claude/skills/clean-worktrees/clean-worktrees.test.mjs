#!/usr/bin/env node
// Pins the decisions behind clean-worktrees.mjs and the commands it runs.
// Run:
//   node .claude/skills/clean-worktrees/clean-worktrees.test.mjs
//
// classify and serversFrom take their inputs as parameters, so their tables
// are pinned here without a repository. The command as a whole is pinned by
// running `main` in-process against a stub of everything it asks the system:
// the stub answers each git and driver call from a table of worktrees in
// every state the script decides on, and records what the script removes.
// The dry run must remove nothing; `--apply` must remove the merged clean
// ones only, delete their branches and any type directory left empty, and
// leave every kept one in place. Controls run those same checks against
// copies of the script with one rule cut out, and require them to fail
// naming the worktree that rule protects. The real commands are pinned once,
// on a scratch repository with one removable and one dirty worktree, by
// running the script as a command. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(here, "clean-worktrees.mjs");
const { classify, serversFrom, parseWorktreeList, formatBytes, main } = await import(pathToFileURL(SCRIPT));

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
  dirty: 0,
  ownCommits: 0,
  unpushed: 0,
  remoteExists: false,
  onFirstParent: false,
  servers: { state: "down" },
  ...over,
});

await check("a clean merged branch whose remote is gone is removed", () => {
  const v = classify(entry(), facts());
  assert.equal(v.remove, true);
  assert.deepEqual(v.reasons, ["merged into origin/main; origin/fix/1-x is gone"]);
});

await check("a clean merged branch whose remote still exists is removed", () => {
  const v = classify(entry(), facts({ remoteExists: true }));
  assert.equal(v.remove, true);
  assert.deepEqual(v.reasons, ["merged into origin/main; origin/fix/1-x still exists"]);
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
  kept(entry(), facts({ ownCommits: 3, unpushed: 1, remoteExists: true }), "1 commit on neither origin/main nor origin/fix/1-x");
});

await check("commits all on the remote but not on origin/main are kept as an open pull request", () => {
  kept(entry(), facts({ ownCommits: 3, unpushed: 0, remoteExists: true }), "3 commits not on origin/main (all on origin/fix/1-x; a pull request may be open)");
});

await check("a detached head is kept and nothing else about it is judged", () => {
  const v = kept(entry({ branch: null, detached: true }), facts({ dirty: 9, servers: { state: "up", url: "u", pid: 1 } }), "detached head");
  assert.equal(v.reasons.length, 1);
});

await check("a worktree with dev servers up or launching is kept", () => {
  kept(entry(), facts({ servers: { state: "up", url: "http://localhost:40444", pid: 25992 } }), "dev servers up at http://localhost:40444 (pid 25992)");
  kept(entry(), facts({ servers: { state: "launching", url: "http://localhost:38200", pid: 31268 } }), "dev servers launching (pid 31268 alive");
  kept(entry(), facts({ servers: { state: "unknown", detail: "SyntaxError" } }), "its driver could not report its servers (SyntaxError)");
});

await check("a locked worktree, and one whose directory is gone, are kept", () => {
  kept(entry({ locked: "in use" }), facts(), "locked (in use)");
  kept(entry({ prunable: "gitdir file points to non-existent location" }), facts(), "its directory is gone (gitdir file points to non-existent location)");
  kept(entry(), facts({ missing: true }), "its directory is gone; `git worktree prune` drops the record");
});

await check("a branch with no commits of its own is kept as a fresh worktree, pushed or not", () => {
  kept(entry(), facts({ onFirstParent: true }), "no commits of its own, never pushed; a session may be working in it");
  kept(entry(), facts({ onFirstParent: true, remoteExists: true }), "no commits of its own (origin/fix/1-x exists); a session may be working in it");
});

await check("every reason that applies is listed", () => {
  const v = kept(entry(), facts({ dirty: 2, ownCommits: 1, unpushed: 1, servers: { state: "up", url: "u", pid: 7 } }), "uncommitted changes", "1 commit not on origin/main", "dev servers up");
  assert.equal(v.reasons.length, 3);
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

await check("formatBytes picks the unit", () => {
  assert.equal(formatBytes(0), "0 B");
  assert.equal(formatBytes(1536), "1.5 KB");
  assert.equal(formatBytes(1.1 * 1024 ** 3), "1.1 GB");
  assert.equal(formatBytes(null), "");
});

// ------------------------------------------------------------ stub world ---
//
// A main checkout at /repo/impower and worktrees in every state under
// /repo/impower.worktrees/, except the one under /repo/elsewhere/. The stub's
// `exec` answers each git command the script runs from that table and the
// driver `status` from the tree's `driver` line; its file-system calls read
// and change the table, so a removal shows up in the next command's answer.

const R = (...p) => path.resolve("/repo", ...p);
const MAIN = R("impower");
const ROOT = R("impower.worktrees");
const DRIVER = path.join(".claude", "skills", "drive-web-editor", "driver.mjs");
const LIVE_PID = 4242;
const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
const GB = 1024 ** 3;

function makeWorld() {
  const w = {
    cwd: MAIN,
    lines: [],
    firstParent: ["m3", "m2", "m1"],
    trees: [
      { path: R("impower.worktrees/fix/1-merged-gone"), head: "c1", branch: "fix/1-merged-gone", size: 1.1 * GB },
      { path: R("impower.worktrees/fix/2-merged-kept-remote"), head: "c2", branch: "fix/2-merged-kept-remote", remote: true, size: 0.9 * GB, dRefuses: true },
      { path: R("impower.worktrees/fix/3-dirty"), head: "c3", branch: "fix/3-dirty", dirty: ["?? scratch.sd"] },
      { path: R("impower.worktrees/fix/4-unpushed"), head: "c4", branch: "fix/4-unpushed", own: 1, unpushed: 1 },
      { path: R("impower.worktrees/fix/5-open"), head: "c5", branch: "fix/5-open", own: 1, unpushed: 0, remote: true },
      { path: R("impower.worktrees/fix/6-fresh"), head: "m3", branch: "fix/6-fresh" },
      { path: R("impower.worktrees/fix/7-servers-up"), head: "c7", branch: "fix/7-servers-up", driver: "UP  url=http://localhost:1  pid=1  mode=same-origin  state=s" },
      { path: R("impower.worktrees/fix/8-servers-launching"), head: "c8", branch: "fix/8-servers-launching", driver: `DOWN  url=http://localhost:2  pid=${LIVE_PID}  mode=same-origin  state=s` },
      { path: R("impower.worktrees/fix/9-held"), head: "c9", branch: "fix/9-held", size: 2 * GB, removeRefuses: true },
      { path: R("impower.worktrees/docs/10-merged-gone"), head: "c10", branch: "docs/10-merged-gone", size: 1 * GB },
      { path: R("impower.worktrees/detached-11"), head: "m2", detached: true },
      { path: R("impower.worktrees/fix/12-locked"), head: "c12", branch: "fix/12-locked", locked: "in use" },
      { path: R("elsewhere/fix-13-outside"), head: "c13", branch: "fix/13-outside" },
    ],
    branches: new Set(["main"]),
    removed: [],
    branchesDeleted: [],
    emptyDirsRemoved: [],
    outsideRemoved: [],
    pruned: 0,
    fetched: 0,
  };
  for (const t of w.trees) if (t.branch) w.branches.add(t.branch);
  const dRefuses = new Set(w.trees.filter((t) => t.dRefuses).map((t) => t.branch));
  const tree = (p) => w.trees.find((t) => same(t.path, p));
  const byBranch = (b) => w.trees.find((t) => t.branch === b);
  const drop = (t) => w.trees.splice(w.trees.indexOf(t), 1);
  const ok = (out = "") => ({ status: 0, out, err: "" });
  const fail = (err) => ({ status: 1, out: "", err });
  const porcelain = () => {
    const stanza = (t) => [`worktree ${t.path.replaceAll("\\", "/")}`, `HEAD ${t.head}`, t.detached ? "detached" : `branch refs/heads/${t.branch}`, t.locked ? `locked ${t.locked}` : null, t.prunable ? `prunable ${t.prunable}` : null, ""].filter((l) => l != null).join("\n");
    return [stanza({ path: MAIN, head: "m3", branch: "main" }), ...w.trees.map(stanza)].join("\n");
  };
  w.deps = {
    cwd: () => w.cwd,
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
      if (a === "rev-list --first-parent refs/remotes/origin/main") return ok(w.firstParent.join("\n"));
      if (a === "status --porcelain") return ok((tree(cwd)?.dirty ?? []).join("\n"));
      if ((m = /^rev-parse --verify -q refs\/remotes\/origin\/(.+)$/.exec(a))) return byBranch(m[1])?.remote ? ok("abcd") : fail("");
      if ((m = /^rev-list --count refs\/heads\/(.+?) \^refs\/remotes\/origin\/main( \^refs\/remotes\/origin\/(.+))?$/.exec(a))) {
        const t = byBranch(m[1]);
        return ok(String((m[2] ? t.unpushed : t.own) ?? 0));
      }
      if ((m = /^worktree remove (.+)$/.exec(a))) {
        const t = tree(m[1]);
        if (!t) return fail(`'${m[1]}' is not a working tree`);
        if (t.removeRefuses) return fail("Directory not empty");
        drop(t);
        w.removed.push(t.branch);
        return ok();
      }
      if ((m = /^branch -(d|D) (.+)$/.exec(a))) {
        if (m[1] === "d" && dRefuses.has(m[2])) return fail(`the branch '${m[2]}' is not fully merged`);
        w.branches.delete(m[2]);
        w.branchesDeleted.push(`-${m[1]} ${m[2]}`);
        return ok();
      }
      if (a === "worktree prune") return w.pruned++, ok();
      throw new Error(`unexpected command git ${a} in ${cwd}`);
    },
    exists: (p) => same(p, MAIN) || w.trees.some((t) => same(t.path, p) || (t.driver && same(path.join(t.path, DRIVER), p))),
    // A type directory is empty once no tree is left under it; `docs/` is the
    // one that empties here.
    isEmptyDir: (p) => same(path.dirname(p), ROOT) && !w.trees.some((t) => same(path.dirname(t.path), p)),
    removeDir: (p) => {
      const t = tree(p);
      if (!t || !same(path.dirname(path.dirname(t.path)), ROOT)) w.outsideRemoved.push(p);
      if (t) {
        drop(t);
        w.removed.push(t.branch);
      }
    },
    removeEmptyDir: (p) => w.emptyDirsRemoved.push(path.relative(ROOT, p)),
    dirSize: async (p) => tree(p)?.size ?? 0,
    freeSpace: () => 26 * GB,
    pidAlive: (pid) => pid === LIVE_PID,
    log: (...a) => w.lines.push(a.join(" ")),
  };
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
// column reads (detached).
const decision = (out, branch) => {
  const row = out.split(/\r?\n/).find((l) => l.includes(`  ${branch}  `));
  assert.ok(row, `no row for ${branch} in:\n${out}`);
  return { word: row.split(/\s+/)[0], row };
};
const rowProblem = (out, branch, word, ...phrases) => {
  try {
    const d = decision(out, branch);
    if (d.word !== word) return `${branch}: expected ${word}, got ${d.word}: ${d.row}`;
    for (const p of phrases) if (!d.row.includes(p)) return `row for ${branch} does not say '${p}':\n${d.row}`;
    return null;
  } catch (err) {
    return err.message;
  }
};
const expectRows = (out, rows) => {
  const problems = rows.map((r) => rowProblem(out, ...r)).filter(Boolean);
  assert.equal(problems.length, 0, problems.join("\n"));
};

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

  await step("an unknown option is refused", async () => {
    const r = await run(mainFn, w, MAIN, "--all");
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /unknown option --all/);
    assert.equal(w.fetched, 0, "it fetched before refusing");
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
    assert.equal(r.status, 0, r.out);
    assert.equal(w.fetched, 1, "it did not fetch with --prune first");
    assert.deepEqual(w.removed, [], "the dry run removed worktrees");
    assert.deepEqual(w.branchesDeleted, [], "the dry run deleted branches");
    assert.equal(w.trees.length, all.length, "the dry run removed a directory");
    expectRows(r.out, [
      ["main", "keep", "the main checkout"],
      ["fix/1-merged-gone", "remove", "1.1 GB", "merged into origin/main; origin/fix/1-merged-gone is gone"],
      ["fix/2-merged-kept-remote", "remove", "origin/fix/2-merged-kept-remote still exists"],
      ["fix/9-held", "remove", "merged into origin/main"],
      ["docs/10-merged-gone", "remove", "merged into origin/main"],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
      ["fix/4-unpushed", "keep", "1 commit not on origin/main, and no origin/fix/4-unpushed holds them"],
      ["fix/5-open", "keep", "1 commit not on origin/main (all on origin/fix/5-open; a pull request may be open)"],
      ["fix/6-fresh", "keep", "no commits of its own, never pushed; a session may be working in it"],
      ["fix/7-servers-up", "keep", "dev servers up at http://localhost:1 (pid 1)"],
      ["fix/8-servers-launching", "keep", `dev servers launching (pid ${LIVE_PID} alive`],
      ["(detached)", "keep", "detached head"],
      ["fix/12-locked", "keep", "locked (in use)"],
      ["fix/13-outside", "keep", `outside ${ROOT}`],
    ]);
    assert.match(r.out, /13 worktrees besides the main checkout: 4 to remove \(5\.0 GB\), 9 kept\./);
    assert.match(r.out, /Dry run; nothing was removed\. Run again with --apply to remove the 4\./);
  });

  await step("--apply removes the four, their branches and the emptied type directory, and keeps the rest", async () => {
    const r = await run(mainFn, w, MAIN, "--apply");
    assert.deepEqual(w.outsideRemoved, [], "the script removed a path outside the root");
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["fix/1-merged-gone", "removed"],
      ["fix/2-merged-kept-remote", "removed", "branch deleted with -D"],
      ["fix/9-held", "removed", "directory removed directly after git worktree remove refused"],
      ["docs/10-merged-gone", "removed", `removed the empty docs${path.sep}`],
      ...["fix/3-dirty", "fix/4-unpushed", "fix/5-open", "fix/6-fresh", "fix/7-servers-up", "fix/8-servers-launching", "fix/12-locked", "fix/13-outside", "(detached)", "main"].map((b) => [b, "kept"]),
    ]);
    assert.match(r.out, /Removed 4 worktrees and their branches, freeing 5\.0 GB; 9 kept\. Free space now 26\.0 GB\./);
    assert.deepEqual(w.removed.sort(), ["docs/10-merged-gone", "fix/1-merged-gone", "fix/2-merged-kept-remote", "fix/9-held"]);
    assert.deepEqual(w.branchesDeleted.sort(), ["-D fix/2-merged-kept-remote", "-d docs/10-merged-gone", "-d fix/1-merged-gone", "-d fix/9-held"]);
    assert.deepEqual(w.emptyDirsRemoved, ["docs"]);
    assert.equal(w.pruned, 2, "one prune after the held tree's direct removal and one at the end");
    assert.equal(w.trees.length, all.length - 4);
    assert.ok(w.branches.has("main"));
  });

  await step("a second --apply finds nothing left to remove", async () => {
    const r = await run(mainFn, w, MAIN, "--apply");
    assert.equal(r.status, 0, r.out);
    assert.match(r.out, /Removed 0 worktrees and their branches, freeing 0 B; 9 kept\./);
    assert.equal(w.trees.length, all.length - 4);
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
  await control("unpushed commits are not refused", [["if (facts.ownCommits > 0) {", "if (false) {"]], ["fix/4-unpushed: expected keep, got remove", "fix/5-open: expected keep, got remove"]);
  await control("servers up are not refused", [['if (s.state === "up")', "if (false)"]], ["fix/7-servers-up: expected keep, got remove"]);
  await control("servers launching are not refused", [['else if (s.state === "launching")', "else if (false)"]], ["fix/8-servers-launching: expected keep, got remove"]);
  await control("a fresh worktree is not refused", [["} else if (facts.onFirstParent) {", "} else if (false) {"]], ["fix/6-fresh: expected keep, got remove"]);
  await control("a detached head is not refused", [['if (entry.detached) keep.push("detached head', 'if (false) keep.push("detached head']], ["(detached): expected keep, got remove"]);
  await control("a locked worktree is not refused", [["if (entry.locked) keep.push", "if (false) keep.push"]], ["fix/12-locked: expected keep, got remove"]);
  await control("the main checkout and a path outside the root are not refused", [["if (!facts.insideRoot) keep.push", "if (false) keep.push"]], ["main: expected keep, got remove", "fix/13-outside: expected keep, got remove"]);
  await control("the direct removal reaches outside the root", [["if (!facts.insideRoot) keep.push", "if (false) keep.push"], ["if (!isUnder(abs, ctx.root)) return { ok: false", "if (false) return { ok: false"]], ["the script removed a path outside the root"]);
  await control("the dry run removes", [['const apply = argv.includes("--apply");', "const apply = true;"]], ["the dry run removed worktrees"]);
  await control("the run does not fetch first", [['gitOrDie(deps, ["fetch", "--prune", "origin"], mainRoot);', ""]], ["it did not fetch with --prune first"]);
} finally {
  fs.rmSync(controls, { recursive: true, force: true });
}

// ------------------------------------------------------- real commands ---
//
// A scratch repository under the temp directory: a bare origin, a main
// checkout named `impower`, one worktree merged and deleted on the remote,
// and one merged with a file left behind. The script runs as a command, so
// this also pins its exit codes and its refusal from a worktree.

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
const mergedWorktree = (branch, deleteRemote) => {
  git(mainRoot, "worktree", "add", "-q", "-b", branch, wt(branch), "origin/main");
  fs.writeFileSync(path.join(wt(branch), `${branch.replace("/", "-")}.txt`), `${branch}\n`);
  git(wt(branch), "add", "-A");
  git(wt(branch), "commit", "-q", "-m", branch);
  git(wt(branch), "push", "-q", "-u", "origin", branch);
  git(mainRoot, "merge", "--no-ff", "-q", "-m", `Merge ${branch}`, branch);
  git(mainRoot, "push", "-q", "origin", "main");
  if (deleteRemote) git(mainRoot, "push", "-q", "origin", "--delete", branch);
};
const branches = () => git(mainRoot, "for-each-ref", "--format=%(refname:short)", "refs/heads/").split(/\r?\n/).filter(Boolean).sort();

try {
  git(scratch, "init", "-q", "--bare", "origin.git");
  git(scratch, "init", "-q", "impower");
  git(mainRoot, "remote", "add", "origin", path.join(scratch, "origin.git"));
  fs.writeFileSync(path.join(mainRoot, "README.md"), "scratch\n");
  git(mainRoot, "add", "-A");
  git(mainRoot, "commit", "-q", "-m", "initial");
  git(mainRoot, "push", "-q", "-u", "origin", "main");
  mergedWorktree("fix/1-merged-gone", true);
  mergedWorktree("fix/3-dirty", true);
  fs.writeFileSync(path.join(wt("fix/3-dirty"), "scratch.sd"), "left behind\n");
  assert.deepEqual(branches(), ["fix/1-merged-gone", "fix/3-dirty", "main"]);

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
      ["fix/1-merged-gone", "remove", "merged into origin/main; origin/fix/1-merged-gone is gone"],
      ["fix/3-dirty", "keep", "uncommitted changes (1 file)"],
    ]);
    assert.ok(fs.existsSync(wt("fix/1-merged-gone")), "the dry run removed a directory");
    assert.deepEqual(branches(), ["fix/1-merged-gone", "fix/3-dirty", "main"]);
  });

  await check("as a command, --apply removes the merged worktree and its branch and keeps the dirty one", () => {
    const r = cli(mainRoot, "--apply");
    assert.equal(r.status, 0, r.out);
    expectRows(r.out, [
      ["fix/1-merged-gone", "removed"],
      ["fix/3-dirty", "kept"],
    ]);
    assert.match(r.out, /Removed 1 worktree/);
    assert.equal(fs.existsSync(wt("fix/1-merged-gone")), false, "fix/1-merged-gone is still on disk");
    assert.ok(fs.existsSync(path.join(wt("fix/3-dirty"), "scratch.sd")), "the dirty tree lost its file");
    assert.deepEqual(branches(), ["fix/3-dirty", "main"]);
    assert.equal(git(mainRoot, "worktree", "list", "--porcelain").split(/\r?\n/).filter((l) => l.startsWith("worktree ")).length, 2);
  });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

if (failures) {
  console.log(`${failures} failing`);
  process.exit(1);
}
console.log("all passing");

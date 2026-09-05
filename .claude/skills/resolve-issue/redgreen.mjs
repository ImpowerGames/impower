// The "prove the regression test is honest" cycle from §5b of the skill, in
// one process.
//
// A regression test that passes against the pre-fix source pins nothing, so
// the skill requires seeing it fail on the old code and pass on the new. Doing
// that by hand means copying the changed files aside, reverting them, running
// the test, and copying them back, and nothing ties the copy to the revert: a
// review round changes a file between cycles, the aside copy goes stale, and
// the next restore silently reinstates an older version of the session's own
// fix. This module takes the snapshot and performs the restore inside the same
// call, restores in a `finally` so an error or an interrupted test run cannot
// leave the tree reverted, and proves the restore by content hash read back
// from disk rather than by `git diff` listing the file as modified (which a
// stale restore does too).
//
// What `ok: true` means, exactly: every named file differs from the base, the
// base revision resolves, the test exited non-zero on the base for a reason the
// classifier recognises as a test failure, every file came back byte-for-byte,
// and the test exited zero on the fix. It is an exit-code proof. Which test in
// the file failed is in `red.tail`, and reading it is the session's job.
//
// Once the snapshot is taken this function does not throw: every later error
// becomes a `problems` entry, so the report — the snapshot directory and the
// per-file restore state above all — always reaches the caller.
//
// Nothing here touches `git stash`: the stash is per repository, not per
// worktree, and this checkout runs many worktrees at once.
//
// Pure Node. No browser, no network. `driver.mjs redgreen` is the command
// front; `redgreen.test.mjs` beside this file drives `runRedGreen` on a
// throwaway repository.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** Repo-relative POSIX path, which is what `git cat-file` wants on every OS. */
export function gitPath(repoRoot, file) {
  return path.relative(repoRoot, path.resolve(repoRoot, file)).split(path.sep).join("/");
}

function git(repoRoot, args) {
  const r = spawnSync("git", args, { cwd: repoRoot, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

/**
 * The repository's top-level directory as git sees it from `repoRoot`.
 * `git cat-file rev:path` resolves `path` from here, not from the working
 * directory, so a `repoRoot` that is a subdirectory would silently read the
 * wrong file (or none) and revert the tree to it.
 */
export function gitTopLevel(repoRoot) {
  const r = git(repoRoot, ["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) throw new Error(`redgreen: ${repoRoot} is not inside a git repository: ${String(r.stderr).trim()}`);
  return String(r.stdout).trim();
}

/** Same directory after resolving links, case and trailing separators. */
export function sameDir(a, b) {
  const norm = (p) => {
    let r = path.resolve(p);
    try {
      r = fs.realpathSync.native(r);
    } catch {
      /* keep the unresolved path */
    }
    return r.replace(/[\\/]+$/, "").toLowerCase();
  };
  return norm(a) === norm(b);
}

/** Throws when `base` does not name a commit, so a typo cannot read as "absent at base". */
export function resolveBase(repoRoot, base) {
  const r = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (r.status !== 0) {
    throw new Error(
      `redgreen: --base "${base}" does not resolve to a commit in this repository (git: ${String(r.stderr).trim() || "no such revision"}). Check the spelling, and fetch first if it is a remote branch.`,
    );
  }
  return String(r.stdout).trim();
}

/**
 * The file's bytes at `base` (already verified to be a commit), or null when
 * the file does not exist there. Spawning git directly sidesteps the Git Bash
 * path rewrite that turns `origin/main:some/path` into a Windows path (the
 * skill's `MSYS_NO_PATHCONV` gotcha); no shell is involved.
 */
export function baseContent(repoRoot, base, file) {
  const spec = `${base}:${gitPath(repoRoot, file)}`;
  const r = git(repoRoot, ["cat-file", "-p", spec]);
  if (r.status === 0) return r.stdout;
  const msg = String(r.stderr || "");
  if (/path .* does not exist in|exists on disk, but not in|invalid object name '[^']*:|Not a valid object name/i.test(msg)) {
    return null;
  }
  throw new Error(`git cat-file ${spec} failed: ${msg.trim()}`);
}

/**
 * The shell the test command runs in. On Windows, Node's `shell: true` means
 * cmd.exe, where `NODE_OPTIONS=... npx vitest ...` (the form every example in
 * the skill uses) fails with "'NODE_OPTIONS' is not recognized". Git Bash is
 * on every machine this skill runs on, so prefer it when it can be found.
 */
export function testShell() {
  if (process.platform !== "win32") return true;
  const where = (name) => {
    const r = spawnSync("where", [name], { encoding: "utf8", windowsHide: true });
    return r.status === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  };
  // Git's own bash, found next to git.exe, before any other: the bash.exe in
  // System32 is the WSL launcher and runs nothing without a distribution.
  for (const g of where("git")) {
    const candidate = path.join(path.dirname(g), "..", "bin", "bash.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  const bash = where("bash").find((p) => !/\\System32\\/i.test(p));
  return bash ?? true;
}

export function runTest(cmd, cwd, shell = testShell()) {
  const r = spawnSync(cmd, {
    cwd,
    shell,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    env: process.env,
  });
  const output = `${r.stdout || ""}${r.stderr || ""}`;
  const lines = output.split(/\r?\n/).filter((l) => l.trim() !== "");
  return {
    exit: r.status == null ? -1 : r.status,
    tail: lines.slice(-40),
    output,
  };
}

/**
 * Why a red run failed. Only `assertion` is accepted as proof of the defect:
 * a test that died on a missing import, that could not be found, that the
 * shell could not start, or whose runner crashed says nothing about the
 * ticket's behaviour, and an output the classifier cannot place needs a human
 * to read it.
 *
 * The shell patterns are anchored to how a shell reports its own failure
 * (`bash: x: command not found`, cmd.exe's "is not recognized", Node failing
 * to find the entry script it was given — `requireStack: []`), so a test whose
 * assertion merely quotes an ENOENT is not mistaken for one. The assertion
 * patterns are word-bounded: `/toBe/i` on its own matches "October".
 */
export function classifyRedFailure(output, { removed = [] } = {}) {
  // Node could not find the script it was handed: every "Cannot find module"
  // block carries an empty requireStack, no block names an ESM import ("…
  // imported from …" carries no requireStack at all), and the missing path is
  // not one the revert removed. One import break anywhere, or a missing file
  // that the fix adds (the test spawns it, so it is the child's own entry
  // script), is the §5b case, not a shell one.
  const moduleBlocks = [...output.matchAll(/Cannot find module '([^']+)'[^{}]*\{[^{}]*requireStack: \[([^\]]*)\]/g)];
  const esmImportBreak = /Cannot find module '[^']+' imported from /.test(output);
  // A path boundary is required: `a.mjs` must not match `schema.mjs`.
  const namesRemovedFile = (p) => {
    const q = p.replace(/\\/g, "/");
    return removed.some((r) => {
      const s = r && r.replace(/\\/g, "/");
      return s && (q === s || q.endsWith("/" + s));
    });
  };
  const missingEntryScript =
    moduleBlocks.length > 0 && !esmImportBreak && moduleBlocks.every((m) => m[2].trim() === "" && !namesRemovedFile(m[1]));
  if (
    /^(?:bash|sh|zsh|\/bin\/sh|\/usr\/bin\/bash)(?:: line \d+)?: .*: (?:command not found|No such file or directory)/im.test(output) ||
    /is not recognized as an internal or external command/i.test(output) ||
    /npm ERR! Missing script:|npm error Missing script:/i.test(output) ||
    missingEntryScript
  ) {
    return "shell";
  }
  if (/No test files found|No test suite found|no tests found/i.test(output)) {
    return "notests";
  }
  if (
    /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package|Failed to resolve import|Failed to load url|does not provide an export named|has no exported member/i.test(
      output,
    )
  ) {
    return "import";
  }
  if (/\bSyntaxError\b|Unexpected token|\bTS\d{4}:/i.test(output)) {
    return "syntax";
  }
  // Anchored to how a runner reports its own death, at the start of a line:
  // a test name or an assertion diff can carry any of these words mid-line.
  if (/^\s*(?:Error: )?Worker exited unexpectedly|^\s*FATAL ERROR: |^\s*Segmentation fault|^\s*Killed\s*$/im.test(output)) {
    return "crash";
  }
  if (
    /\bAssertionError\b|\bexpected\b.*\bto\b|\.to(?:Be|Equal|StrictEqual|Match|Contain|Throw|HaveLength|HaveProperty)\w*\(|\bexpect\(|✗|×|\bFAIL\b|Tests\s+\d+ failed|\d+ failing\b|\bnot ok \d|assert\.\w+\(|Assertion failed/i.test(
      output,
    )
  ) {
    return "assertion";
  }
  return "unknown";
}

/**
 * Snapshot → revert to base → run (must fail) → restore → hash-check → run
 * (must pass). Returns the report; `report.ok` is the verdict, and it is false
 * whenever `problems` is non-empty. Throws only for a malformed request or a
 * git error, and only before the snapshot has been taken; after that every
 * error becomes a problem in the report.
 */
export function runRedGreen({ repoRoot, test, files, base = "HEAD", snapshotDir, log = () => {} }) {
  if (!test) throw new Error("redgreen: --test <command> is required");
  if (!files || files.length === 0) throw new Error("redgreen: --files <path...> is required");
  if (!repoRoot) throw new Error("redgreen: repoRoot is required");

  const top = gitTopLevel(repoRoot);
  if (!sameDir(top, repoRoot)) {
    throw new Error(`redgreen: run from the repository root (${top}), not from ${repoRoot}; git resolves rev:path from the root.`);
  }
  const baseCommit = resolveBase(repoRoot, base);

  const dir = snapshotDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "redgreen-"));
  const report = {
    ok: false,
    base,
    baseCommit,
    test,
    snapshotDir: dir,
    files: [],
    red: null,
    green: null,
    problems: [],
  };

  // 1. Snapshot the working tree. This is the fix, and it is taken here, in
  //    the same process that will restore it, so it cannot go stale. Every
  //    check that can refuse the request runs before the first write.
  const entries = [];
  const seen = new Set();
  for (const file of files) {
    const abs = path.resolve(repoRoot, file);
    if (seen.has(abs)) continue;
    seen.add(abs);
    if (!fs.existsSync(abs)) throw new Error(`redgreen: ${file} does not exist in the working tree`);
    if (!fs.statSync(abs).isFile()) throw new Error(`redgreen: ${file} is not a file`);
    const rel = gitPath(repoRoot, file);
    if (rel.startsWith("..")) throw new Error(`redgreen: ${file} is outside the repository`);
    const bytes = fs.readFileSync(abs);
    // Numbered so two paths that flatten to the same name cannot collide.
    const snapshotPath = path.join(dir, `${String(entries.length + 1).padStart(2, "0")}-${path.basename(rel)}`);
    fs.writeFileSync(snapshotPath, bytes);
    const baseBytes = baseContent(repoRoot, baseCommit, file);
    const entry = {
      path: rel,
      abs,
      snapshotPath,
      snapshotSha: sha256(bytes),
      baseSha: baseBytes == null ? null : sha256(baseBytes),
      bytes,
      baseBytes,
      reverted: false,
      changedDuringRed: false,
      restored: false,
      matches: false,
      restoreError: null,
    };
    if (entry.baseSha === entry.snapshotSha) {
      report.problems.push(
        `${entry.path} is identical to ${base}; there is nothing to revert, so the red run does not exercise a change in this file. If the fix is committed, pass --base origin/main; otherwise this file is not where the fix lives.`,
      );
    }
    entries.push(entry);
  }
  log(`snapshot ${entries.length} file(s) → ${dir}`);

  const shaOnDisk = (abs) => (fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : null);

  // The restore, written once and reached from every exit below. Each entry
  // is handled on its own so one file that cannot be read or written cannot
  // stop the others coming back. A file that changed while reverted is never
  // overwritten (see step 4); a file the revert never reached is the fix
  // already and is only checked.
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const e of entries) {
      try {
        if (e.reverted) {
          const nowSha = shaOnDisk(e.abs);
          if (nowSha == null && e.baseSha != null) {
            // Deleted while reverted. Nothing of anyone's is in the file to
            // lose, so it is recreated from the snapshot and noted.
            report.problems.push(
              `${e.path} was deleted while it was reverted (by the test run or something alongside it). Recreated from the snapshot; check that whatever deleted it was not meant to.`,
            );
          } else if (nowSha !== e.baseSha) {
            e.changedDuringRed = true;
            report.problems.push(
              `${e.path} changed while it was reverted (expected the ${base} content, found something else). Not restored, so that edit is not lost: the file now holds the ${base} content plus the edit, and the snapshot of the fix is at ${e.snapshotPath}. Merge the two by hand, then run redgreen again.`,
            );
            continue;
          }
          try {
            fs.mkdirSync(path.dirname(e.abs), { recursive: true });
            fs.writeFileSync(e.abs, e.bytes);
            e.restored = true;
          } catch (err) {
            e.restoreError = String(err.message || err);
          }
        } else {
          e.restored = true;
        }
        // Proven from disk, not from the buffer just written.
        e.matches = shaOnDisk(e.abs) === e.snapshotSha;
        log(`restore ${e.path}  ${e.matches ? "matches snapshot" : "HASH MISMATCH"}`);
        if (!e.matches) {
          e.restored = false;
          report.problems.push(
            `${e.path} does not match its snapshot after restore${e.restoreError ? ` (${e.restoreError})` : ""}. The fix is at ${e.snapshotPath}; put it back by hand and check the file before trusting the tree.`,
          );
        }
      } catch (err) {
        e.restored = false;
        e.matches = false;
        e.restoreError = String(err.message || err);
        report.problems.push(
          `${e.path} could not be checked or restored (${e.restoreError}). The fix is at ${e.snapshotPath}; put it back by hand and check the file before trusting the tree.`,
        );
      }
    }
  };
  // The test child runs under spawnSync, so a Ctrl+C reaches the child first,
  // spawnSync returns, and the `finally` below restores before any handler can
  // run. These handlers cover a signal that arrives outside the test run; a
  // hard kill (TerminateProcess) runs neither, which is why the snapshot
  // directory is logged before the first revert.
  const onSignal = (sig) => {
    console.error(`redgreen: ${sig} received while the tree was reverted; restoring from ${dir}`);
    try {
      restore();
    } finally {
      process.exit(130);
    }
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    // 2. Revert to base. A file that cannot be reverted is a problem, and the
    //    red run is not attempted on a half-reverted tree.
    let revertFailed = false;
    for (const e of entries) {
      try {
        if (e.baseBytes == null) {
          log(`revert  ${e.path}  (absent at ${base}; removing)`);
          fs.rmSync(e.abs, { force: true });
        } else {
          log(`revert  ${e.path}  → ${base}`);
          fs.writeFileSync(e.abs, e.baseBytes);
        }
        e.reverted = true;
      } catch (err) {
        revertFailed = true;
        report.problems.push(`${e.path} could not be reverted to ${base} (${String(err.message || err)}). The red run was not attempted.`);
        break;
      }
    }

    if (!revertFailed) {
      // 3. Red run.
      log(`red     ${test}`);
      const red = runTest(test, repoRoot);
      const removed = entries.filter((e) => e.baseBytes == null).map((e) => e.path);
      const redReason = red.exit === 0 ? null : classifyRedFailure(red.output, { removed });
      report.red = {
        exit: red.exit,
        outcome: red.exit === 0 ? "passed" : "failed",
        reason: redReason,
        tail: red.tail,
      };
      if (red.exit === 0) {
        report.problems.push(
          `The test passed against ${base}. It pins nothing: either it does not assert the ticket's behaviour, or the files listed are not where the fix lives.`,
        );
      } else if (redReason === "shell") {
        report.problems.push(
          `The test command itself could not run (the shell reported a missing command, script, or path), so the red run says nothing about the defect. Fix the --test invocation and run again.`,
        );
      } else if (redReason === "notests") {
        report.problems.push(
          `The runner found no test to run on the base (usually because --files names the test file itself, so the revert removed it). List only the source files the fix changed; the test file stays in place.`,
        );
      } else if (redReason === "import" || redReason === "syntax") {
        report.problems.push(
          `The red run failed on a ${redReason} error, not on the defect. A whole-file revert broke the test's imports; simulate the old behaviour in place instead (§5b) and keep a positive control in the file.`,
        );
      } else if (redReason === "crash") {
        report.problems.push(
          `The runner crashed on the base (a killed worker, an out-of-memory, a fatal error), which proves nothing about the defect. Lower the caps or split the run, then run again.`,
        );
      } else if (redReason === "unknown") {
        report.problems.push(
          red.output.trim() === ""
            ? `The test exited ${red.exit} on the base with no output at all, so there is nothing to show the failure was the ticket's. Use a test invocation that prints its assertion.`
            : `The test exited ${red.exit} on the base, but the output does not look like a test assertion (no AssertionError, expected/to, expect(), FAIL, "not ok", or failing count). Read red.tail yourself: if it is the ticket's assertion in a form the classifier does not know, say so in the PR; if it is a config error or a truncated run, it proves nothing.`,
        );
      }
    }
  } catch (err) {
    report.problems.push(`redgreen stopped early: ${String(err.message || err)}. The tree was restored as far as the report below says.`);
  } finally {
    // 4 + 5. Check nothing wrote to the reverted files, restore, hash-check.
    //    The snapshot is the fix as it was at the start of this call; a file
    //    that changed during the red run holds work the snapshot lacks, and
    //    overwriting it is exactly the stale-restore failure this exists to
    //    prevent.
    try {
      restore();
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
  }

  const treeIntact = entries.every((e) => e.restored && e.matches);

  // 6. Green run, only on a tree that is provably the fix again, and only when
  //    the red run happened.
  if (treeIntact && report.red) {
    try {
      log(`green   ${test}`);
      const green = runTest(test, repoRoot);
      report.green = {
        exit: green.exit,
        outcome: green.exit === 0 ? "passed" : "failed",
        tail: green.tail,
      };
      if (green.exit !== 0) {
        report.problems.push("The test failed against the fix. The restore is verified by hash, so this is the fix itself, not a stale copy.");
      }
    } catch (err) {
      report.green = { skipped: true, reason: `the green run could not start: ${String(err.message || err)}` };
      report.problems.push(`The green run could not start (${String(err.message || err)}). The tree is the fix again; run the test by hand.`);
    }
  } else {
    report.green = { skipped: true, reason: treeIntact ? "the red run did not happen; see problems" : "the tree was not fully restored; see problems" };
  }

  report.files = entries.map(({ bytes, baseBytes, abs, ...rest }) => rest);
  report.ok =
    report.problems.length === 0 &&
    report.red?.outcome === "failed" &&
    report.red?.reason === "assertion" &&
    treeIntact &&
    report.green?.outcome === "passed";
  return report;
}

/** Parse `redgreen --test <cmd> --files <a> [<b>...] [--base <rev>]`. Every flag needs a value. */
export function parseRedGreenArgs(args) {
  const opts = { test: undefined, files: [], base: "HEAD" };
  const value = (flag, i) => {
    const v = args[i + 1];
    if (v == null || v === "" || v.startsWith("--")) throw new Error(`redgreen: ${flag} needs a value`);
    return v;
  };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--test") {
      opts.test = value(a, i++);
    } else if (a === "--base") {
      opts.base = value(a, i++);
    } else if (a === "--files") {
      value(a, i);
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) {
        const f = args[++i];
        if (f !== "") opts.files.push(f);
      }
    } else {
      throw new Error(`redgreen: unknown argument ${a}`);
    }
  }
  if (!opts.test) throw new Error("redgreen: --test <command> is required");
  if (opts.files.length === 0) throw new Error("redgreen: --files <path...> is required");
  return opts;
}

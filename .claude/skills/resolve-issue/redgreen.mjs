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
// call, and proves the restore by content hash rather than by `git diff`
// listing the file as modified (which a stale restore does too).
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

/**
 * The file's bytes at `base`, or null when the file does not exist there.
 * Spawning git directly sidesteps the Git Bash path rewrite that turns
 * `origin/main:some/path` into a Windows path (the skill's `MSYS_NO_PATHCONV`
 * gotcha); no shell is involved.
 */
export function baseContent(repoRoot, base, file) {
  const r = spawnSync("git", ["cat-file", "-p", `${base}:${gitPath(repoRoot, file)}`], {
    cwd: repoRoot,
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.error) throw r.error;
  if (r.status !== 0) {
    const msg = String(r.stderr || "");
    if (/does not exist|exists on disk, but not in|invalid object name|Not a valid object name/i.test(msg)) {
      return null;
    }
    throw new Error(`git cat-file ${base}:${gitPath(repoRoot, file)} failed: ${msg.trim()}`);
  }
  return r.stdout;
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
  for (const git of where("git")) {
    const candidate = path.join(path.dirname(git), "..", "bin", "bash.exe");
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
 * Why a red run failed. A test that dies on a missing import proves nothing
 * about the defect, so the skill sends that case to its simulate-in-place path
 * instead of accepting the red.
 */
export function classifyRedFailure(output) {
  if (
    /is not recognized as an internal or external command|command not found|No such file or directory|The system cannot find the path specified|not found: /i.test(
      output,
    )
  ) {
    return "shell";
  }
  if (
    /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package|Failed to resolve import|Failed to load url|is not exported|does not provide an export named|has no exported member/i.test(
      output,
    )
  ) {
    return "import";
  }
  if (/SyntaxError|Unexpected token|TS\d{4}:/i.test(output)) {
    return "syntax";
  }
  if (/AssertionError|expected|toBe|toEqual|✗|×|FAIL|AssertionError|failed/i.test(output)) {
    return "assertion";
  }
  return "unknown";
}

/**
 * Snapshot → revert to base → run (must fail) → restore → hash-check → run
 * (must pass). Returns the report; `report.ok` is the verdict. Never throws
 * for a failed verdict, only for a malformed request or a git error.
 */
export function runRedGreen({ repoRoot, test, files, base = "HEAD", snapshotDir, log = () => {} }) {
  if (!test) throw new Error("redgreen: --test <command> is required");
  if (!files || files.length === 0) throw new Error("redgreen: --files <path...> is required");

  const dir = snapshotDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "redgreen-"));
  const report = {
    ok: false,
    base,
    test,
    snapshotDir: dir,
    files: [],
    red: null,
    green: null,
    problems: [],
  };

  // 1. Snapshot the working tree. This is the fix, and it is taken here, in
  //    the same process that will restore it, so it cannot go stale.
  const entries = [];
  for (const file of files) {
    const abs = path.resolve(repoRoot, file);
    if (!fs.existsSync(abs)) throw new Error(`redgreen: ${file} does not exist in the working tree`);
    const bytes = fs.readFileSync(abs);
    const snapshotPath = path.join(dir, gitPath(repoRoot, file).replace(/\//g, "__"));
    fs.writeFileSync(snapshotPath, bytes);
    const baseBytes = baseContent(repoRoot, base, file);
    const entry = {
      path: gitPath(repoRoot, file),
      abs,
      snapshotPath,
      snapshotSha: sha256(bytes),
      baseSha: baseBytes == null ? null : sha256(baseBytes),
      bytes,
      baseBytes,
      changedDuringRed: false,
      restored: false,
      matches: false,
    };
    if (entry.baseSha === entry.snapshotSha) {
      report.problems.push(
        `${entry.path} is identical to ${base}; there is nothing to revert, so the red run does not exercise a change in this file.`,
      );
    }
    entries.push(entry);
  }

  // 2. Revert to base.
  for (const e of entries) {
    if (e.baseBytes == null) {
      log(`revert  ${e.path}  (absent at ${base}; removing)`);
      fs.rmSync(e.abs, { force: true });
    } else {
      log(`revert  ${e.path}  → ${base}`);
      fs.writeFileSync(e.abs, e.baseBytes);
    }
  }

  // 3. Red run.
  log(`red     ${test}`);
  const red = runTest(test, repoRoot);
  const redReason = red.exit === 0 ? null : classifyRedFailure(red.output);
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
      `The test command itself could not run (the shell reported a missing command or path), so the red run says nothing about the defect. Fix the --test invocation and run again.`,
    );
  } else if (redReason === "import" || redReason === "syntax") {
    report.problems.push(
      `The red run failed on a ${redReason} error, not on the defect. A whole-file revert broke the test's imports; simulate the old behaviour in place instead (§5b) and keep a positive control in the file.`,
    );
  }

  // 4. Before restoring, prove nothing edited the reverted files under us.
  //    The snapshot is the fix as it was at the start of this call; a file
  //    that changed during the red run holds work the snapshot lacks, and
  //    overwriting it is exactly the stale-restore failure this exists to
  //    prevent. Such a file is left as it is and named.
  for (const e of entries) {
    const exists = fs.existsSync(e.abs);
    const nowSha = exists ? sha256(fs.readFileSync(e.abs)) : null;
    if (nowSha !== e.baseSha) {
      e.changedDuringRed = true;
      report.problems.push(
        `${e.path} changed during the red run (expected the ${base} content, found something else). Not restored, so the edit is not lost; the snapshot of the fix is at ${e.snapshotPath}. Merge the two by hand, then run redgreen again.`,
      );
    }
  }

  // 5. Restore and hash-check.
  for (const e of entries) {
    if (e.changedDuringRed) continue;
    fs.mkdirSync(path.dirname(e.abs), { recursive: true });
    fs.writeFileSync(e.abs, e.bytes);
    e.restored = true;
    e.matches = sha256(fs.readFileSync(e.abs)) === e.snapshotSha;
    log(`restore ${e.path}  ${e.matches ? "matches snapshot" : "HASH MISMATCH"}`);
    if (!e.matches) {
      report.problems.push(`${e.path} does not match its snapshot after restore. The fix is at ${e.snapshotPath}.`);
    }
  }

  const treeIntact = entries.every((e) => e.restored && e.matches);

  // 6. Green run, only on a tree that is provably the fix again.
  if (treeIntact) {
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
  } else {
    report.green = { skipped: true, reason: "the tree was not fully restored; see problems" };
  }

  report.files = entries.map(({ bytes, baseBytes, abs, ...rest }) => rest);
  report.ok =
    report.red.outcome === "failed" &&
    report.red.reason !== "shell" &&
    report.red.reason !== "import" &&
    report.red.reason !== "syntax" &&
    treeIntact &&
    report.green?.outcome === "passed";
  return report;
}

/** Parse `redgreen --test <cmd> --files <a> [<b>...] [--base <rev>]`. */
export function parseRedGreenArgs(args) {
  const opts = { test: undefined, files: [], base: "HEAD" };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--test") {
      opts.test = args[++i];
    } else if (a === "--base") {
      opts.base = args[++i];
    } else if (a === "--files") {
      while (i + 1 < args.length && !args[i + 1].startsWith("--")) opts.files.push(args[++i]);
    } else {
      throw new Error(`redgreen: unknown argument ${a}`);
    }
  }
  return opts;
}

// The "prove the regression test is honest" cycle from the write-regression-test skill, in
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

export function runTest(cmd, cwd, shell = testShell(), { maxBuffer = 64 * 1024 * 1024 } = {}) {
  const r = spawnSync(cmd, {
    cwd,
    shell,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer,
    env: process.env,
  });
  // The streams have no shared ordering. Keep their boundary a line boundary
  // even when the last stdout write did not include a newline.
  const output = [r.stdout, r.stderr].filter(Boolean).join("\n");
  const lines = output.split(/\r?\n/).filter((l) => l.trim() !== "");
  return {
    exit: r.status == null ? -1 : r.status,
    tail: lines.slice(-40),
    output,
    launchError: r.error?.code ?? null,
    signal: r.signal ?? null,
    // Supported defaults plus explicitly named sh/bash/dash. Other custom
    // interpreters are unverified; a basename is not shell-family attestation.
    posixShell: shell === true ? process.platform !== "win32" : /(?:^|[\\/])(?:ba|da)?sh(?:\.exe)?$/i.test(shell),
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
export function classifyRedFailure(output, { removed = [], launchError = null, exit = null, posixShell = false } = {}) {
  output = output.replace(ANSI_ESCAPE_RE, "");
  if (["ENOENT", "EACCES", "ENOEXEC"].includes(launchError)) return "shell";
  if (["ENOBUFS", "ETIMEDOUT"].includes(launchError)) return "crash";
  if (launchError) return "unknown";
  if (exit === -1) return "crash";
  const testedDiagnostic = /\bAssertionError\b|\bexpected\b.*\bto\b|\.to(?:Be|Equal|StrictEqual|Match|Contain|Throw|HaveLength|HaveProperty)\w*\(|\bexpect\(|✗|×|\bFAIL\b|Tests\s+\d+ failed|\d+ failing\b|\bnot ok \d|assert\.\w+\(|Assertion failed/i.test(output);
  // POSIX shells reserve these for execution failure, but also forward a
  // program's chosen status. Assertion evidence therefore makes them ambiguous.
  // cmd does not use this convention; do not infer it from the host platform.
  if (posixShell && (exit === 126 || exit === 127)) return testedDiagnostic ? "unknown" : "shell";
  // Node could not find the script it was handed: every "Cannot find module"
  // block carries an empty requireStack, no block names an ESM import ("…
  // imported from …" carries no requireStack at all), and the missing path is
  // not one the revert removed. One import break anywhere, or a missing file
  // that the fix adds (the test spawns it, so it is the child's own entry
  // script), is the in-place case the write-regression-test skill describes, not a shell one.
  const moduleBlocks = [...output.matchAll(/Cannot find module '([^']+)'[^{}]*\{[^{}]*requireStack: \[([^\]]*)\]/g)];
  const esmImportBreak = /Cannot find module '[^']+' imported from /.test(output);
  // A path boundary is required: `a.mjs` must not match `schema.mjs`.
  // Case-insensitive on Windows, where the file system is.
  const fold = (s) => (process.platform === "win32" ? s.toLowerCase() : s);
  const namesRemovedFile = (p) => {
    const q = fold(p.replace(/\\/g, "/"));
    return removed.some((r) => {
      const s = r && fold(r.replace(/\\/g, "/"));
      return s && (q === s || q.endsWith("/" + s));
    });
  };
  const missingEntryScript =
    moduleBlocks.length > 0 && !esmImportBreak && moduleBlocks.every((m) => m[2].trim() === "" && !namesRemovedFile(m[1]));
  // A failed command chain and a test printing a child's diagnostic can have
  // identical output and exit status (including cmd/npm's status 1). Neither
  // ordering nor assertion text proves provenance: require human adjudication
  // for mixed diagnostics instead of accepting a false red or calling an
  // honest regression a broken invocation.
  // Redirected stderr can follow partial stdout on the same line. Match the
  // diagnostic suffix, while trailing assertion prose/quotes stay outside it.
  const shellDiagnostic =
    /(?:(?:\/[\w.-]+)*\/)?(?:bash|dash|sh)(?:: (?:line )?\d+)?: [^\r\n]+: (?:command not found|not found|No such file or directory|Permission denied|cannot execute[^\r\n]*)\s*$/im.test(output) ||
    /'[^'\r\n]+' is not recognized as an internal or external command,?\s*$/im.test(output) ||
    /npm (?:ERR!|error) Missing script:\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"'\r\n]+)\s*$/im.test(output);
  if (missingEntryScript) return "shell";
  if (shellDiagnostic) return testedDiagnostic ? "unknown" : "shell";
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
  if (testedDiagnostic) return "assertion";
  return "unknown";
}

/**
 * The `Test Files` and `Tests` summary lines vitest prints at the end of a
 * run, joined into one string. `tail` is the last 40 output lines, which on a
 * multi-failure run ends on the last stack trace rather than the count, so
 * this is what a report quotes instead. Returns null when the output carries
 * neither line (a crash, a shell failure, a runner other than vitest).
 *
 * vitest colours these labels through `tinyrainbow`, which this machine
 * enables unconditionally on Windows regardless of TTY, so the raw line
 * starts with an ANSI escape (`\x1b[2m Test Files \x1b[22m …`); ANSI is
 * stripped before matching. A `Test Files` line always carries a count
 * (`\d+ (?:passed|failed|skipped|todo)`); a `Tests` line usually does too,
 * but when the run collected zero tests (every test file failed to import,
 * for instance) vitest prints `Tests  no tests` instead, with no digit in
 * it — that shape counts as the summary as well, so a red run that
 * collected nothing still reports as much rather than silently losing its
 * `Tests` line. Neither line is matched on the label alone, so a test's own
 * diagnostic output that happens to start with "Tests" (`Tests are slow
 * today`) is not mistaken for the summary.
 *
 * On a `--test` command that invokes vitest more than once, each invocation
 * prints its own `Test Files` / `Tests` pair. The pair is read as the last
 * `Test Files` line and the first `Tests` line after it. Every output vitest
 * 2.1.9 prints puts the two lines adjacent, so taking the last of each
 * independently reads the same pair on real output; the rule matters only
 * where an invocation's `Tests` line is absent or in a shape this parser
 * does not recognise, and it then reports the half it has rather than
 * reaching back into an earlier invocation for the other. With no `Test
 * Files` line anywhere, the fallback is the last `Tests` line in the output.
 */
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;
const VITEST_COUNT_RE = /\d+\s+(?:passed|failed|skipped|todo)/;
const VITEST_NO_TESTS_RE = /\bno tests\b/;
const isTestFilesLine = (l) => /^\s*Test Files\s/.test(l) && VITEST_COUNT_RE.test(l);
const isTestsLine = (l) => /^\s*Tests\s/.test(l) && (VITEST_COUNT_RE.test(l) || VITEST_NO_TESTS_RE.test(l));

// vitest opens every run with its own banner (`RUN  v2.1.9 <root>`), which a
// command that reaches vitest without naming it in the `--test` string (an
// `npm test` that runs `vitest run` under the hood) still prints. Reading it
// off the actual output, rather than guessing from the command text alone,
// catches that case; it still only fires red.summary === null on a run that
// looks like vitest one way or the other, never on a plain runner that has
// no summary to begin with.
const VITEST_BANNER_RE = /\bRUN\b\s+v\d+\.\d+\.\d+/;
const looksLikeVitestRun = (test, output) =>
  /\bvitest\b/i.test(test) || VITEST_BANNER_RE.test(String(output || "").replace(ANSI_ESCAPE_RE, ""));

export function parseVitestSummary(output) {
  const lines = String(output || "").replace(ANSI_ESCAPE_RE, "").split(/\r?\n/);

  let testFilesIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (isTestFilesLine(lines[i])) {
      testFilesIdx = i;
      break;
    }
  }

  let testFiles;
  let tests;
  if (testFilesIdx !== -1) {
    testFiles = lines[testFilesIdx];
    for (let i = testFilesIdx + 1; i < lines.length; i++) {
      if (isTestsLine(lines[i])) {
        tests = lines[i];
        break;
      }
    }
  } else {
    // No Test Files line anywhere: fall back to the last Tests line, if any.
    for (let i = lines.length - 1; i >= 0; i--) {
      if (isTestsLine(lines[i])) {
        tests = lines[i];
        break;
      }
    }
  }

  if (!testFiles && !tests) return null;
  return [testFiles, tests]
    .filter(Boolean)
    .map((l) => l.trim())
    .join(" / ");
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
      const redReason = red.exit === 0 ? null : classifyRedFailure(red.output, { removed, launchError: red.launchError, exit: red.exit, posixShell: red.posixShell });
      report.red = {
        exit: red.exit,
        launchError: red.launchError,
        signal: red.signal,
        posixShell: red.posixShell,
        outcome: red.exit === 0 ? "passed" : "failed",
        reason: redReason,
        tail: red.tail,
        summary: parseVitestSummary(red.output),
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
          `The red run failed on a ${redReason} error, not on the defect. A whole-file revert broke the test's imports; simulate the old behaviour in place instead (see the write-regression-test skill) and keep a positive control in the file.`,
        );
      } else if (redReason === "crash") {
        report.problems.push(
          red.launchError === "ENOBUFS"
            ? `The test exceeded the 64 MiB output buffer and was terminated. Partial output proves nothing about the defect. Reduce output or split the run, then run again.`
            : `The runner crashed on the base (a killed worker, an out-of-memory, a fatal error), which proves nothing about the defect. Lower the caps or split the run, then run again.`,
        );
      } else if (redReason === "unknown") {
        report.problems.push(
          red.launchError
            ? `The test could not complete (execution error ${red.launchError}). Inspect the invocation and environment; this is not regression proof.`
            : red.posixShell && (red.exit === 126 || red.exit === 127)
            ? `The test exited ${red.exit} through a recognized POSIX shell. That status is reserved for execution failure, but a test program can choose it too. Assertion output alone cannot establish its origin: inspect the full invocation and explain the actual failure in the PR. The same status under cmd does not have this shell meaning.`
            : red.output.trim() === ""
            ? `The test exited ${red.exit} on the base with no output at all, so there is nothing to show the failure was the ticket's. Use a test invocation that prints its assertion.`
            : `The test exited ${red.exit} on the base, but its output is unrecognized or mixes assertion and shell diagnostics whose origin cannot be inferred. Read the full run yourself: if it is the ticket's assertion, explain the evidence in the PR; a broken command chain, config error or truncated run proves nothing.`,
        );
      } else if (redReason === "assertion" && report.red.summary == null && looksLikeVitestRun(test, red.output)) {
        // Only when the command names vitest or the output carries vitest's
        // own run banner: a plain Node or other test runner has no Test
        // Files / Tests summary to begin with, and that is expected, not a
        // parsing failure. This still cannot tell a real vitest run that
        // printed neither shape (a reporter or version this parser does not
        // know) from a command that merely mentions "vitest" in a path or a
        // comment without running it; either way the missing summary is
        // worth a look.
        report.problems.push(
          `The test command names vitest, or the output shows vitest's own run banner, and it failed on the base with what reads as a real assertion, but no \`Test Files\`/\`Tests\` summary line could be parsed from the output. Read red.tail for the failure and quote it directly in the PR.`,
        );
      } else if (redReason === "assertion" && report.red.summary != null && VITEST_NO_TESTS_RE.test(report.red.summary)) {
        // A red that collected nothing asserted nothing. The exit code and
        // the FAIL token still read as an assertion, so only the summary
        // says the run proves nothing about the defect.
        report.problems.push(
          `The red run's summary reports that no test ran (${report.red.summary}): every test file failed to collect on the base, so nothing was asserted and the red proves nothing about the defect. A revert that breaks an import the test file needs is the usual cause; simulate the old behaviour in place instead (see the write-regression-test skill).`,
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
        summary: parseVitestSummary(green.output),
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

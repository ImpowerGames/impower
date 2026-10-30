import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { worktreeTempDir, worktreeTempEnv } from "./worktree-temp.mjs";

export function sha256(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}

export function gitPath(repoRoot, file) {
  return path.relative(repoRoot, path.resolve(repoRoot, file)).split(path.sep).join("/");
}

function git(repoRoot, args) {
  const r = spawnSync("git", args, { cwd: repoRoot, windowsHide: true, maxBuffer: 64 * 1024 * 1024 });
  if (r.error) throw r.error;
  return r;
}

export function gitTopLevel(repoRoot) {
  const r = git(repoRoot, ["rev-parse", "--show-toplevel"]);
  if (r.status !== 0) throw new Error(`redgreen: ${repoRoot} is not inside a git repository: ${String(r.stderr).trim()}`);
  return String(r.stdout).trim();
}

export function sameDir(a, b) {
  const norm = (p) => {
    let r = path.resolve(p);
    try {
      r = fs.realpathSync.native(r);
    } catch {
    }
    return r.replace(/[\\/]+$/, "").toLowerCase();
  };
  return norm(a) === norm(b);
}

export function resolveBase(repoRoot, base) {
  const r = git(repoRoot, ["rev-parse", "--verify", "--quiet", `${base}^{commit}`]);
  if (r.status !== 0) {
    throw new Error(
      `redgreen: --base "${base}" does not resolve to a commit in this repository (git: ${String(r.stderr).trim() || "no such revision"}). Check the spelling, and fetch first if it is a remote branch.`,
    );
  }
  const tip = String(r.stdout).trim();
  const m = git(repoRoot, ["merge-base", "--all", "HEAD", tip]);
  const found = String(m.stdout).trim().split(/\s+/).filter(Boolean);
  if (found.length === 0) {
    const shallow = String(git(repoRoot, ["rev-parse", "--is-shallow-repository"]).stdout).trim() === "true";
    throw new Error(
      shallow
        ? `redgreen: no merge base of --base "${base}" and HEAD is reachable in this shallow clone. Deepen it until the branch point is present (git fetch --unshallow, or --deepen=<n>), then run redgreen again.`
        : `redgreen: --base "${base}" shares no history with HEAD (git: ${String(m.stderr).trim() || "no merge base"}).`,
    );
  }
  if (found.length > 1) {
    throw new Error(
      `redgreen: --base "${base}" and HEAD have ${found.length} merge bases (${found.map((c) => c.slice(0, 9)).join(", ")}), which can hold different pre-fix content. Pass the intended one as --base.`,
    );
  }
  const commit = found[0];
  const label = commit === tip ? base : `the merge base of ${base} and HEAD (${commit.slice(0, 9)})`;
  return { commit, label };
}

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

export function testShell() {
  if (process.platform !== "win32") return true;
  const where = (name) => {
    const r = spawnSync("where", [name], { encoding: "utf8", windowsHide: true });
    return r.status === 0 ? r.stdout.split(/\r?\n/).map((l) => l.trim()).filter(Boolean) : [];
  };
  for (const g of where("git")) {
    const candidate = path.join(path.dirname(g), "..", "bin", "bash.exe");
    if (fs.existsSync(candidate)) return candidate;
  }
  const bash = where("bash").find((p) => !/\\System32\\/i.test(p));
  return bash ?? true;
}

const NOT_RUN_EXIT = 75;
const NOT_RUN_RE = /^test-suite: not run: .*/m;
const NOT_RUN_MIDLINE_RE = /test-suite: not run: .*/;
const notRunMatch = (output, exit) => {
  const text = output.replace(ANSI_ESCAPE_RE, "");
  const atLineStart = text.match(NOT_RUN_RE);
  if (atLineStart || exit !== NOT_RUN_EXIT) return atLineStart;
  const midLine = text.match(NOT_RUN_MIDLINE_RE);
  return midLine && !hasAssertionEvidence(text.replace(midLine[0], "")) ? midLine : null;
};
const notStarted = (output, exit) => notRunMatch(output, exit) != null;
const notRunLine = (output, exit) => notRunMatch(output, exit)[0];

export function runTest(cmd, cwd, shell = testShell(), { maxBuffer = 64 * 1024 * 1024 } = {}) {
  const r = spawnSync(cmd, {
    cwd,
    shell,
    windowsHide: true,
    encoding: "utf8",
    maxBuffer,
    env: worktreeTempEnv(cwd),
  });
  const output = [r.stdout, r.stderr].filter(Boolean).join("\n");
  const lines = output.split(/\r?\n/).filter((l) => l.trim() !== "");
  return {
    exit: r.status == null ? -1 : r.status,
    tail: lines.slice(-40),
    output,
    launchError: r.error?.code ?? null,
    signal: r.signal ?? null,
    posixShell: shell === true ? process.platform !== "win32" : /(?:^|[\\/])(?:ba|da)?sh(?:\.exe)?$/i.test(shell),
  };
}

export function classifyRedFailure(output, { removed = [], launchError = null, exit = null, posixShell = false } = {}) {
  output = output.replace(ANSI_ESCAPE_RE, "");
  if (notStarted(output, exit)) return "notrun";
  if (["ENOENT", "EACCES", "ENOEXEC"].includes(launchError)) return "shell";
  if (["ENOBUFS", "ETIMEDOUT"].includes(launchError)) return "crash";
  if (launchError) return "unknown";
  if (exit === -1) return "crash";
  const testedDiagnostic = hasAssertionEvidence(output);
  if (posixShell && (exit === 126 || exit === 127)) return testedDiagnostic ? "unknown" : "shell";
  const moduleBlocks = [...output.matchAll(/Cannot find module '([^']+)'[^{}]*\{[^{}]*requireStack: \[([^\]]*)\]/g)];
  const esmImportBreak = /Cannot find module '[^']+' imported from /.test(output);
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
  const shellDiagnostic =
    /(?:(?:\/[\w.-]+)*\/)?(?:bash|dash|sh)(?:: (?:line )?\d+)?: [^\r\n]+: (?:command not found|not found|No such file or directory|Permission denied|cannot execute[^\r\n]*)\s*$/im.test(output) ||
    /'[^'\r\n]+' is not recognized as an internal or external command,?\s*$/im.test(output) ||
    /npm (?:ERR!|error) Missing script:\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\s"'\r\n]+)\s*$/im.test(output);
  if (missingEntryScript) return "shell";
  if (shellDiagnostic) return testedDiagnostic ? "unknown" : "shell";
  if (/^\s*No test(?:s| files| suite) found\b[^\r\n]*$/im.test(output)) {
    const summary = parseVitestSummary(output);
    if (summary && VITEST_NO_TESTS_RE.test(summary)) return "notests";
    if (testedDiagnostic) return "unknown";
    return "notests";
  }
  const runnerOutput = withoutDiffBlocks(output);
  if (
    /ERR_MODULE_NOT_FOUND|Cannot find module|Cannot find package|Failed to resolve import|Failed to load url|does not provide an export named|has no exported member/i.test(
      runnerOutput,
    )
  ) {
    return "import";
  }
  const syntaxBanner = /^\s*(?:(?:Uncaught )?SyntaxError\b|(?:Error: )?Transform failed\b|(?:\w*Error: )?Unexpected token\b)/im.test(runnerOutput);
  if (parseVitestSummary(output) != null || VITEST_BANNER_RE.test(output)) {
    if (syntaxBanner && /^\s*FAIL\s+(?![^\r\n]*\s>\s)[^\r\n]*\[ [^\]\r\n]+ \]\s*$/m.test(runnerOutput)) return "syntax";
  } else {
    if (syntaxBanner) return "syntax";
    if (/^[^\r\n]*?(?:\(\d+,\d+\)|:\d+:\d+)(?::| -) error TS\d{4}:|^\s*error TS\d{4}:/im.test(runnerOutput)) {
      return /^\s*(?:AssertionError(?: \[\w+\])?:|FAIL\s|not ok \d|[✕✗×✖]\s)|^\s*Tests\s+\d+ failed|\d+ failing\b/m.test(runnerOutput) ? "unknown" : "syntax";
    }
  }
  if (/^\s*(?:Error: )?Worker exited unexpectedly|^\s*FATAL ERROR: |^\s*Segmentation fault|^\s*Killed\s*$/im.test(output)) {
    return "crash";
  }
  if (testedDiagnostic) return "assertion";
  return "unknown";
}

// workaround(tinyrainbow): colours vitest summary labels on Windows regardless of TTY, so ANSI is stripped before matching (tinyrainbow 1.2.0)
const ANSI_ESCAPE_RE = /\x1b\[[0-9;]*m/g;
const FAILURE_GLYPH_RE = /^\s*[✕✗×✖]\s/m;
const ASSERTION_EVIDENCE_RE = /\bAssertionError\b|\bexpected\b.*\bto\b|\.to(?:Be|Equal|StrictEqual|Match|Contain|Throw|HaveLength|HaveProperty)\w*\(|\bexpect\(|\bFAIL\b|Tests\s+\d+ failed|\d+ failing\b|\bnot ok \d|assert\.\w+\(|Assertion failed/i;
function withoutDiffBlocks(output) {
  const kept = [];
  let indent = null;
  for (const line of output.split(/\r?\n/)) {
    const header = line.match(/^(\s*)(?:[-+] (?:Expected|Received)\b|\+ actual - expected\b)/);
    if (header) {
      indent = header[1];
      continue;
    }
    if (indent !== null && (line.trim() === "" || (line.startsWith(indent) && /^(?:[-+] |  )/.test(line.slice(indent.length))))) continue;
    indent = null;
    kept.push(line);
  }
  return kept.join("\n");
}
function hasAssertionEvidence(output) {
  return FAILURE_GLYPH_RE.test(output) || ASSERTION_EVIDENCE_RE.test(output);
}
function failureEvidence(output, logPath) {
  let logError = null;
  try { fs.writeFileSync(logPath, output); }
  catch (error) { logError = `${String(error.message || error)}. Any output at ${logPath} is unverified and may be partial or stale.`; }
  const matches = output.replace(ANSI_ESCAPE_RE, "").split(/\r?\n/).filter((line) =>
    !/^\s*(?:PASS\b|ok\b|[✓✔])/.test(line) && (FAILURE_GLYPH_RE.test(line) || /^(?:\s*(?:FAIL\b|not ok\b))|\bAssertionError\b/.test(line)));
  const excerpt = matches.slice(0, 40);
  return { logPath: logError ? null : logPath, unverifiedLogPath: logError ? logPath : null, logError, failures: excerpt.map((line) => line.slice(0, 2000)), failuresOmitted: Math.max(0, matches.length - 40), failureLinesTruncated: excerpt.filter((line) => line.length > 2000).length };
}
const VITEST_COUNT_RE =/\d+\s+(?:passed|failed|skipped|todo)/;
const VITEST_NO_TESTS_RE = /\bno tests\b/;
const isTestFilesLine = (l) => /^\s*Test Files\s/.test(l) && VITEST_COUNT_RE.test(l);
const isTestsLine = (l) => /^\s*Tests\s/.test(l) && (VITEST_COUNT_RE.test(l) || VITEST_NO_TESTS_RE.test(l));

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

export function runRedGreen({ repoRoot, test, files, base = "HEAD", snapshotDir, log = () => {} }) {
  if (!test) throw new Error("redgreen: --test <command> is required");
  if (!files || files.length === 0) throw new Error("redgreen: --files <path...> is required");
  if (!repoRoot) throw new Error("redgreen: repoRoot is required");

  const top = gitTopLevel(repoRoot);
  if (!sameDir(top, repoRoot)) {
    throw new Error(`redgreen: run from the repository root (${top}), not from ${repoRoot}; git resolves rev:path from the root.`);
  }
  const { commit: baseCommit, label: baseLabel } = resolveBase(repoRoot, base);

  const dir = snapshotDir ?? fs.mkdtempSync(path.join(worktreeTempDir(repoRoot), "redgreen-"));
  if (!snapshotDir) fs.writeFileSync(path.join(dir, "owner.json"), JSON.stringify({ pid: process.pid }) + "\n");
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
        `${entry.path} is identical to ${baseLabel}; there is nothing to revert, so the red run does not exercise a change in this file. If the fix is committed, pass --base origin/main; otherwise this file is not where the fix lives.`,
      );
    }
    entries.push(entry);
  }
  log(`snapshot ${entries.length} file(s) → ${dir}`);

  const shaOnDisk = (abs) => (fs.existsSync(abs) ? sha256(fs.readFileSync(abs)) : null);

  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    for (const e of entries) {
      try {
        if (e.reverted) {
          const nowSha = shaOnDisk(e.abs);
          if (nowSha == null && e.baseSha != null) {
            report.problems.push(
              `${e.path} was deleted while it was reverted (by the test run or something alongside it). Recreated from the snapshot; check that whatever deleted it was not meant to.`,
            );
          } else if (nowSha !== e.baseSha) {
            e.changedDuringRed = true;
            report.problems.push(
              `${e.path} changed while it was reverted (expected the ${baseLabel} content, found something else). Not restored, so that edit is not lost: the file now holds the ${baseLabel} content plus the edit, and the snapshot of the fix is at ${e.snapshotPath}. Merge the two by hand, then run redgreen again.`,
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
    let revertFailed = false;
    for (const e of entries) {
      try {
        if (e.baseBytes == null) {
          log(`revert  ${e.path}  (absent at ${baseLabel}; removing)`);
          fs.rmSync(e.abs, { force: true });
        } else {
          log(`revert  ${e.path}  → ${baseLabel}`);
          fs.writeFileSync(e.abs, e.baseBytes);
        }
        e.reverted = true;
      } catch (err) {
        revertFailed = true;
        report.problems.push(`${e.path} could not be reverted to ${baseLabel} (${String(err.message || err)}). The red run was not attempted.`);
        break;
      }
    }

    if (!revertFailed) {
      log(`red     ${test}`);
      const red = runTest(test, repoRoot);
      const removed = entries.filter((e) => e.baseBytes == null).map((e) => e.path);
      const redReason = red.exit === 0 ? null : classifyRedFailure(red.output, { removed, launchError: red.launchError, exit: red.exit, posixShell: red.posixShell });
      report.red = {
        exit: red.exit,
        launchError: red.launchError,
        signal: red.signal,
        posixShell: red.posixShell,
        outcome: red.exit === 0 ? "passed" : redReason === "notrun" ? "not run" : "failed",
        reason: redReason,
        tail: red.tail,
        ...failureEvidence(red.output, path.join(dir, "red.log")),
        summary: parseVitestSummary(red.output),
      };
      if (report.red.logError) report.problems.push(`The red output could not be saved: ${report.red.logError}. The exit status and excerpts remain in this report.`);
      if (red.exit === 0) {
        report.problems.push(
          `The test passed against ${baseLabel}. It pins nothing: either it does not assert the ticket's behaviour, or the files listed are not where the fix lives.`,
        );
      } else if (redReason === "notrun") {
        report.problems.push(
          `The red run never started (${notRunLine(red.output, red.exit)}), so it says nothing about the defect. Wait for the other run to finish and run redgreen again.`,
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
            : /heap out of memory/i.test(red.output)
            ? `The runner ran out of heap on the base, which proves nothing about the defect. A failing assertion on a large object (a Game, a Story, a program) can exhaust the heap while Vitest prints the received value, before any length cap applies; assert on an identity or a boolean instead (expect(x == null).toBe(true), expect(a === b).toBe(true)). Otherwise lower the caps or split the run, then run again.`
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
        report.problems.push(
          `The test command names vitest, or the output shows vitest's own run banner, and it failed on the base with what reads as a real assertion, but no \`Test Files\`/\`Tests\` summary line could be parsed from the output. Read red.failures${report.red.logPath ? " and the log at red.logPath" : " (the raw log could not be saved)"} for the failure and quote it directly in the PR.`,
        );
      } else if (redReason === "assertion" && report.red.summary != null && VITEST_NO_TESTS_RE.test(report.red.summary)) {
        report.problems.push(
          `The red run's summary reports that no test ran (${report.red.summary}): every test file failed to collect on the base, so nothing was asserted and the red proves nothing about the defect. A revert that breaks an import the test file needs is the usual cause; simulate the old behaviour in place instead (see the write-regression-test skill).`,
        );
      }
    }
  } catch (err) {
    report.problems.push(`redgreen stopped early: ${String(err.message || err)}. The tree was restored as far as the report below says.`);
  } finally {
    try {
      restore();
    } finally {
      process.off("SIGINT", onSignal);
      process.off("SIGTERM", onSignal);
    }
  }

  const treeIntact = entries.every((e) => e.restored && e.matches);

  if (treeIntact && report.red) {
    try {
      log(`green   ${test}`);
      const green = runTest(test, repoRoot);
      report.green = {
        exit: green.exit,
        outcome: green.exit === 0 ? "passed" : notStarted(green.output, green.exit) ? "not run" : "failed",
        tail: green.tail,
        ...failureEvidence(green.output, path.join(dir, "green.log")),
        summary: parseVitestSummary(green.output),
      };
      if (report.green.logError) report.problems.push(`The green output could not be saved: ${report.green.logError}. The exit status and excerpts remain in this report.`);
      if (report.green.outcome === "not run") {
        report.problems.push(`The green run never started (${notRunLine(green.output, green.exit)}), so it says nothing about the fix. Wait for the other run to finish and run redgreen again.`);
      } else if (green.exit !== 0 && report.green.summary == null && !hasAssertionEvidence(green.output.replace(ANSI_ESCAPE_RE, ""))) {
        report.problems.push(
          `The green run produced no test result (exit ${green.exit}, no \`Test Files\`/\`Tests\` summary and no assertion failure in the output), so it says nothing about the fix. Read green.tail and the log at green.logPath, then run redgreen again.`,
        );
      } else if (green.exit !== 0) {
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

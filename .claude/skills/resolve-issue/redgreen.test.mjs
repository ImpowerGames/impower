#!/usr/bin/env node
// Pins the red/green cycle in redgreen.mjs (#426). Run:
//   node .claude/skills/resolve-issue/redgreen.test.mjs
//
// Each case builds a throwaway git repository holding a one-line module, a
// check script that fails until the module carries the fix, and a commit of
// the pre-fix state. The cases are weighted toward the ways the by-hand cycle
// this replaces went wrong, and toward the ways the command itself could lie:
// a snapshot that goes stale while the tree is reverted, a "baseline" that
// already contains the fix, a red run that fails for a reason other than the
// defect, a restore that never reached the disk, and a verdict that ignores a
// problem it reported.
//
// Pure Node plus a real git binary. Node's built-in assert only.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyRedFailure, parseRedGreenArgs, runRedGreen, sha256 } from "./redgreen.mjs";

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (err) {
    failures++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${String(err.message).split("\n").join("\n  ")}`);
  }
};

const git = (cwd, ...args) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr}`);
  return r.stdout;
};

const NODE = JSON.stringify(process.execPath);
const OLD = 'export const value = "old";\n';
const NEW = 'export const value = "new";\n';

/** A repo whose HEAD holds the pre-fix module and a check that wants the fix. */
function makeRepo() {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "redgreen-test-")));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "redgreen test");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "lib.mjs"), OLD);
  fs.writeFileSync(
    path.join(dir, "check.mjs"),
    [
      'import { value } from "./lib.mjs";',
      'if (value !== "new") { console.error("AssertionError: expected new, got " + value); process.exit(1); }',
      'console.log("ok");',
    ].join("\n") + "\n",
  );
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "pre-fix");
  return dir;
}

const applyFix = (dir) => fs.writeFileSync(path.join(dir, "lib.mjs"), NEW);
const libText = (dir) => fs.readFileSync(path.join(dir, "lib.mjs"), "utf8");
const snapshotDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "redgreen-snap-"));
const run = (dir, extra = {}) =>
  runRedGreen({ repoRoot: dir, test: `${NODE} check.mjs`, files: ["lib.mjs"], snapshotDir: snapshotDir(), ...extra });

check("an honest test fails on the base and passes on the fix, and the restore matches by hash", () => {
  const dir = makeRepo();
  applyFix(dir);
  const r = run(dir);
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.red.outcome, "failed");
  assert.equal(r.red.reason, "assertion");
  assert.equal(r.green.outcome, "passed");
  assert.equal(r.files[0].restored, true);
  assert.equal(r.files[0].matches, true);
  assert.equal(r.files[0].snapshotSha, sha256(Buffer.from(NEW)));
  assert.match(r.baseCommit, /^[0-9a-f]{40}$/);
  assert.equal(libText(dir), NEW);
});

check("a test that passes on the base is reported as pinning nothing", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "check.mjs"), 'console.log("always ok");\n');
  const r = run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.red.outcome, "passed");
  assert.match(r.problems.join("\n"), /pins nothing/);
  assert.equal(libText(dir), NEW);
});

check("a file edited during the red run is named and left alone, not overwritten by the stale snapshot", () => {
  const dir = makeRepo();
  applyFix(dir);
  // The "test" stands in for a review round landing mid-cycle: it appends to
  // the reverted file and then fails like a real red run.
  fs.writeFileSync(
    path.join(dir, "mutate.mjs"),
    [
      'import fs from "node:fs";',
      'fs.appendFileSync("lib.mjs", "// review-round edit\\n");',
      'console.error("AssertionError: still old");',
      "process.exit(1);",
    ].join("\n") + "\n",
  );
  const r = run(dir, { test: `${NODE} mutate.mjs` });
  assert.equal(r.ok, false);
  assert.equal(r.files[0].changedDuringRed, true);
  assert.equal(r.files[0].restored, false);
  assert.match(r.problems.join("\n"), /lib\.mjs changed while it was reverted/);
  assert.equal(r.green.skipped, true);
  // The edit survives on top of the base content, and the snapshot of the fix
  // is still on disk for the merge.
  assert.equal(libText(dir), OLD + "// review-round edit\n");
  assert.equal(fs.readFileSync(r.files[0].snapshotPath, "utf8"), NEW);
});

check("a restore that never reached the disk is reported as a hash mismatch, not a success", () => {
  const dir = makeRepo();
  applyFix(dir);
  // The red run makes the reverted file read-only, so the restore's write
  // fails while the file still holds the base content. A hash taken from the
  // buffer just written would say "matches"; one read back from disk cannot.
  fs.writeFileSync(
    path.join(dir, "lock.mjs"),
    ['import fs from "node:fs";', 'fs.chmodSync("lib.mjs", 0o444);', 'console.error("AssertionError: still old");', "process.exit(1);"].join("\n") + "\n",
  );
  const r = run(dir, { test: `${NODE} lock.mjs` });
  fs.chmodSync(path.join(dir, "lib.mjs"), 0o644);
  assert.equal(r.ok, false);
  assert.equal(r.files[0].changedDuringRed, false);
  assert.equal(r.files[0].restored, false);
  assert.equal(r.files[0].matches, false);
  assert.match(r.files[0].restoreError ?? "", /EPERM|EACCES/);
  assert.match(r.problems.join("\n"), /does not match its snapshot after restore/);
  assert.equal(r.green.skipped, true);
  assert.equal(libText(dir), OLD);
});

check("a red run that dies on an import is not accepted as proof of the defect", () => {
  const dir = makeRepo();
  applyFix(dir);
  // The fix also adds a module the check imports; reverting removes it.
  fs.writeFileSync(path.join(dir, "added.mjs"), "export const added = 1;\n");
  fs.writeFileSync(
    path.join(dir, "check.mjs"),
    'import { added } from "./added.mjs";\nimport { value } from "./lib.mjs";\nif (value !== "new") process.exit(1);\nconsole.log(added);\n',
  );
  const r = run(dir, { files: ["lib.mjs", "added.mjs"] });
  assert.equal(r.ok, false);
  assert.equal(r.red.outcome, "failed");
  assert.equal(r.red.reason, "import");
  assert.match(r.problems.join("\n"), /simulate the old behaviour in place/);
  // Both files are restored all the same, the added one included.
  assert.equal(r.files[1].baseSha, null);
  assert.equal(r.files[1].matches, true);
  assert.equal(fs.readFileSync(path.join(dir, "added.mjs"), "utf8"), "export const added = 1;\n");
});

check("a red run the classifier cannot place is not accepted, and an empty output is named as such", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "check.mjs"), 'import { value } from "./lib.mjs";\nprocess.exit(value === "new" ? 0 : 1);\n');
  const r = run(dir);
  assert.equal(r.ok, false);
  assert.equal(r.red.outcome, "failed");
  assert.equal(r.red.reason, "unknown");
  assert.match(r.problems.join("\n"), /no output at all/);
  assert.equal(r.green.outcome, "passed");
  assert.equal(libText(dir), NEW);
});

check("naming the test file in --files (so the revert removes it) is reported as no tests found, not as a red", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(
    path.join(dir, "runner.mjs"),
    [
      'import fs from "node:fs";',
      'if (!fs.existsSync("new.test.mjs")) { console.error("No test files found, exiting with code 1"); process.exit(1); }',
      'await import("./new.test.mjs");',
    ].join("\n") + "\n",
  );
  fs.writeFileSync(path.join(dir, "new.test.mjs"), 'import { value } from "./lib.mjs";\nif (value !== "new") { console.error("AssertionError"); process.exit(1); }\n');
  const r = run(dir, { test: `${NODE} runner.mjs`, files: ["lib.mjs", "new.test.mjs"] });
  assert.equal(r.ok, false);
  assert.equal(r.red.reason, "notests");
  assert.match(r.problems.join("\n"), /found no test to run/);
  assert.equal(fs.existsSync(path.join(dir, "new.test.mjs")), true);
});

check("a shell failure on the red alone still fails the verdict when the green passes", () => {
  const dir = makeRepo();
  applyFix(dir);
  // Fails like a shell only while the base is in place; a gate that looked
  // only at the exit code would call this an honest red.
  fs.writeFileSync(
    path.join(dir, "gate.mjs"),
    'import { value } from "./lib.mjs";\nif (value !== "new") { console.error("bash: line 1: nosuchcmd: command not found"); process.exit(127); }\n',
  );
  const r = run(dir, { test: `${NODE} gate.mjs` });
  assert.equal(r.red.reason, "shell");
  assert.equal(r.green.outcome, "passed");
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /could not run/);
});

check("after the fix is committed, HEAD is the fix and --base must point at the pre-fix revision", () => {
  const dir = makeRepo();
  applyFix(dir);
  git(dir, "commit", "-q", "-am", "the fix");
  const againstHead = run(dir);
  assert.equal(againstHead.ok, false);
  assert.match(againstHead.problems.join("\n"), /identical to HEAD/);
  assert.match(againstHead.problems.join("\n"), /pins nothing/);
  const againstParent = run(dir, { base: "HEAD~1" });
  assert.equal(againstParent.ok, true, JSON.stringify(againstParent.problems));
});

check("a --base that does not resolve is refused before any file is touched", () => {
  const dir = makeRepo();
  applyFix(dir);
  assert.throws(() => run(dir, { base: "orgin/main" }), /--base "orgin\/main" does not resolve/);
  assert.equal(libText(dir), NEW);
});

check("a repoRoot that is not the repository root is refused before any file is touched", () => {
  const dir = makeRepo();
  applyFix(dir);
  const sub = path.join(dir, "sub");
  fs.mkdirSync(sub);
  fs.writeFileSync(path.join(sub, "lib.mjs"), "export const value = 1;\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "sub");
  assert.throws(() => runRedGreen({ repoRoot: sub, test: "true", files: ["lib.mjs"], snapshotDir: snapshotDir() }), /run from the repository root/);
  assert.equal(fs.readFileSync(path.join(sub, "lib.mjs"), "utf8"), "export const value = 1;\n");
});

check("a file identical to the base among the changed files fails the verdict, and the tree still comes back", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "other.mjs"), "export const other = 1;\n");
  git(dir, "add", "other.mjs");
  git(dir, "commit", "-q", "-m", "other");
  const r = run(dir, { files: ["lib.mjs", "other.mjs"] });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /other\.mjs is identical to HEAD/);
  assert.equal(r.red.reason, "assertion");
  assert.equal(r.green.outcome, "passed");
  assert.equal(libText(dir), NEW);
});

check("a directory or a path outside the repository in --files is refused before any file is touched", () => {
  const dir = makeRepo();
  applyFix(dir);
  assert.throws(() => run(dir, { files: [""] }), /is not a file/);
  assert.throws(() => run(dir, { files: ["../"] }), /is not a file|outside the repository/);
  assert.equal(libText(dir), NEW);
});

check("a VAR=value prefix on the test command runs, as every vitest example in the skill is written", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(
    path.join(dir, "check.mjs"),
    'import { value } from "./lib.mjs";\nif (process.env.REDGREEN_PROBE !== "yes") { console.error("prefix not applied"); process.exit(2); }\nif (value !== "new") { console.error("AssertionError: expected new"); process.exit(1); }\n',
  );
  const r = run(dir, { test: `REDGREEN_PROBE=yes ${NODE} check.mjs` });
  assert.equal(r.ok, true, JSON.stringify([r.problems, r.red.tail, r.green.tail]));
  assert.equal(r.red.reason, "assertion");
});

check("a test command the shell cannot run is a shell problem, not a red", () => {
  const dir = makeRepo();
  applyFix(dir);
  const r = run(dir, { test: "definitely-not-a-command-xyz --run" });
  assert.equal(r.ok, false);
  assert.equal(r.red.outcome, "failed");
  assert.equal(r.red.reason, "shell");
  assert.match(r.problems.join("\n"), /could not run/);
  assert.equal(libText(dir), NEW);
});

check("a file that cannot be reverted is a problem, the red run is skipped, and the report still comes back", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "other.mjs"), "export const other = 1;\n");
  git(dir, "add", "other.mjs");
  git(dir, "commit", "-q", "-m", "other");
  fs.writeFileSync(path.join(dir, "other.mjs"), "export const other = 2;\n");
  // The second file is read-only before the call, so its revert write fails
  // after the first file has already been reverted.
  fs.chmodSync(path.join(dir, "other.mjs"), 0o444);
  const r = run(dir, { files: ["lib.mjs", "other.mjs"] });
  fs.chmodSync(path.join(dir, "other.mjs"), 0o644);
  assert.equal(r.ok, false);
  assert.equal(r.red, null);
  assert.equal(r.green.skipped, true);
  assert.match(r.problems.join("\n"), /other\.mjs could not be reverted/);
  // The first file was reverted and comes back; the second was never touched
  // and is not accused of changing.
  assert.equal(r.files[0].reverted, true);
  assert.equal(r.files[0].matches, true);
  assert.equal(r.files[1].reverted, false);
  assert.equal(r.files[1].changedDuringRed, false);
  assert.equal(r.files[1].matches, true);
  assert.equal(libText(dir), NEW);
  assert.equal(fs.readFileSync(path.join(dir, "other.mjs"), "utf8"), "export const other = 2;\n");
});

check("a revert failure in the middle of the list leaves the files after it untouched, and they are checked from disk", () => {
  const dir = makeRepo();
  for (const n of ["a", "c"]) fs.writeFileSync(path.join(dir, `${n}.txt`), `${n} old\n`);
  fs.writeFileSync(path.join(dir, "b.txt"), "b old\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "three");
  applyFix(dir);
  for (const n of ["a", "b", "c"]) fs.writeFileSync(path.join(dir, `${n}.txt`), `${n} fixed\n`);
  fs.chmodSync(path.join(dir, "b.txt"), 0o444);
  // c.txt is never reverted; something rewrites it under us anyway, and the
  // restore must notice from the disk rather than assume it is the fix.
  const r = runRedGreen({
    repoRoot: dir,
    test: `${NODE} check.mjs`,
    files: ["a.txt", "b.txt", "c.txt"],
    snapshotDir: snapshotDir(),
    log: (line) => {
      if (line.startsWith("revert  b.txt")) fs.writeFileSync(path.join(dir, "c.txt"), "c rewritten\n");
    },
  });
  fs.chmodSync(path.join(dir, "b.txt"), 0o644);
  assert.equal(r.ok, false);
  assert.equal(r.red, null);
  assert.deepEqual(r.files.map((f) => f.reverted), [true, false, false]);
  assert.equal(r.files[0].matches, true);
  assert.equal(r.files[2].matches, false);
  assert.match(r.problems.join("\n"), /c\.txt does not match its snapshot/);
  assert.equal(fs.readFileSync(path.join(dir, "c.txt"), "utf8"), "c rewritten\n");
});

check("an error after the snapshot becomes a problem and the report still comes back", () => {
  const dir = makeRepo();
  applyFix(dir);
  // The caller's own log callback throws on the red line, which is an error
  // outside every inner try: the outer catch must turn it into a problem, the
  // finally must restore, and the report must still be returned.
  const r = runRedGreen({
    repoRoot: dir,
    test: `${NODE} check.mjs`,
    files: ["lib.mjs"],
    snapshotDir: snapshotDir(),
    log: (line) => {
      if (line.startsWith("red ")) throw new Error("log sink exploded");
    },
  });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /stopped early: log sink exploded/);
  assert.equal(r.files[0].matches, true);
  assert.equal(libText(dir), NEW);
});

check("a file deleted while it was reverted is recreated from the snapshot and noted", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(
    path.join(dir, "del.mjs"),
    [
      'import fs from "node:fs";',
      'if (fs.readFileSync("lib.mjs", "utf8").includes("old")) { fs.rmSync("lib.mjs"); console.error("AssertionError: still old"); process.exit(1); }',
    ].join("\n") + "\n",
  );
  const r = run(dir, { test: `${NODE} del.mjs` });
  assert.equal(r.ok, false);
  assert.match(r.problems.join("\n"), /lib\.mjs was deleted while it was reverted/);
  assert.equal(r.files[0].matches, true);
  assert.equal(libText(dir), NEW);
});

check("a repository root reached through a junction is accepted", () => {
  const dir = makeRepo();
  applyFix(dir);
  const link = path.join(os.tmpdir(), `redgreen-link-${process.pid}-${Date.now()}`);
  fs.symlinkSync(dir, link, "junction");
  try {
    const r = runRedGreen({ repoRoot: link, test: `${NODE} check.mjs`, files: ["lib.mjs"], snapshotDir: snapshotDir() });
    assert.equal(r.ok, true, JSON.stringify(r.problems));
  } finally {
    fs.rmdirSync(link);
  }
});

check("a file that cannot be read back during the restore does not stop the other files coming back", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "c.mjs"), "export const c = 1;\n");
  git(dir, "add", "c.mjs");
  git(dir, "commit", "-q", "-m", "c");
  fs.writeFileSync(path.join(dir, "c.mjs"), "export const c = 2;\n");
  // The red run replaces lib.mjs with a directory, so the restore's read of it
  // throws; c.mjs must still be restored and the report must still return.
  fs.writeFileSync(
    path.join(dir, "swap.mjs"),
    ['import fs from "node:fs";', 'fs.rmSync("lib.mjs");', 'fs.mkdirSync("lib.mjs");', 'console.error("AssertionError: still old");', "process.exit(1);"].join("\n") + "\n",
  );
  const r = run(dir, { test: `${NODE} swap.mjs`, files: ["lib.mjs", "c.mjs"] });
  assert.equal(r.ok, false);
  assert.equal(r.files[0].matches, false);
  assert.match(r.problems.join("\n"), /lib\.mjs could not be checked or restored|lib\.mjs changed while it was reverted/);
  assert.equal(r.files[1].restored, true);
  assert.equal(r.files[1].matches, true);
  assert.equal(fs.readFileSync(path.join(dir, "c.mjs"), "utf8"), "export const c = 2;\n");
  assert.equal(fs.readFileSync(r.files[0].snapshotPath, "utf8"), NEW);
  assert.equal(process.listenerCount("SIGINT"), 0);
});

check("two paths that flatten to the same name get distinct snapshot files", () => {
  const dir = makeRepo();
  fs.mkdirSync(path.join(dir, "src", "a"), { recursive: true });
  fs.writeFileSync(path.join(dir, "src", "a__b.txt"), "flat\n");
  fs.writeFileSync(path.join(dir, "src", "a", "b.txt"), "nested\n");
  git(dir, "add", ".");
  git(dir, "commit", "-q", "-m", "two");
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "src", "a__b.txt"), "flat fixed\n");
  fs.writeFileSync(path.join(dir, "src", "a", "b.txt"), "nested fixed\n");
  const r = run(dir, { files: ["lib.mjs", "src/a__b.txt", "src/a/b.txt"] });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.notEqual(r.files[1].snapshotPath, r.files[2].snapshotPath);
  assert.equal(fs.readFileSync(r.files[1].snapshotPath, "utf8"), "flat fixed\n");
  assert.equal(fs.readFileSync(r.files[2].snapshotPath, "utf8"), "nested fixed\n");
});

check("a --test whose own script does not exist is a shell problem, not an import break", () => {
  const dir = makeRepo();
  applyFix(dir);
  const r = run(dir, { test: `${NODE} redgreen.tests.mjs` });
  assert.equal(r.ok, false);
  assert.equal(r.red.reason, "shell");
  assert.match(r.problems.join("\n"), /could not run/);
});

check("classifyRedFailure tells the reasons apart on real runner output", () => {
  assert.equal(classifyRedFailure("Error [ERR_MODULE_NOT_FOUND]: Cannot find module"), "import");
  assert.equal(classifyRedFailure('Error: Failed to resolve import "./x" from "y.ts"'), "import");
  assert.equal(classifyRedFailure("AssertionError: expected 2 to be 3"), "assertion");
  assert.equal(classifyRedFailure("SyntaxError: Unexpected token"), "syntax");
  assert.equal(classifyRedFailure("bash: line 1: nosuch: command not found"), "shell");
  assert.equal(classifyRedFailure("'NODE_OPTIONS' is not recognized as an internal or external command,"), "shell");
  assert.equal(classifyRedFailure('npm ERR! Missing script: "test"'), "shell");
  assert.equal(classifyRedFailure("No test files found, exiting with code 1\nfilter: x"), "notests");
  // An assertion that quotes an ENOENT is still an assertion.
  assert.equal(
    classifyRedFailure(
      " FAIL  src/tests/loadAsset.test.ts > loads the fixture\nAssertionError: expected [Error: ENOENT: no such file or directory, open 'fixtures/a.png'] to be undefined\n Test Files  1 failed (1)",
    ),
    "assertion",
  );
  assert.equal(classifyRedFailure("Error: ENOENT: no such file or directory, open 'x'"), "unknown");
  assert.equal(classifyRedFailure(""), "unknown");
  // Word-bounded: a date is not an assertion, and TAP is one.
  assert.equal(classifyRedFailure("Error: could not reach the license server on 3 October 2026; aborting"), "unknown");
  assert.equal(classifyRedFailure("TAP version 13\nnot ok 1 - value is new\n  operator: strictEqual"), "assertion");
  assert.equal(classifyRedFailure("expect(received).toBe(expected)\nExpected: 2\nReceived: 3"), "assertion");
  assert.equal(classifyRedFailure("Error: Worker exited unexpectedly"), "crash");
  assert.equal(classifyRedFailure("FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory"), "crash");
  // A test name or an assertion that carries a crash word mid-line is still an assertion.
  assert.equal(classifyRedFailure(" FAIL src/game.test.ts > the enemy is killed when health reaches 0\nAssertionError: expected 1 to be 0\nTests  1 failed | 12 passed"), "assertion");
  assert.equal(classifyRedFailure("AssertionError: expected 'FATAL ERROR: heap' to be 'ok'\nTests  1 failed"), "assertion");
  // A quoted OOM message, or a test name mentioning it, is still an assertion.
  assert.equal(
    classifyRedFailure("AssertionError: expected the log to contain 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory' but it did not\nTests  1 failed | 3 passed"),
    "assertion",
  );
  assert.equal(classifyRedFailure(" FAIL  src/a.test.ts > reports when the worker dies from heap out of memory\nAssertionError: expected 1 to be 0\nTests  1 failed"), "assertion");
  // ESM import breaks carry no requireStack; alone or beside a missing entry script they are import breaks.
  const esm = "Error [ERR_MODULE_NOT_FOUND]: Cannot find module 'C:\\x\\added.mjs' imported from C:\\x\\check.mjs\n{ code: 'ERR_MODULE_NOT_FOUND', url: 'file:///C:/x/added.mjs' }";
  assert.equal(classifyRedFailure(esm), "import");
  assert.equal(classifyRedFailure(esm + "\nError: Cannot find module 'C:\\x\\tool.mjs'\n{ code: 'MODULE_NOT_FOUND', requireStack: [] }"), "import");
  // A script the fix adds, spawned by the test and removed by the revert, is the child's own entry script and still an import break.
  const spawned = "Error: Cannot find module 'C:\\x\\scripts\\tool.mjs'\n{ code: 'MODULE_NOT_FOUND', requireStack: [] }";
  assert.equal(classifyRedFailure(spawned), "shell");
  assert.equal(classifyRedFailure(spawned, { removed: ["scripts/tool.mjs"] }), "import");
  // A second, unrelated empty requireStack later in the output does not turn an import break into a shell failure.
  assert.equal(
    classifyRedFailure("Error: Cannot find module './added.mjs'\n{ code: 'MODULE_NOT_FOUND', requireStack: [ 'C:/x/check.mjs' ] }\n--- second runner ---\nError: Cannot find module 'z'\n{ requireStack: [] }"),
    "import",
  );
  assert.equal(
    classifyRedFailure("node:internal/modules/cjs/loader:1412\n  throw err;\n\nError: Cannot find module 'C:\\x\\redgreen.tests.mjs'\n{\n  code: 'MODULE_NOT_FOUND',\n  requireStack: []\n}"),
    "shell",
  );
  assert.equal(classifyRedFailure("Error: Cannot find module './added.mjs'\n{\n  code: 'MODULE_NOT_FOUND',\n  requireStack: [ 'C:\\x\\check.mjs' ]\n}"), "import");
});

check("parseRedGreenArgs takes several files and an optional base, and refuses a flag without a value", () => {
  const o = parseRedGreenArgs(["--test", "npx vitest run x", "--files", "a.ts", "b.ts", "--base", "origin/main"]);
  assert.deepEqual(o, { test: "npx vitest run x", files: ["a.ts", "b.ts"], base: "origin/main" });
  assert.equal(parseRedGreenArgs(["--test", "t", "--files", "a"]).base, "HEAD");
  assert.throws(() => parseRedGreenArgs(["--bogus"]), /unknown argument/);
  assert.throws(() => parseRedGreenArgs(["--test", "t", "--files", "a", "--base"]), /--base needs a value/);
  assert.throws(() => parseRedGreenArgs(["--test", "--files", "a"]), /--test needs a value/);
  assert.throws(() => parseRedGreenArgs(["--test", "t", "--files", ""]), /needs a value/);
  assert.throws(() => parseRedGreenArgs(["--files", "a"]), /--test <command> is required/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");

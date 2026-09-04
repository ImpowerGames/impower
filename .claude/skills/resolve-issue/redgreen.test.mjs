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

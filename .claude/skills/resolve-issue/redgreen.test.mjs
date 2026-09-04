#!/usr/bin/env node
// Pins the red/green cycle in redgreen.mjs (#426). Run:
//   node .claude/skills/resolve-issue/redgreen.test.mjs
//
// Each case builds a throwaway git repository holding a one-line module, a
// check script that fails until the module carries the fix, and a commit of
// the pre-fix state. The cases are weighted toward the ways the by-hand cycle
// this replaces went wrong: a snapshot that goes stale while the tree is
// reverted, a "baseline" that already contains the fix, and a red run that
// fails for a reason other than the defect.
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

/** A repo whose HEAD holds the pre-fix module and a check that wants the fix. */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "redgreen-test-"));
  git(dir, "init", "-q");
  git(dir, "config", "user.email", "test@example.com");
  git(dir, "config", "user.name", "redgreen test");
  git(dir, "config", "commit.gpgsign", "false");
  fs.writeFileSync(path.join(dir, "lib.mjs"), 'export const value = "old";\n');
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

const applyFix = (dir) => fs.writeFileSync(path.join(dir, "lib.mjs"), 'export const value = "new";\n');
const libText = (dir) => fs.readFileSync(path.join(dir, "lib.mjs"), "utf8");
const snapshotDir = () => fs.mkdtempSync(path.join(os.tmpdir(), "redgreen-snap-"));

check("an honest test fails on the base and passes on the fix, and the restore matches by hash", () => {
  const dir = makeRepo();
  applyFix(dir);
  const r = runRedGreen({ repoRoot: dir, test: `${NODE} check.mjs`, files: ["lib.mjs"], snapshotDir: snapshotDir() });
  assert.equal(r.ok, true, JSON.stringify(r.problems));
  assert.equal(r.red.outcome, "failed");
  assert.equal(r.red.reason, "assertion");
  assert.equal(r.green.outcome, "passed");
  assert.equal(r.files[0].restored, true);
  assert.equal(r.files[0].matches, true);
  assert.equal(r.files[0].snapshotSha, sha256(Buffer.from('export const value = "new";\n')));
  assert.equal(libText(dir), 'export const value = "new";\n');
});

check("a test that passes on the base is reported as pinning nothing", () => {
  const dir = makeRepo();
  applyFix(dir);
  fs.writeFileSync(path.join(dir, "check.mjs"), 'console.log("always ok");\n');
  const r = runRedGreen({ repoRoot: dir, test: `${NODE} check.mjs`, files: ["lib.mjs"], snapshotDir: snapshotDir() });
  assert.equal(r.ok, false);
  assert.equal(r.red.outcome, "passed");
  assert.match(r.problems.join("\n"), /pins nothing/);
  // The tree still comes back as the fix.
  assert.equal(libText(dir), 'export const value = "new";\n');
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
  const r = runRedGreen({ repoRoot: dir, test: `${NODE} mutate.mjs`, files: ["lib.mjs"], snapshotDir: snapshotDir() });
  assert.equal(r.ok, false);
  assert.equal(r.files[0].changedDuringRed, true);
  assert.equal(r.files[0].restored, false);
  assert.match(r.problems.join("\n"), /lib\.mjs changed during the red run/);
  assert.equal(r.green.skipped, true);
  // The edit survives, and the snapshot of the fix is still on disk for the merge.
  assert.equal(libText(dir), 'export const value = "old";\n// review-round edit\n');
  assert.equal(fs.readFileSync(r.files[0].snapshotPath, "utf8"), 'export const value = "new";\n');
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
  const r = runRedGreen({
    repoRoot: dir,
    test: `${NODE} check.mjs`,
    files: ["lib.mjs", "added.mjs"],
    snapshotDir: snapshotDir(),
  });
  assert.equal(r.ok, false);
  assert.equal(r.red.outcome, "failed");
  assert.equal(r.red.reason, "import");
  assert.match(r.problems.join("\n"), /simulate the old behaviour in place/);
  // Both files are restored all the same, the added one included.
  assert.equal(r.files[1].baseSha, null);
  assert.equal(r.files[1].matches, true);
  assert.equal(fs.readFileSync(path.join(dir, "added.mjs"), "utf8"), "export const added = 1;\n");
});

check("after the fix is committed, HEAD is the fix and --base must point at the pre-fix revision", () => {
  const dir = makeRepo();
  applyFix(dir);
  git(dir, "commit", "-q", "-am", "the fix");
  const againstHead = runRedGreen({ repoRoot: dir, test: `${NODE} check.mjs`, files: ["lib.mjs"], snapshotDir: snapshotDir() });
  assert.equal(againstHead.ok, false);
  assert.match(againstHead.problems.join("\n"), /identical to HEAD/);
  assert.match(againstHead.problems.join("\n"), /pins nothing/);
  const againstParent = runRedGreen({
    repoRoot: dir,
    test: `${NODE} check.mjs`,
    files: ["lib.mjs"],
    base: "HEAD~1",
    snapshotDir: snapshotDir(),
  });
  assert.equal(againstParent.ok, true, JSON.stringify(againstParent.problems));
});

check("classifyRedFailure tells an import death from an assertion", () => {
  assert.equal(classifyRedFailure("Error [ERR_MODULE_NOT_FOUND]: Cannot find module"), "import");
  assert.equal(classifyRedFailure("Error: Failed to resolve import \"./x\" from \"y.ts\""), "import");
  assert.equal(classifyRedFailure("AssertionError: expected 2 to be 3"), "assertion");
  assert.equal(classifyRedFailure("SyntaxError: Unexpected token"), "syntax");
});

check("parseRedGreenArgs takes several files and an optional base", () => {
  const o = parseRedGreenArgs(["--test", "npx vitest run x", "--files", "a.ts", "b.ts", "--base", "origin/main"]);
  assert.deepEqual(o, { test: "npx vitest run x", files: ["a.ts", "b.ts"], base: "origin/main" });
  assert.equal(parseRedGreenArgs(["--test", "t", "--files", "a"]).base, "HEAD");
  assert.throws(() => parseRedGreenArgs(["--bogus"]), /unknown argument/);
});

if (failures > 0) {
  console.log(`\n${failures} failing`);
  process.exit(1);
}
console.log("\nall passing");

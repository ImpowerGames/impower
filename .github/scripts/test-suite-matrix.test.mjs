// Pins the Test Suite workflow's package matrix to the set of tracked
// vitest.config.ts files. A package that gains a harness without a matrix
// entry would otherwise let every job turn green while its tests never run;
// a matrix entry with no config would fail the job at collection time.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "test-suite.yml"), "utf8");

// The matrix is the indented list under `package:`; the first line that is
// not a list item or comment ends it.
const lines = workflow.split(/\r?\n/);
const start = lines.findIndex((line) => /^\s+package:\s*$/.test(line));
assert.ok(start >= 0, "test-suite.yml declares a package matrix");
const matrix = [];
for (const line of lines.slice(start + 1)) {
  const item = /^\s+-\s+(\S+)\s*$/.exec(line);
  if (item) matrix.push(item[1]);
  else if (!/^\s*#/.test(line)) break;
}

const tracked = execFileSync("git", ["ls-files", "-z", "--", "*vitest.config.ts", "**/vitest.config.ts"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0").filter(Boolean)
  .filter((file) => !file.includes("node_modules/"))
  .map((file) => path.posix.dirname(file));

assert.ok(tracked.length > 0, "git tracks at least one vitest.config.ts");
assert.deepEqual([...matrix].sort(), [...new Set(tracked)].sort(),
  "the package matrix in test-suite.yml must list exactly the directories with a tracked vitest.config.ts");
console.log(`PASS: test-suite.yml matrix matches the ${tracked.length} tracked vitest.config.ts directories`);

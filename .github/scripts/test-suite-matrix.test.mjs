import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const workflow = fs.readFileSync(path.join(root, ".github", "workflows", "test-suite.yml"), "utf8");

const lines = workflow.split(/\r?\n/);
const start = lines.findIndex((line) => /^\s+include:\s*$/.test(line));
assert.ok(start >= 0, "test-suite.yml declares an include matrix");
const jobs = [];
for (const line of lines.slice(start + 1)) {
  const item = /^\s+-\s+\{\s*package:\s*(\S+),\s*shard:\s*(\d+),\s*shards:\s*(\d+)\s*\}\s*$/.exec(line);
  if (item) jobs.push({ package: item[1], shard: Number(item[2]), shards: Number(item[3]) });
  else if (!/^\s*#/.test(line)) break;
}
assert.ok(jobs.length > 0, "the include matrix lists at least one job");

const byPackage = new Map();
for (const job of jobs) byPackage.set(job.package, [...(byPackage.get(job.package) ?? []), job]);
const expectedShards = { "packages/sparkdown": 4, "packages/spark-engine": 2, "packages/spark-web-player": 2 };
for (const [pkg, list] of byPackage) {
  const n = list[0].shards;
  assert.ok(list.every((job) => job.shards === n), `${pkg} declares one shard count`);
  assert.deepEqual(list.map((job) => job.shard).sort((x, y) => x - y), Array.from({ length: n }, (_, i) => i + 1),
    `${pkg} lists shards 1..${n} exactly once`);
  assert.equal(n, expectedShards[pkg] ?? 1, `${pkg} runs as the agreed number of shards`);
}
const matrix = [...byPackage.keys()];

const runVitest = workflow.slice(workflow.indexOf("- name: Run vitest"), workflow.indexOf("- name: Require summary lines"));
assert.ok(runVitest.includes("- name: Run vitest"), "test-suite.yml has a Run vitest step");
assert.ok(runVitest.includes("SHARD: ${{ matrix.shard }}/${{ matrix.shards }}"), "the Run vitest step binds SHARD to the matrix shard and shards");
assert.match(runVitest, /npx vitest run [^\n]*--shard="\$SHARD"/, "the Run vitest step passes --shard=$SHARD to vitest");

const tracked = execFileSync("git", ["ls-files", "-z", "--", "*vitest.config.ts", "**/vitest.config.ts"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0").filter(Boolean)
  .filter((file) => !file.includes("node_modules/"))
  .map((file) => path.posix.dirname(file));

assert.ok(tracked.length > 0, "git tracks at least one vitest.config.ts");
assert.deepEqual([...matrix].sort(), [...new Set(tracked)].sort(),
  "the package matrix in test-suite.yml must list exactly the directories with a tracked vitest.config.ts");
console.log(`PASS: test-suite.yml matrix matches the ${tracked.length} tracked vitest.config.ts directories`);

#!/usr/bin/env node
// Type-checks every TypeScript project in the monorepo and fails if any of them
// reports an error.
//
// The list of projects is derived from the repository itself -- every tracked
// `tsconfig*.json` is checked unless it appears in IGNORED below with a reason.
// Deriving rather than enumerating is deliberate: a new workspace that arrives
// with a tsconfig is gated the day it lands, instead of quietly sitting outside
// the gate until someone remembers to add it.
//
// Usage:
//   node scripts/typecheck.mjs                 check everything
//   node scripts/typecheck.mjs --list          print the projects, check nothing
//   node scripts/typecheck.mjs sparkdown       check only projects whose path
//                                              contains "sparkdown"
//   node scripts/typecheck.mjs --jobs 4        run 4 checks concurrently
//
// Concurrency defaults to 2. Each `tsc` run is its own process holding a full
// program in memory, and the largest projects here peak above 1 GB, so raising
// this on a small machine trades wall-clock for the risk of an out-of-memory
// kill -- which surfaces as a project that "passed" without printing anything.

import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Tracked tsconfigs that are deliberately outside the gate. The value is the
// reason, printed by --list so the exclusion has to justify itself.
const IGNORED = new Map([
  [
    "admin/tsconfig.json",
    "not an npm workspace; its dependencies are never installed",
  ],
  [
    "impower-app/tsconfig.json",
    "legacy site, not an npm workspace; its dependencies are never installed",
  ],
  [
    "packages/concept-generator/tsconfig.json",
    "excluded from the workspace list in the root package.json",
  ],
  [
    "packages/impower-ui/tsconfig.json",
    "solution file; the projects it references are checked directly",
  ],
  [
    "packages/sparkdown/src/inkjs/tsconfig.json",
    "the parent project already includes these files under stricter settings",
  ],
]);

const TSC = path.join(ROOT, "node_modules", "typescript", "bin", "tsc");

function trackedProjects() {
  const out = execFileSync("git", ["ls-files", "--", "*tsconfig*.json"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((p) => path.basename(p).startsWith("tsconfig"))
    .sort();
}

function parseArgs(argv) {
  const filters = [];
  let jobs = 2;
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--list") {
      list = true;
    } else if (arg === "--jobs" || arg === "-j") {
      i += 1;
      jobs = Math.max(1, Number(argv[i]) || 1);
    } else if (arg.startsWith("--jobs=")) {
      jobs = Math.max(1, Number(arg.slice("--jobs=".length)) || 1);
    } else if (arg.startsWith("-")) {
      throw new Error(`unknown option ${arg}`);
    } else {
      filters.push(arg);
    }
  }
  return { filters, jobs: Math.min(jobs, os.availableParallelism?.() ?? 4), list };
}

function check(project) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [TSC, "--noEmit", "-p", project], {
      cwd: ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    child.on("error", (err) => {
      resolve({ project, ok: false, output: String(err), ms: Date.now() - started });
    });
    child.on("close", (code) => {
      resolve({
        project,
        ok: code === 0,
        output: output.trim(),
        ms: Date.now() - started,
      });
    });
  });
}

async function main() {
  const { filters, jobs, list } = parseArgs(process.argv.slice(2));

  const tracked = trackedProjects();
  const unknownIgnores = [...IGNORED.keys()].filter((p) => !tracked.includes(p));
  if (unknownIgnores.length > 0) {
    console.error(
      `IGNORED names ${unknownIgnores.length} path(s) that no longer exist:\n` +
        unknownIgnores.map((p) => `  ${p}`).join("\n") +
        `\nRemove them from scripts/typecheck.mjs.`
    );
    process.exitCode = 1;
    return;
  }

  let projects = tracked.filter((p) => !IGNORED.has(p));
  if (filters.length > 0) {
    projects = projects.filter((p) => filters.some((f) => p.includes(f)));
  }

  if (list) {
    console.log(`${projects.length} project(s) checked:`);
    for (const p of projects) console.log(`  ${p}`);
    console.log(`\n${IGNORED.size} project(s) not checked:`);
    for (const [p, why] of IGNORED) console.log(`  ${p}\n    ${why}`);
    return;
  }

  if (projects.length === 0) {
    console.error(`No projects matched ${filters.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  if (!existsSync(TSC)) {
    console.error(
      `TypeScript is not installed at ${TSC}. Run \`npm install\` at the repo root.`
    );
    process.exitCode = 1;
    return;
  }

  const failures = [];
  const queue = [...projects];
  const started = Date.now();

  const worker = async () => {
    for (;;) {
      const project = queue.shift();
      if (!project) return;
      const result = await check(project);
      const status = result.ok ? "ok  " : "FAIL";
      console.log(
        `${status} ${String(result.ms).padStart(6)}ms  ${result.project}`
      );
      if (!result.ok) {
        failures.push(result);
        if (result.output) console.log(result.output);
      }
    }
  };

  await Promise.all(Array.from({ length: jobs }, worker));

  const elapsed = ((Date.now() - started) / 1000).toFixed(1);
  console.log(
    `\n${projects.length - failures.length}/${projects.length} project(s) clean in ${elapsed}s`
  );
  if (failures.length > 0) {
    console.log(`Failed:\n${failures.map((f) => `  ${f.project}`).join("\n")}`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

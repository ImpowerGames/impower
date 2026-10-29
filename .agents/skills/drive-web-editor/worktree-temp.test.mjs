#!/usr/bin/env node
// Pins worktree-temp.mjs and the entry points that call it. Each entry
// point runs as a command with arguments it refuses, under a preloaded probe
// that writes the process's temp variables when it exits, so the check sees
// what every child of that entry point inherits without starting a real run.
// A scratch root shows what the redirection does: os.tmpdir() in a child
// lands in <root>/.tmp, git finds no repository from a directory made there,
// the directory ignores itself, and the machine's temp directory stays named
// for session-dir.mjs. redgreen's test command runs in the same environment.
// Node's built-in assert only.

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { SYSTEM_TEMP_VARIABLE, TEMP_VARIABLES, checkoutRoot } from "./worktree-temp.mjs";
import { runTest } from "./redgreen.mjs";
import { driverHome } from "./session-dir.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const systemTemp = process.env[SYSTEM_TEMP_VARIABLE] || os.tmpdir();
const scratch = fs.realpathSync.native(fs.mkdtempSync(path.join(systemTemp, "worktree-temp-check-")));
console.log(`Scratch directory: ${scratch}`);
let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log(`ok  ${name}`);
  } catch (error) {
    failures++;
    console.log(`FAIL ${name}\n${error.stack}`);
  }
};
const node = (args, options = {}) => spawnSync(process.execPath, args, { encoding: "utf8", windowsHide: true, timeout: 120_000, ...options });
const sameDir = (a, b) => (process.platform === "win32" ? path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase() : path.resolve(a) === path.resolve(b));
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== SYSTEM_TEMP_VARIABLE && key !== "GIT_CEILING_DIRECTORIES"));
for (const name of TEMP_VARIABLES) baseEnv[name] = systemTemp;

try {
  const probe = path.join(scratch, "probe.mjs");
  fs.writeFileSync(probe, [
    'import fs from "node:fs";',
    "process.on(\"exit\", () => fs.writeFileSync(process.env.WORKTREE_TEMP_PROBE, JSON.stringify({ TEMP: process.env.TEMP, TMP: process.env.TMP, TMPDIR: process.env.TMPDIR, system: process.env.IMPOWER_SYSTEM_TMPDIR, ceiling: process.env.GIT_CEILING_DIRECTORIES })));",
    "",
  ].join("\n"));
  const expected = path.join(checkoutRoot, ".tmp");
  const entryPoints = [
    ["scripts/test-suite.mjs", []],
    ["scripts/check-agent-tooling.mjs", ["--tier", "none"]],
    ["scripts/agent-handoff.mjs", ["recover-lock"]],
    ["scripts/filer-worktree.mjs", ["--no-such-option"]],
    [".agents/skills/drive-vscode-web/driver.mjs", ["no-such-command"]],
  ];
  for (const [file, args] of entryPoints) {
    check(`${file} runs with TEMP, TMP and TMPDIR at its checkout's .tmp and keeps the machine's temp directory named`, () => {
      const out = path.join(scratch, `${path.basename(file)}.json`);
      const r = node(["--import", pathToFileURL(probe).href, path.join(checkoutRoot, file), ...args], { cwd: checkoutRoot, env: { ...baseEnv, WORKTREE_TEMP_PROBE: out } });
      assert.ok(fs.existsSync(out), `the probe wrote nothing (exit ${r.status}): ${r.stdout}${r.stderr}`);
      const seen = JSON.parse(fs.readFileSync(out, "utf8"));
      for (const name of TEMP_VARIABLES) assert.ok(sameDir(seen[name], expected), `${name} is ${seen[name]}, not ${expected}`);
      assert.ok(sameDir(seen.system, systemTemp), `${SYSTEM_TEMP_VARIABLE} is ${seen.system}, not ${systemTemp}`);
      assert.ok(seen.ceiling?.split(path.delimiter).some((d) => sameDir(d, expected)), `GIT_CEILING_DIRECTORIES is ${seen.ceiling}`);
    });
  }

  const root = path.join(scratch, "checkout");
  fs.mkdirSync(root);
  const child = path.join(scratch, "child.mjs");
  fs.writeFileSync(child, [
    'import { spawnSync } from "node:child_process";',
    'import fs from "node:fs";',
    'import os from "node:os";',
    'import path from "node:path";',
    `const { useWorktreeTemp } = await import(${JSON.stringify(pathToFileURL(path.join(here, "worktree-temp.mjs")).href)});`,
    `const { driverHome } = await import(${JSON.stringify(pathToFileURL(path.join(here, "session-dir.mjs")).href)});`,
    "useWorktreeTemp(process.argv[2]);",
    'const grandchild = spawnSync(process.execPath, ["-e", "const fs = require(\'node:fs\'), os = require(\'node:os\'), path = require(\'node:path\'); const d = fs.mkdtempSync(path.join(os.tmpdir(), \'x-\')); const g = require(\'node:child_process\').spawnSync(\'git\', [\'rev-parse\', \'--show-toplevel\'], { cwd: d, encoding: \'utf8\', windowsHide: true }); console.log(JSON.stringify({ tmp: os.tmpdir(), made: d, git: g.status }));"], { encoding: "utf8", windowsHide: true });',
    "const env = { ...process.env }; delete env.LOCALAPPDATA; delete env.IMPOWER_DRIVER_HOME;",
    "console.log(JSON.stringify({ ...JSON.parse(grandchild.stdout), driverHome: driverHome(env) }));",
    "",
  ].join("\n"));
  // The scratch root sits in a git repository of its own, so a directory made
  // under its .tmp would resolve to it without the ceiling.
  spawnSync("git", ["init", "-q", root], { windowsHide: true });

  check("a child of a redirected process makes its temp directories under <root>/.tmp, which git sees no repository in and status never lists", () => {
    const r = node([child, root], { env: baseEnv });
    assert.equal(r.status, 0, r.stderr);
    const seen = JSON.parse(r.stdout.trim().split(/\r?\n/).pop());
    assert.ok(sameDir(seen.tmp, path.join(root, ".tmp")), `the grandchild's os.tmpdir() is ${seen.tmp}`);
    assert.ok(sameDir(path.dirname(seen.made), path.join(root, ".tmp")), `the grandchild made ${seen.made}`);
    assert.notEqual(seen.git, 0, "git resolved the scratch directory to the checkout around it");
    assert.equal(fs.readFileSync(path.join(root, ".tmp", ".gitignore"), "utf8"), "*\n");
    const status = spawnSync("git", ["status", "--porcelain", "--untracked-files=all"], { cwd: root, encoding: "utf8", windowsHide: true });
    assert.equal(status.stdout, "", `git status lists the scratch: ${status.stdout}`);
    assert.ok(sameDir(seen.driverHome, path.join(systemTemp, "impower-driver")), `the driver home without LOCALAPPDATA moved into the checkout: ${seen.driverHome}`);
  });

  check("redgreen runs its test command with the repository's .tmp as its temp directory", () => {
    const r = runTest(`"${process.execPath.split(path.sep).join("/")}" -e "console.log(require('node:os').tmpdir())"`, root);
    assert.equal(r.exit, 0, r.output);
    assert.ok(r.tail.some((line) => sameDir(line.trim(), path.join(root, ".tmp"))), `the test command saw ${r.tail.join(", ")}`);
  });

  check("the driver home stays outside every checkout", () => {
    assert.ok(!driverHome().toLowerCase().startsWith(checkoutRoot.toLowerCase()), driverHome());
  });
} finally {
  fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

if (failures) {
  console.log(`${failures} failed`);
  process.exitCode = 1;
} else console.log("all passed");

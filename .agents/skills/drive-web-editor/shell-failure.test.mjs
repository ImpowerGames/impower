import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyRedFailure, runTest, testShell } from "./redgreen.mjs";

const WIN = process.platform === "win32";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-failure-"));
console.log(`Scratch shell fixtures: ${dir}`);
const node = `"${process.execPath}"`;
try {
  // These diagnostic controls run on both platforms; the live probes below
  // establish what the installed shells actually emit.
  for (const output of ["/bin/sh: 1: absent: not found", "/bin/bash: line 1: absent: command not found", "/bin/sh: 1: ./script: Permission denied"]) {
    assert.equal(classifyRedFailure(output), "shell");
  }
  const shells = WIN ? [testShell(), process.env.ComSpec || "cmd.exe"] : ["/bin/sh", "bash"];
  if (WIN) console.log("SKIP: execute-permission probes (POSIX only: executable mode bits)");
  for (const shell of shells) {
    for (const command of ["impower_command_that_does_not_exist_507", "./absent-command-507"]) {
      const result = runTest(command, dir, shell);
      assert.equal(result.launchError, null, `Required interpreter ${shell} could not start: ${result.launchError}`);
      assert.notEqual(result.exit, 0);
      assert.equal(classifyRedFailure(result.output), "shell", result.output);
      console.log(`PASS: ${shell} refuses ${command} (exit ${result.exit})`);
    }
    fs.writeFileSync(path.join(dir, "assertion.mjs"), 'console.error("AssertionError: expected ENOENT: Permission denied to be handled"); process.exit(1);');
    const assertion = runTest(`${node} assertion.mjs`, dir, shell);
    assert.equal(classifyRedFailure(assertion.output), "assertion");
    fs.writeFileSync(path.join(dir, "child-report.mjs"), 'import { spawnSync } from "node:child_process"; import assert from "node:assert/strict"; const r = spawnSync("impower_missing_child_507", { shell: true, encoding: "utf8" }); process.stderr.write(r.stderr || ""); assert.equal(r.status, 0);');
    const childReport = runTest(`${node} child-report.mjs`, dir, shell);
    assert.equal(childReport.exit, 1, childReport.output);
    assert.equal(classifyRedFailure(childReport.output, childReport), "assertion", childReport.output);
    console.log(`PASS: ${shell} preserves a real assertion after a child's shell diagnostic`);
    if (!WIN) {
      fs.writeFileSync(path.join(dir, "not-executable"), "#!/bin/sh\nexit 0\n", { mode: 0o600 });
      const denied = runTest("./not-executable", dir, shell);
      assert.equal(denied.exit, 126, denied.output);
      assert.equal(classifyRedFailure(denied.output), "shell", denied.output);
      console.log(`PASS: ${shell} refuses a file without execute permission`);
    }
  }
  const missing = runTest("echo hello", dir, path.join(dir, "missing-shell"));
  assert.equal(missing.launchError, "ENOENT");
  assert.equal(classifyRedFailure(missing.output, missing), "shell");
  for (const message of ["ENOENT", "Permission denied", "/bin/sh: 1: absent: not found"]) {
    assert.equal(classifyRedFailure(`AssertionError: expected '${message}' to be handled`), "assertion");
    assert.equal(classifyRedFailure(`${message}\nAssertionError: expected a handled diagnostic`, { exit: 1 }), "assertion");
  }
  const mixed = "AssertionError: expected a handled diagnostic\n/bin/sh: 1: absent: not found";
  assert.equal(classifyRedFailure(mixed, { exit: 127 }), "shell", "an outer shell execution failure is not hidden by earlier assertions");
  const locale = { LANG: process.env.LANG, LC_ALL: process.env.LC_ALL };
  try {
    process.env.LANG = "impower-locale-probe";
    process.env.LC_ALL = "C.UTF-8";
    fs.writeFileSync(path.join(dir, "locale.mjs"), 'console.log(JSON.stringify({ LANG: process.env.LANG, LC_ALL: process.env.LC_ALL }));');
    const result = runTest(`${node} locale.mjs`, dir);
    assert.equal(result.exit, 0, result.output);
    assert.ok(result.output.includes('"LANG":"impower-locale-probe"'), result.output);
    assert.ok(result.output.includes('"LC_ALL":"C.UTF-8"'), result.output);
  } finally {
    for (const [key, value] of Object.entries(locale)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
  console.log("PASS: shell launch errors and legitimate assertion failures remain distinct");
} finally {
  console.log(`Remove scratch shell fixtures: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { classifyRedFailure, runTest, testShell } from "./redgreen.mjs";

const WIN = process.platform === "win32";
const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-failure-"));
console.log(`Scratch shell fixtures: ${dir}`);
const node = `"${process.execPath}"`;
const originalComSpec = process.env.ComSpec;
const cmdShell = WIN && process.env.SystemRoot ? path.join(process.env.SystemRoot, "System32", "cmd.exe") : "cmd.exe";
try {
  // These fixtures exercise cmd, including Node's shell:true route. A custom
  // ComSpec is not evidence about cmd; pin this child process's fixture only.
  if (WIN) {
    process.env.ComSpec = cmdShell;
    console.log(`Fixture ComSpec: ${cmdShell} (restored after checks)`);
  }
  // These diagnostic controls run on both platforms; the live probes below
  // establish what the installed shells actually emit.
  for (const output of ["/bin/sh: 1: absent: not found", "/bin/bash: line 1: absent: command not found", "/bin/sh: 1: ./script: Permission denied"]) {
    assert.equal(classifyRedFailure(output), "shell");
  }
  const shells = WIN ? [testShell(), cmdShell, true] : ["/bin/sh", "bash", true];
  if (WIN) console.log("SKIP: execute-permission probes (POSIX only: executable mode bits)");
  for (const shell of shells) {
    for (const command of ["impower_command_that_does_not_exist_507", "./absent-command-507"]) {
      const result = runTest(command, dir, shell);
      assert.equal(result.launchError, null, `Required interpreter ${shell} could not start: ${result.launchError}`);
      assert.notEqual(result.exit, 0);
      assert.equal(classifyRedFailure(result.output, result), "shell", result.output);
      console.log(`PASS: ${shell} refuses ${command} (exit ${result.exit})`);
    }
    fs.writeFileSync(path.join(dir, "assertion.mjs"), 'console.error("AssertionError: expected ENOENT: Permission denied to be handled"); process.exit(1);');
    const assertion = runTest(`${node} assertion.mjs`, dir, shell);
    assert.equal(classifyRedFailure(assertion.output), "assertion");
    fs.writeFileSync(path.join(dir, "child-report.mjs"), 'import { spawnSync } from "node:child_process"; import assert from "node:assert/strict"; const r = spawnSync("impower_missing_child_507", { shell: true, encoding: "utf8" }); process.stderr.write(r.stderr || ""); assert.equal(r.status, 0);');
    const childReport = runTest(`${node} child-report.mjs`, dir, shell);
    assert.equal(childReport.exit, 1, childReport.output);
    assert.equal(classifyRedFailure(childReport.output, childReport), "unknown", childReport.output);
    // Exercise the competing provenance, not just synthetic diagnostic text.
    const isCmd = WIN && (shell === true || /cmd(?:\.exe)?$/i.test(String(shell)));
    const separator = isCmd ? "&" : ";";
    const chain = runTest(`${node} assertion.mjs ${separator} impower_command_that_does_not_exist_507`, dir, shell);
    assert.equal(classifyRedFailure(chain.output, chain), "unknown");
    assert.equal(chain.posixShell, !isCmd);
    fs.writeFileSync(path.join(dir, "partial.mjs"), 'process.stdout.write("FAIL src/a.test.ts");');
    const partial = runTest(`${node} partial.mjs ${separator} impower_command_that_does_not_exist_507`, dir, shell);
    assert.equal(classifyRedFailure(partial.output, partial), "unknown");
    assert.match(partial.output, /FAIL src\/a\.test\.ts\n/);
    const redirected = runTest(`${node} partial.mjs ${separator} impower_command_that_does_not_exist_507 2>&1 ${separator} exit ${isCmd ? "/b " : ""}1`, dir, shell);
    assert.equal(redirected.exit, 1);
    assert.equal(classifyRedFailure(redirected.output, redirected), "unknown");
    fs.writeFileSync(path.join(dir, "count.mjs"), 'console.error("127 failing"); process.exit(127);');
    const count = runTest(`${node} count.mjs`, dir, shell);
    assert.equal(count.exit, 127);
    assert.equal(classifyRedFailure(count.output, count), isCmd ? "assertion" : "unknown");
    console.log(`PASS: ${shell} refuses automatic proof for mixed shell/assertion output (child and command chain)`);
    if (!WIN) {
      fs.writeFileSync(path.join(dir, "not-executable"), "#!/bin/sh\nexit 0\n", { mode: 0o600 });
      const denied = runTest("./not-executable", dir, shell);
      assert.equal(denied.exit, 126, denied.output);
      assert.equal(classifyRedFailure(denied.output, denied), "shell", denied.output);
      console.log(`PASS: ${shell} refuses a file without execute permission`);
    }
  }
  const missing = runTest("echo hello", dir, path.join(dir, "missing-shell"));
  assert.equal(missing.launchError, "ENOENT");
  assert.equal(classifyRedFailure(missing.output, missing), "shell");
  fs.writeFileSync(path.join(dir, "overflow.mjs"), 'import fs from "node:fs"; fs.writeSync(1, "x".repeat(65536));');
  const overflow = runTest(`${node} overflow.mjs`, dir, WIN ? cmdShell : "/bin/sh", { maxBuffer: 1024 });
  assert.equal(overflow.launchError, "ENOBUFS");
  assert.equal(classifyRedFailure(overflow.output, overflow), "crash");
  console.log("PASS: a real output-buffer overflow is a crash, not regression evidence");
  for (const message of ["ENOENT", "Permission denied", "/bin/sh: 1: absent: not found"]) {
    assert.equal(classifyRedFailure(`AssertionError: expected '${message}' to be handled`), "assertion");
    assert.equal(classifyRedFailure(`${message}\nAssertionError: expected a handled diagnostic`, { exit: 1 }), message.startsWith("/bin/sh") ? "unknown" : "assertion");
  }
  const mixed = "AssertionError: expected a handled diagnostic\n/bin/sh: 1: absent: not found";
  assert.equal(classifyRedFailure(mixed, { exit: 127, posixShell: true }), "unknown", "a reserved status does not establish diagnostic provenance");
  assert.equal(classifyRedFailure("", { launchError: "EPERM", exit: -1 }), "unknown");
  assert.equal(classifyRedFailure("unrecognized failure", { exit: 127, posixShell: false }), "unknown");
  assert.equal(classifyRedFailure("  'npx' is not recognized as an internal or external command,", { exit: 1 }), "shell");
  for (const quoted of ["'npx' is not recognized as an internal or external command,", 'npm error Missing script: "test"']) {
    assert.equal(classifyRedFailure(`AssertionError: expected '${quoted}' to be handled`), "assertion");
    assert.equal(classifyRedFailure(`FAIL src/a.test.ts${quoted}`, { exit: 1 }), "unknown");
  }
  for (const output of [
    "'absent' is not recognized as an internal or external command,\noperable program or batch file.",
    'npm error Missing script: "test"',
    "/bin/sh: 1: absent: not found",
  ]) {
    for (const assertion of ["AssertionError: expected 1 to be 0", "\x1b[31mAssertionError\x1b[39m: mismatch", "Tests  1 failed", "expect(received).toBe(expected)", "127 failing", "FAIL src/a.test.ts", "× should work"]) {
      for (const combined of [`${output}\n${assertion}`, `${assertion}\n${output}`]) {
        assert.equal(classifyRedFailure(combined, { exit: 1 }), "unknown", combined);
        assert.equal(classifyRedFailure(combined, { exit: -1 }), "crash", combined);
      }
    }
  }
  assert.equal(classifyRedFailure("\x1b[31mAssertionError\x1b[39m: mismatch", { exit: 1 }), "assertion");
  for (const output of ["bash : ligne 1 : absent : commande introuvable", "bash: Zeile 1: absent: Kommando nicht gefunden."]) {
    for (const exit of [126, 127]) {
      assert.equal(classifyRedFailure(output, { exit, posixShell: true }), "shell");
      assert.equal(classifyRedFailure(`AssertionError: mismatch\n${output}`, { exit, posixShell: true }), "unknown");
    }
  }
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
  if (WIN) {
    if (originalComSpec === undefined) delete process.env.ComSpec;
    else process.env.ComSpec = originalComSpec;
  }
  console.log(`Remove scratch shell fixtures: ${dir}`);
  fs.rmSync(dir, { recursive: true, force: true });
}

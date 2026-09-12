import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "impower-check-discovery-"));
console.log(`Scratch repository: ${scratch}`);
spawnSync("git", ["init", scratch], { windowsHide: true });
for (const file of ["scripts/check-agent-tooling.mjs", ".agents/skills/drive-web-editor/redgreen.mjs"]) {
  fs.mkdirSync(path.dirname(path.join(scratch, file)), { recursive: true });
  fs.copyFileSync(path.join(root, file), path.join(scratch, file));
}
const put = (name, content) => { fs.mkdirSync(path.dirname(path.join(scratch, name)), { recursive: true }); fs.writeFileSync(path.join(scratch, name), content); };
const summaryPath = path.join(scratch, "summary.md");
const run = (extraEnv = {}) => spawnSync(process.execPath, ["scripts/check-agent-tooling.mjs"], { cwd: scratch, encoding: "utf8", windowsHide: true, timeout: 45000, env: { ...process.env, GITHUB_STEP_SUMMARY: summaryPath, ...extraEnv } });
assert.notEqual(run().status, 0, "empty discovery must fail");
for (const file of [".agents/skills/a test.test.mjs", ".agents/hooks/policy.test.mjs", ".claude/hooks/hook.test.mjs", "scripts/link-agent-skills.test.mjs"]) put(file, 'console.log("fixture passed");');
const expected = Number(fs.readFileSync(path.join(root, "scripts/check-agent-tooling.mjs"), "utf8").match(/EXPECTED_CHECKS = (\d+)/)[1]);
for (let i = 0; i < expected - 4; i++) put(`.agents/skills/coverage-${i}.test.mjs`, 'console.log("fixture passed");');
spawnSync("git", ["add", "."], { cwd: scratch, windowsHide: true });
assert.equal(run().status, 0, "tracked checks including spaces must run");
const complete = run();
assert.equal((complete.stdout.match(/^DONE:/gm) || []).length, expected, "every check has a completion result");
assert.match(complete.stdout, /0 not run/);
assert.notEqual(run({ AGENT_TOOLING_BASH: path.join(scratch, "missing-bash") }).status, 0, "invalid explicit Bash must fail before running checks");
put(".agents/skills/coverage-2.test.mjs", 'import { execFileSync } from "node:child_process"; import assert from "node:assert/strict"; assert.equal(execFileSync("bash", ["-c", "printf nested-bash"], { encoding: "utf8" }), "nested-bash");');
assert.equal(run().status, 0, "nested Node checks inherit working Bash");
spawnSync("git", ["rm", "--cached", ".agents/skills/coverage-3.test.mjs"], { cwd: scratch, windowsHide: true });
put(".github/scripts/fixture.test.mjs", 'console.log("github coverage");');
spawnSync("git", ["add", ".github/scripts/fixture.test.mjs"], { cwd: scratch, windowsHide: true });
const github = run();
assert.equal(github.status, 0, github.stderr);
assert.match(github.stdout, /DONE: .github\/scripts\/fixture.test.mjs: passed/);
put(".github/scripts/fixture.test.mjs", 'process.exitCode = 1;');
assert.notEqual(run().status, 0, "GitHub script failure reaches the aggregate");
put(".github/scripts/fixture.test.mjs", 'console.log("github coverage");');
put(".agents/skills/coverage-4.test.mjs", 'import fs from "node:fs"; import { spawn } from "node:child_process"; const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "inherit" }); fs.writeFileSync("child.pid", String(child.pid)); setInterval(() => {}, 1000);');
const hung = run({ AGENT_TOOLING_TIMEOUT_MS: "1000" });
assert.equal(hung.status, 1, hung.stderr);
assert.match(hung.stdout, /coverage-4.test.mjs: timed out/);
assert.match(hung.stdout, /NOT RUN: scripts\/link-agent-skills.test.mjs/);
assert.match(hung.stderr, /ABORT: timed-out check requires inspection/);
const descendant = Number(fs.readFileSync(path.join(scratch, "child.pid"), "utf8"));
const exited = (pid = descendant) => {
  try {
    process.kill(pid, 0);
    // Linux can retain an exited orphan as a zombie until its new parent reaps it.
    return process.platform === "linux" && /\) Z /.test(fs.readFileSync(`/proc/${pid}/stat`, "utf8"));
  } catch (error) {
    if (["ESRCH", "ENOENT"].includes(error.code)) return true;
    throw error;
  }
};
const deadline = Date.now() + 5000;
while (!exited() && Date.now() < deadline) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 20);
assert.ok(exited(), "timed-out child must actually exit");
put(".agents/skills/coverage-4.test.mjs", 'import fs from "node:fs"; import { spawn } from "node:child_process"; const child = spawn(process.execPath, ["-e", "setTimeout(() => {}, 2200)"], { stdio: "inherit" }); fs.writeFileSync("early-child.pid", String(child.pid)); process.exit(0);');
const earlyExit = run({ AGENT_TOOLING_TIMEOUT_MS: "1000" });
if (process.platform === "win32") {
  // Windows closes these inherited pipe handles with the parent. This is not
  // proof of descendant cleanup; the fixture independently expires below.
  assert.equal(earlyExit.status, 0, earlyExit.stderr);
} else {
  assert.equal(earlyExit.status, 1, earlyExit.stderr);
  assert.match(earlyExit.stderr, /ABORT: cleanup was not confirmed/);
  assert.match(earlyExit.stdout, /NOT RUN: scripts\/link-agent-skills.test.mjs/);
}
assert.ok(exited(Number(fs.readFileSync(path.join(scratch, "early-child.pid"), "utf8"))), "self-terminating orphan fixture has exited");
put(".agents/skills/coverage-4.test.mjs", 'console.log("fixture passed");');
put(".agents/skills/coverage-0.test.mjs", 'console.log("SKIP: unavailable fixture");');
assert.equal(run().status, 0);
assert.match(fs.readFileSync(summaryPath, "utf8"), /SKIP: unavailable fixture/);
assert.match(fs.readFileSync(summaryPath, "utf8"), /Portable extension fixtures, shell classification, directory-link access and launcher-tree shutdown run in both matrix legs/);
put(".agents/skills/extra.test.mjs", 'console.log("extra");');
spawnSync("git", ["add", ".agents/skills/extra.test.mjs"], { cwd: scratch, windowsHide: true });
assert.notEqual(run().status, 0, "adding checks must require an inventory-count update");
assert.equal(spawnSync("git", ["rm", "--cached", ".agents/skills/extra.test.mjs"], { cwd: scratch, windowsHide: true }).status, 0);
fs.unlinkSync(path.join(scratch, ".agents/skills/extra.test.mjs"));
assert.equal(spawnSync("git", ["rm", "--cached", ".agents/skills/coverage-1.test.mjs"], { cwd: scratch, windowsHide: true }).status, 0);
assert.notEqual(run().status, 0, "losing a tracked check must fail the coverage floor");
spawnSync("git", ["add", ".agents/skills/coverage-1.test.mjs"], { cwd: scratch, windowsHide: true });
put(".agents/skills/unknown.test.py", "print('must not be silently skipped')");
spawnSync("git", ["add", "."], { cwd: scratch, windowsHide: true });
assert.notEqual(run().status, 0, "unsupported check extension must fail");
spawnSync("git", ["rm", "--cached", ".agents/skills/unknown.test.py"], { cwd: scratch, windowsHide: true });
put(".agents/skills/a test.test.mjs", "process.exitCode = 1;");
assert.notEqual(run().status, 0, "failed check must fail the aggregate");
fs.unlinkSync(path.join(scratch, ".agents/skills/a test.test.mjs"));
assert.notEqual(run().status, 0, "missing sparse-checkout entry must fail");
console.log("PASS: empty, unsupported, failing and missing checks fail; tracked paths with spaces execute");

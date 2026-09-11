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
const run = () => spawnSync(process.execPath, ["scripts/check-agent-tooling.mjs"], { cwd: scratch, encoding: "utf8", windowsHide: true });
assert.notEqual(run().status, 0, "empty discovery must fail");
for (const file of [".agents/skills/a test.test.mjs", ".claude/hooks/hook.test.mjs", "scripts/link-agent-skills.test.mjs"]) put(file, 'console.log("fixture passed");');
spawnSync("git", ["add", "."], { cwd: scratch, windowsHide: true });
assert.equal(run().status, 0, "tracked checks including spaces must run");
put(".agents/skills/unknown.test.py", "print('must not be silently skipped')");
spawnSync("git", ["add", "."], { cwd: scratch, windowsHide: true });
assert.notEqual(run().status, 0, "unsupported check extension must fail");
spawnSync("git", ["rm", "--cached", ".agents/skills/unknown.test.py"], { cwd: scratch, windowsHide: true });
put(".agents/skills/a test.test.mjs", "process.exitCode = 1;");
assert.notEqual(run().status, 0, "failed check must fail the aggregate");
fs.unlinkSync(path.join(scratch, ".agents/skills/a test.test.mjs"));
assert.notEqual(run().status, 0, "missing sparse-checkout entry must fail");
console.log("PASS: empty, unsupported, failing and missing checks fail; tracked paths with spaces execute");

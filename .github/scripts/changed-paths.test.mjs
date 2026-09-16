// Checks the pattern matching that decides whether a workflow's real jobs run,
// and the CLI's output line, against a scratch repository.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { patternToRegExp, relevantFiles } from "./changed-paths.mjs";

const script = fileURLToPath(new URL("./changed-paths.mjs", import.meta.url));

const cases = [
  ["packages/**", "packages/sparkdown/src/a.ts", true],
  ["packages/**", "packages", false],
  ["packages/**", "impower-dev/test/a.ts", false],
  ["**/*.ts", "a.ts", true],
  ["**/*.ts", "packages/x/y/a.ts", true],
  ["**/*.ts", "packages/x/y/a.tsx", false],
  ["**/tsconfig*.json", "vscode-sparkdown/tsconfig.build.json", true],
  ["package.json", "package.json", true],
  ["package.json", "packages/jsonrpc/package.json", false],
  [".agents/**", ".agents/skills/review-pr/SKILL.md", true],
  ["scripts/agent-notification-alerts/**", "scripts/agent-notification-alerts/index.mjs", true],
  ["scripts/agent-notification-alerts/**", "scripts/typecheck.mjs", false],
  ["packages/sparkdown/language/sparkdown.language-grammar.json", "packages/sparkdown/language/sparkdown.language-grammar.json", true],
  ["packages/sparkdown/language/sparkdown.language-grammar.json", "packages/sparkdown/language/sparkdownXlanguage-grammar.json", false],
];
for (const [pattern, file, expected] of cases) {
  assert.equal(patternToRegExp(pattern).test(file), expected, `${pattern} against ${file}`);
}
assert.deepEqual(relevantFiles(["README.md", "packages/a.ts", "docs/b.md"], ["packages/**", "**/*.mjs"]), ["packages/a.ts"]);
assert.deepEqual(relevantFiles(["README.md"], ["packages/**"]), []);
console.log("PASS: workflow filter patterns match the same files as the trigger syntax");

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "changed-paths-"));
const git = (...args) => execFileSync("git", args, { cwd: scratch, encoding: "utf8", windowsHide: true });
git("init", "-q", "-b", "main");
git("config", "user.email", "check@example.invalid");
git("config", "user.name", "check");
fs.mkdirSync(path.join(scratch, "packages"));
fs.writeFileSync(path.join(scratch, "README.md"), "base\n");
fs.writeFileSync(path.join(scratch, "packages", "a.ts"), "base\n");
git("add", "."); git("commit", "-q", "-m", "base");
git("checkout", "-q", "-b", "topic");
fs.writeFileSync(path.join(scratch, "README.md"), "docs only\n");
git("commit", "-q", "-am", "docs");
const run = (...patterns) => execFileSync(process.execPath, [script, "main", "topic", ...patterns], { cwd: scratch, encoding: "utf8", windowsHide: true });
assert.match(run("packages/**"), /relevant=false/);
assert.match(run("**/*.md"), /relevant=true/);
const output = path.join(scratch, "output.txt");
execFileSync(process.execPath, [script, "main", "topic", "README.md"], { cwd: scratch, encoding: "utf8", windowsHide: true, env: { ...process.env, GITHUB_OUTPUT: output } });
assert.equal(fs.readFileSync(output, "utf8"), "relevant=true\n");
const list = path.join(scratch, "files.txt");
fs.writeFileSync(list, "README.md\r\n.agents/skills/a/SKILL.md\n\n");
assert.match(execFileSync(process.execPath, [script, "--files", list, ".agents/**"], { cwd: scratch, encoding: "utf8", windowsHide: true }), /1 match[\s\S]*relevant=true/);
assert.match(execFileSync(process.execPath, [script, "--files", list, "packages/**"], { cwd: scratch, encoding: "utf8", windowsHide: true }), /relevant=false/);
let failed = false;
try { execFileSync(process.execPath, [script, "main"], { cwd: scratch, encoding: "utf8", windowsHide: true, stdio: "pipe" }); } catch (error) { failed = error.status === 2; }
assert.ok(failed, "missing arguments exit 2");
fs.rmSync(scratch, { recursive: true, force: true });
console.log("PASS: CLI reports relevant=true only when a changed file matches, and writes GITHUB_OUTPUT when set");

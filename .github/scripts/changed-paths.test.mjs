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
  // GitHub's documented examples: `?` and `+` quantify the preceding character,
  // `[]` is a character class, and `**` spans directories anywhere.
  ["*.jsx?", "page.js", true],
  ["*.jsx?", "page.jsx", true],
  ["*.jsx?", "page.jsxx", false],
  ["**/*.js+", "src/app.jss", true],
  ["**/*.js+", "src/app.j", false],
  ["**/migrate-*.sql", "db/migrate-v1.0.sql", true],
  ["*.[jt]s", "a.ts", true],
  ["*.[jt]s", "a.cs", false],
  ["**", "any/depth/file.txt", true],
  ["docs/**", "docs", false],
  ["docs/**", "docs/", true],
  ["README.md", "READMEXmd", false],
  ["scripts/*.mjs", "scripts/a.mjs", true],
  ["scripts/*.mjs", "scripts/sub/a.mjs", false],
];
for (const [pattern, file, expected] of cases) {
  assert.equal(patternToRegExp(pattern).test(file), expected, `${pattern} against ${file}`);
}
assert.throws(() => patternToRegExp("a[bc"), /Unterminated/);
assert.deepEqual(relevantFiles(["README.md", "packages/a.ts", "docs/b.md"], ["packages/**", "**/*.mjs"]), ["packages/a.ts"]);
assert.deepEqual(relevantFiles(["README.md"], ["packages/**"]), []);
// Ordered negation, as in GitHub's `sub-project/**` then `!sub-project/docs/**`
// example: the last matching pattern decides, and a later positive can
// re-include.
assert.deepEqual(relevantFiles(["sub-project/index.js", "sub-project/docs/readme.md", "sub-project/docs/keep.md"],
  ["sub-project/**", "!sub-project/docs/**", "sub-project/docs/keep.md"]), ["sub-project/index.js", "sub-project/docs/keep.md"]);
assert.deepEqual(relevantFiles(["a.md"], ["!a.md"]), []);
console.log("PASS: workflow filter patterns match the same files as the trigger syntax, including ?, +, [], ** and ordered negation");

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
// A GitHub runner exports GITHUB_OUTPUT to every process; the CLI cases below
// must not append to the real one, so it is removed from the child environment.
const { GITHUB_OUTPUT: _ignored, ...cleanEnv } = process.env;
const cli = (args, extra = {}) => execFileSync(process.execPath, [script, ...args], { cwd: scratch, encoding: "utf8", windowsHide: true, env: cleanEnv, ...extra });
const run = (...patterns) => cli(["main", "topic", ...patterns]);
assert.match(run("packages/**"), /relevant=false/);
assert.match(run("**/*.md"), /relevant=true/);
const output = path.join(scratch, "output.txt");
assert.match(cli(["main", "topic", "README.md"], { env: { ...cleanEnv, GITHUB_OUTPUT: output } }), /relevant=true/);
assert.equal(fs.readFileSync(output, "utf8"), "relevant=true\n");
const list = path.join(scratch, "files.txt");
fs.writeFileSync(list, "README.md\r\n.agents/skills/a/SKILL.md\n\n");
assert.match(cli(["--files", list, ".agents/**"]), /1 match[\s\S]*relevant=true/);
assert.match(cli(["--files", list, "packages/**"]), /relevant=false/);
// A renamed file is listed under both paths by the workflow, so moving a file
// out of a watched tree still matches the old path.
fs.writeFileSync(list, "docs/a.md\npackages/sparkdown/src/a.ts\n");
assert.match(cli(["--files", list, "packages/**"]), /relevant=true/);
// A listing at the endpoint's cap may be incomplete and counts as relevant.
fs.writeFileSync(list, Array.from({ length: 300 }, (_, i) => `docs/${i}.md`).join("\n") + "\n");
assert.match(cli(["--files", list, "--limit", "300", "packages/**"]), /may be incomplete[\s\S]*relevant=true/);
assert.match(cli(["--files", list, "--limit", "301", "packages/**"]), /relevant=false/);
// The cap applies to file records, not paths: 150 renames list 300 paths but
// are 150 records, well under the compare endpoint's 300, so the listing is
// complete and a docs-only push stays irrelevant.
fs.writeFileSync(list, Array.from({ length: 150 }, (_, i) => `docs/new-${i}.md\ndocs/old-${i}.md`).join("\n") + "\n");
assert.match(cli(["--files", list, "--count", "150", "--limit", "300", "packages/**"]), /relevant=false/);
assert.match(cli(["--files", list, "--count", "300", "--limit", "300", "packages/**"]), /may be incomplete[\s\S]*relevant=true/);
let failed = false;
try { cli(["main"], { stdio: "pipe" }); } catch (error) { failed = error.status === 2; }
assert.ok(failed, "missing arguments exit 2");
fs.rmSync(scratch, { recursive: true, force: true });
console.log("PASS: CLI reports relevant=true only when a changed file matches, and writes GITHUB_OUTPUT when set");

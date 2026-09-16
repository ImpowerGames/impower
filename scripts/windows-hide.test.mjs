// Every process started by agent tooling passes `windowsHide: true`. Agents run
// these scripts from processes without a visible console, and on Windows a
// console child of such a process otherwise opens its own window, which
// flashes on screen and takes keyboard focus.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const call = /\b(spawn|spawnSync|execFile|execFileSync|execSync|exec|fork)\s*\(/g;

// The source text of a call's arguments, from the opening parenthesis to its
// matching close. Strings, template literals and regex-free code are enough
// for the scanned scripts.
function argumentsAt(text, open) {
  let depth = 0;
  let quote = null;
  for (let i = open; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "(") depth++;
    else if (c === ")" && --depth === 0) return text.slice(open + 1, i);
  }
  return text.slice(open + 1);
}

export function unhiddenCalls(text) {
  const found = [];
  for (const m of text.matchAll(call)) {
    const before = text.slice(0, m.index);
    // Method calls such as `regex.exec(line)` and definitions are not process starts.
    if (/[.\w]$/.test(before) && !/\bio\.$|\bchildProcess\.$|\bchild_process\.$|\bcp\.$/.test(before)) continue;
    if (/\bfunction\s*$|^\s*$/.test(before.slice(before.lastIndexOf("\n") + 1)) && /\)\s*\{/.test(text.slice(m.index, m.index + 200).split("\n")[0])) continue;
    // A call that forwards options built by an already-checked caller carries this marker.
    if (/\/\* windows-hide: caller \*\/\s*$/.test(before.replace(/(?:\w+\.)+$/, ""))) continue;
    const args = argumentsAt(text, m.index + m[0].length - 1);
    if (!/\bwindowsHide\s*:\s*true\b/.test(args)) found.push(`${before.split("\n").length}: ${m[1]}(`);
  }
  return found;
}

const files = execFileSync("git", ["ls-files", "-z", "--", ".agents", ".claude/hooks", ".github/scripts", "scripts"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0")
  // This file's own scanner cases contain unhidden calls on purpose.
  .filter((f) => /\.(?:mjs|cjs|js)$/.test(f) && !f.includes("/node_modules/") && f !== "scripts/windows-hide.test.mjs");
assert.ok(files.includes("scripts/typecheck.mjs"), "tooling script discovery is incomplete");

const problems = [];
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (!/child_process/.test(text)) continue;
  for (const site of unhiddenCalls(text)) problems.push(`${file}:${site}`);
}
assert.deepEqual(problems, [], "these calls start a process without windowsHide: true");

// The scanner itself.
assert.deepEqual(unhiddenCalls('spawn("git", ["status"], { cwd })'), ['1: spawn(']);
assert.deepEqual(unhiddenCalls('execFileSync("gh", args, {\n  encoding: "utf8",\n  windowsHide: true,\n})'), []);
assert.deepEqual(unhiddenCalls('const m = /x/.exec(line); regex.exec("a(")'), []);
assert.deepEqual(unhiddenCalls('io.spawn(cmd, args, { stdio: "ignore" })'), ['1: spawn(']);
assert.deepEqual(unhiddenCalls('spawn("a", [")"], { windowsHide: true })'), []);
assert.deepEqual(unhiddenCalls('/* windows-hide: caller */childProcess.spawn(exe, args, options)'), []);
assert.deepEqual(unhiddenCalls('childProcess.spawn(exe, args, options)'), ['1: spawn(']);
console.log(`windows-hide: ${files.length} tooling scripts scanned`);

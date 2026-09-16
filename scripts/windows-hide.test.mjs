// Every process started by agent tooling passes `windowsHide: true`. Agents run
// these scripts from processes without a visible console, and on Windows a
// console child of such a process otherwise opens its own window, which
// flashes on screen and takes keyboard focus.
//
// The hook-test CI job runs without installed packages, so this is a lexical
// scanner rather than a parser. It scans code inside string literals too,
// because several tests write child scripts from string fixtures.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = ["spawn", "spawnSync", "execFile", "execFileSync", "execSync", "exec", "fork"];
const MARKER = "/* windows-hide: caller */";
const module = String.raw`["'](?:node:)?child_process["']`;

// Replaces comments with spaces, keeping line breaks and the caller marker.
// String, template and regex literals are skipped so their contents are not
// mistaken for comments.
function stripComments(text) {
  let out = "";
  let quote = null;
  let prev = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      out += c;
      if (c === "\\") out += text[++i] ?? "";
      else if (c === quote || (quote === "/" && c === "\n")) quote = null;
      continue;
    }
    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      out += " ".repeat(stop - i);
      i = stop - 1;
      continue;
    }
    if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      const body = text.slice(i, stop);
      out += body === MARKER ? body : body.replace(/[^\n]/g, " ");
      i = stop - 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && (prev === "" || /[(,=:[!&|?{};+\-*%<>~^]/.test(prev))) quote = "/";
    out += c;
    if (!/\s/.test(c)) prev = c;
  }
  return out;
}

// The index of the parenthesis that closes the one at `open`, skipping string
// literals that start inside the arguments.
function closingParen(text, open) {
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
    else if (c === ")" && --depth === 0) return i;
  }
  return text.length;
}

// Whether a top-level object literal among the arguments has its own
// `windowsHide: true` entry. String contents and nested objects do not count.
function hidesWindow(args) {
  let depth = 0;
  let parens = 0;
  let quote = null;
  let masked = "";
  const depths = [];
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (quote) {
      if (c === "\\") { i++; masked += "  "; depths.push(depth, depth); continue; }
      if (c === quote) quote = null;
      masked += " ";
      depths.push(depth);
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { quote = c; masked += " "; depths.push(depth); continue; }
    if (c === "(" || c === "[") parens++;
    else if (c === ")" || c === "]") parens--;
    else if (c === "{") depth += parens === 0 ? 1 : 100;
    else if (c === "}") depth -= parens === 0 ? 1 : 100;
    masked += c;
    depths.push(depth);
  }
  for (const m of masked.matchAll(/(?<![\w$.])windowsHide\s*:\s*true\b/g)) {
    if (depths[m.index] === 1) return true;
  }
  return false;
}

// Names that refer to child_process functions or to the module itself.
function bindings(text) {
  const functions = new Map(NAMES.map((name) => [name, name]));
  const modules = new Set(["childProcess", "child_process", "cp"]);
  const lists = [
    ...text.matchAll(new RegExp(String.raw`import\s*\{([^}]*)\}\s*from\s*` + module, "g")),
    ...text.matchAll(new RegExp(String.raw`\{([^}]*)\}\s*=\s*require\(\s*` + module + String.raw`\s*\)`, "g")),
  ];
  for (const [, list] of lists) {
    for (const entry of list.split(",")) {
      const m = /^\s*(\w+)\s*(?:as|:)\s*([\w$]+)\s*$/.exec(entry);
      if (m && NAMES.includes(m[1])) functions.set(m[2], m[1]);
    }
  }
  for (const m of text.matchAll(new RegExp(String.raw`import\s+(?:\*\s+as\s+)?([\w$]+)(?:\s*,\s*\{[^}]*\})?\s+from\s*` + module, "g"))) modules.add(m[1]);
  for (const m of text.matchAll(new RegExp(String.raw`(?:const|let|var)\s+([\w$]+)\s*=\s*require\(\s*` + module + String.raw`\s*\)`, "g"))) modules.add(m[1]);
  return { functions, modules };
}

export function unhiddenCalls(source) {
  const text = stripComments(source);
  const { functions, modules } = bindings(text);
  const call = new RegExp(String.raw`(?<![\w$])(${[...functions.keys()].map((n) => n.replace(/\$/g, "\\$")).join("|")})\s*\(`, "g");
  const found = [];
  for (const m of text.matchAll(call)) {
    const name = functions.get(m[1]);
    let before = text.slice(0, m.index);
    const open = m.index + m[0].length - 1;
    const close = closingParen(text, open);
    const receiver = /(?:([\w$]+)|(require\(\s*["'][^"']*["']\s*\)))\s*\??\.\s*$/.exec(before);
    if (receiver) {
      // `.exec(` is also RegExp#exec; only a child_process receiver starts a process.
      const fromModule = receiver[2] ? new RegExp(module).test(receiver[2]) : modules.has(receiver[1]);
      if (name === "exec" && !fromModule) continue;
      before = before.slice(0, receiver.index);
    } else if (/(?:[\w$]|\.\s*)$/.test(before)) continue;
    // Declarations and method definitions: `function spawn(...) {` or `exec(...) {`.
    const line = before.slice(before.lastIndexOf("\n") + 1);
    if (!receiver && /^\s*\{/.test(text.slice(close + 1)) && /(?:\bfunction\s*\*?\s*|^\s*(?:async\s+|static\s+)*)$/.test(line)) continue;
    // A call that forwards options built by an already-checked caller carries this marker.
    if (before.trimEnd().endsWith(MARKER)) continue;
    if (!hidesWindow(text.slice(open + 1, close))) found.push(`${before.split("\n").length}: ${m[1]}(`);
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
const cases = [
  ['spawn("git", ["status"], { cwd })', ["1: spawn("]],
  ['execFileSync("gh", args, {\n  encoding: "utf8",\n  windowsHide: true,\n})', []],
  ['const m = /x/.exec(line); regex.exec("a(")', []],
  ['io.spawn(cmd, args, { stdio: "ignore" })', ["1: spawn("]],
  ['spawn("a", [")"], { windowsHide: true })', []],
  [`${MARKER}childProcess.spawn(exe, args, options)`, []],
  ["childProcess.spawn(exe, args, options)", ["1: spawn("]],
  ['require("node:child_process").spawn("node", ["-e", "0"])', ["1: spawn("]],
  ['require("node:child_process").exec("dir")', ["1: exec("]],
  ['import { spawn as run } from "node:child_process";\nrun("git", [], {})', ["2: run("]],
  ['const { execFileSync: x } = require("child_process");\nx("git", [], { windowsHide: true })', []],
  ['import cp from "node:child_process";\ncp.exec("dir")', ["2: exec("]],
  ['spawn("git", [], { diagnostic: "windowsHide: true" })', ["1: spawn("]],
  ['spawn("git", [], { metadata: { windowsHide: true } })', ["1: spawn("]],
  ['spawn("git", [], { env: f({ windowsHide: true }) })', ["1: spawn("]],
  ['// spawn("git", [])\n/* spawn("git", []) */', []],
  ["function spawn(\n  cmd,\n  args,\n) {\n  return cmd;\n}", []],
  ["const o = {\n  exec(cmd, args) {\n    return cmd;\n  },\n};", []],
  ['const re = /"/; spawn("git", [], {})', ["1: spawn("]],
  ['const s = "// not a comment"; spawn("git", [], {})', ["1: spawn("]],
  ['function run() {\n  return spawnSync("git", []);\n}\nawait execFile("git")', ["2: spawnSync(", "4: execFile("]],
];
for (const [source, expected] of cases) assert.deepEqual(unhiddenCalls(source), expected, source);
console.log(`windows-hide: ${files.length} tooling scripts scanned`);

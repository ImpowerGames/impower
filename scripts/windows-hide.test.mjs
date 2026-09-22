// Every process started by agent tooling passes `windowsHide: true`. Agents run
// these scripts from processes without a visible console, and on Windows a
// console child of such a process otherwise opens its own window, which
// flashes on screen and takes keyboard focus.
//
// No process is started with `detached` except through spawnDetached in
// scripts/detached-launch.mjs, or with `detached: process.platform !== "win32"`. Windows ignores `windowsHide` for a detached
// process, so the console programs it starts open visible windows; the
// helper explains how it avoids that.
//
// The hook-test CI job runs without installed packages, so this is a lexical
// scanner rather than a parser. It scans code inside string literals too,
// because several tests write child scripts from string fixtures. A comment
// inside such a fixture string is scanned as code, so a call written there
// is reported even though it never runs; reword the fixture if that happens.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NAMES = ["spawn", "spawnSync", "execFile", "execFileSync", "execSync", "exec", "fork"];
const MARKER = "/* windows-hide: caller */";
const HELPER = "scripts/detached-launch.mjs";
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

// Whether the options argument has its own entry matching `entry`. The
// options argument is the first top-level object literal; every
// child_process launcher takes at most one. String contents and nested
// objects do not count.
function hasOption(args, entry, except) {
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
  const start = depths.indexOf(1);
  if (start < 0) return false;
  const end = depths.indexOf(0, start);
  const options = masked.slice(start, end < 0 ? masked.length : end);
  // `except` reads the unmasked text, since masking blanks string contents.
  for (const m of options.matchAll(entry)) {
    if (depths[start + m.index] === 1 && !except?.test(args.slice(start + m.index))) return true;
  }
  return false;
}
const HIDES = /(?<![\w$.])windowsHide\s*:\s*true\b/g;
// Any `detached` entry and the `detached,` shorthand, except one that is off on
// Windows, which a caller uses to stop a POSIX process group.
const DETACHES = /(?<![\w$.])detached\s*[:,}]/g;
const OFF_ON_WINDOWS = /^detached\s*:\s*process\.platform\s*!==\s*(["'])win32\1/;

// Blanks the contents of string, template and regex literals, keeping length
// and line breaks, so a keyword quoted inside one is not read as code.
function maskStrings(text) {
  let out = "";
  let quote = null;
  let prev = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\") { out += "  "; i++; continue; }
      if (c === quote || (quote === "/" && c === "\n")) { quote = null; out += c; continue; }
      out += c === "\n" ? c : " ";
      continue;
    }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "/" && /[(,=:[!&|?{};+\-*%<>~^]/.test(prev)) quote = "/";
    out += c;
    if (!/\s/.test(c)) prev = c;
  }
  return out;
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
  const alternatives = [...functions.keys()].map((n) => n.replace(/\$/g, "\\$")).join("|");
  // A plain call `name(`, or a computed member call `["name"](`, rewritten below to `.name(`.
  const call = new RegExp(String.raw`(?<![\w$])(${alternatives})\s*\(|\[\s*(["'\x60])(${NAMES.join("|")})\2\s*\]\s*\(`, "g");
  const found = [];
  for (const m of text.matchAll(call)) {
    const computed = m[3] !== undefined;
    if (computed) m[1] = m[3];
    const name = functions.get(m[1]);
    let before = text.slice(0, m.index) + (computed ? "." : "");
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
    if (!hasOption(text.slice(open + 1, close), HIDES)) found.push(`${before.split("\n").length}: ${m[1]}(`);
  }
  return found;
}

// Every `detached` option in the file, whatever the call it belongs to is
// named. A call site reaching child_process through an injected parameter
// (`spawnWorker(...)`, with `spawnWorker = spawn` as a default) names no
// scannable function, so this reads the option rather than the callee.
// `detached` is also an ordinary field name, on a worktree entry for one. A
// match counts unless its object is plainly such a record: one that has other
// fields and not one of them a launch option. So launch options nothing else
// identifies as one, `{ detached: true, env }` passed to an injected launcher,
// still count.
const LAUNCH_OPTIONS = new Set(["windowsHide", "stdio", "shell", "cwd", "env", "argv0", "uid", "gid", "killSignal", "serialization", "timeout", "linger"]);

// The object literal's own keys: `name:` entries and `name` shorthands,
// skipping anything nested inside it.
function objectKeys(object) {
  const keys = [];
  let depth = 0;
  for (let i = 0; i < object.length; i++) {
    const c = object[i];
    if (c === "{" || c === "[" || c === "(") depth++;
    else if (c === "}" || c === "]" || c === ")") depth--;
    if (depth !== 1) continue;
    const m = /^([\w$]+)\s*[:,}]/.exec(object.slice(i));
    if (!m) continue;
    // A key follows the opening brace or a comma, never a colon's value.
    if (/[:.\w$]\s*$/.test(object.slice(0, i))) continue;
    keys.push(m[1]);
    i += m[1].length - 1;
  }
  return keys;
}
export function detachedOptions(source) {
  const text = maskStrings(stripComments(source));
  const found = [];
  for (const m of text.matchAll(DETACHES)) {
    if (OFF_ON_WINDOWS.test(source.slice(m.index))) continue;
    const others = objectKeys(enclosingObject(text, m.index)).filter((key) => key !== "detached");
    if (others.length && !others.some((key) => LAUNCH_OPTIONS.has(key))) continue;
    found.push(`${text.slice(0, m.index).split("\n").length}: detached`);
  }
  return found;
}

// The object literal the character at `index` sits directly inside, braces and
// nested objects included.
function enclosingObject(text, index) {
  let depth = 0;
  let open = -1;
  for (let i = index; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{") { if (depth === 0) { open = i; break; } depth--; }
  }
  if (open < 0) return "";
  depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(open, i + 1);
  }
  return text.slice(open);
}

const files = execFileSync("git", ["ls-files", "-z", "--", ".agents", ".claude/hooks", ".github/scripts", "scripts"], { cwd: root, encoding: "utf8", windowsHide: true })
  .split("\0")
  // This file's own scanner cases contain unhidden calls on purpose.
  .filter((f) => /\.(?:mjs|cjs|js)$/.test(f) && !f.includes("/node_modules/") && f !== "scripts/windows-hide.test.mjs");
assert.ok(files.includes("scripts/typecheck.mjs"), "tooling script discovery is incomplete");

const problems = [];
const detached = [];
// The helper itself, and its test's control launch, which shows the defect the
// helper prevents.
const detaches = new Set([HELPER, HELPER.replace(/\.mjs$/, ".test.mjs")]);
for (const file of files) {
  const text = fs.readFileSync(path.join(root, file), "utf8");
  if (/child_process/.test(text)) for (const site of unhiddenCalls(text)) problems.push(`${file}:${site}`);
  if (!detaches.has(file)) for (const site of detachedOptions(text)) detached.push(`${file}:${site}`);
}
assert.deepEqual(problems, [], "these calls start a process without windowsHide: true");
assert.deepEqual(detached, [], `these launches pass detached outside ${HELPER}'s spawnDetached`);

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
  ['spawn("node", ["-e", "0"], {}, { windowsHide: true })', ["1: spawn("]],
  ['execFile("git", ["status"], { windowsHide: true }, (error) => {})', []],
  ['require("node:child_process")["spawn"]("node", [])', ["1: spawn("]],
  ['cp[\'execFileSync\']("git", [], { windowsHide: true })', []],
  ['const m = pattern["exec"](line)', []],
  ['spawn("npm", [], { windowsHide: true, detached: true })', []],
];
for (const [source, expected] of cases) assert.deepEqual(unhiddenCalls(source), expected, source);

const detachedCases = [
  ['spawn("npm", [], { windowsHide: true, detached: true })', ["1: detached"]],
  ['spawn("npm", [], { detached, windowsHide: true })', ["1: detached"]],
  ['spawnWorker(exe, args, {\n  env,\n  detached: true,\n  windowsHide: true,\n})', ["3: detached"]],
  ['spawn("npm", [], { windowsHide: true, detached: process.platform !== "win32" })', []],
  ['spawn("npm", [], { windowsHide: true, detached: process.platform === "win32" })', ["1: detached"]],
  ['const s = "detached: true"; const t = `detached: true`;', []],
  ["// detached: true\n/* detached: true */", []],
  ['spawnDetached(exe, args, { stdio: "ignore" })', []],
  // `detached` as an ordinary field, on a worktree entry and on its facts.
  ['rows.push({ path: p, branch: null, detached: true })', []],
  ['kept(entry({ branch: null, detached: true }), facts({ dirty: 9 }))', []],
  // The options a caller builds to pass on carry their own windowsHide.
  ['const options = { detached: true, windowsHide: true, stdio: "ignore" };', ["1: detached"]],
  // An injected launcher, with no option naming it a launch but `env`.
  ["spawnWorker(exe, args, { detached: true, env })", ["1: detached"]],
  // Nothing else in the object to read either way.
  ["spawnWorker(exe, args, { detached: true })", ["1: detached"]],
  // A record whose fields are data, wherever it sits.
  ['const entry = { path: p, branch: null, detached: true, head: "m2" };', []],
  ["report({ worktrees: [{ branch, detached: true }] })", []],
];
for (const [source, expected] of detachedCases) assert.deepEqual(detachedOptions(source), expected, source);
console.log(`windows-hide: ${files.length} tooling scripts scanned`);

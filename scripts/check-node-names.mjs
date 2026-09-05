#!/usr/bin/env node
// Checks that every grammar node name written as a string literal in source
// names a node the sparkdown grammar can produce.
//
// `SparkdownNodeName` already makes a stale name a compile error wherever the
// value being compared is typed with it: a comparison or `switch` on a typed
// node, or a tree-helper lookup whose parent node or stack is typed. The type
// system cannot see three shapes, and this script covers them:
//
//   - a lookup whose parent is a bare lezer `SyntaxNode` (the helpers infer
//     the name set from the parent, and a bare node infers `string`)
//   - lezer's own `getChild("...")` / `getChildren("...")`, typed as `string`
//   - a comparison on a `.name` typed `string` or `any`, and the `case`
//     labels of a `switch` on such a name
//
// A stale name in any of those compiles and silently never matches, which is
// how the names this script was written to catch went unnoticed.
//
// The legal set is derived from the generated grammar the same way
// `SparkdownNodeName` is: every repository rule, its `_begin`/`_content`/`_end`
// variants, the `NodeID` keys, the synthetic error nodes, and the root rule
// name. Capture-index names (`Foo_c2`) are deliberately not legal; see
// packages/textmate-grammar-tree/src/grammar/types/NodeName.ts.
//
// Only files that work with the grammar tree are scanned: those importing a
// tree helper, `SparkdownNodeName`, or `SparkdownSyntaxNodeRef`. The ink
// engine under packages/sparkdown/src/inkjs compares native-function names,
// not node names, and the grammar-agnostic textmate-grammar-tree package has
// no node names of its own; both are skipped. A line that compares a `.name`
// which is not a node name can opt out with a `// not a node name` comment.
//
// Usage:
//   node scripts/check-node-names.mjs               check; exit 1 on any finding
//   node scripts/check-node-names.mjs --list        print the files it would scan
//   node scripts/check-node-names.mjs --root=DIR    check another checkout

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootArg = process.argv.find((a) => a.startsWith("--root="));
const ROOT = rootArg
  ? path.resolve(rootArg.slice("--root=".length))
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const GRAMMAR = "packages/sparkdown/language/sparkdown.language-grammar.json";
const NODE_ID = "packages/textmate-grammar-tree/src/core/enums/NodeID.ts";
const NODE_NAME = "packages/textmate-grammar-tree/src/grammar/types/NodeName.ts";
const ROOT_RULE = "sparkdown";

const SKIPPED_PREFIXES = [
  "packages/sparkdown/src/inkjs/",
  "packages/textmate-grammar-tree/",
];

const GRAMMAR_FILE_MARKERS =
  /textmate-grammar-tree\/src\/tree\/|SparkdownNodeName|SparkdownSyntaxNodeRef/;

const OPT_OUT = "not a node name";

const HELPERS = [
  "getDescendent",
  "getDescendents",
  "getDescendentInsideParent",
  "getDescendentsInsideParent",
  "getNodesInsideParent",
  "getOtherNodesInsideParent",
  "getOtherMatchesInsideParent",
];

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function legalNames() {
  const names = new Set([ROOT_RULE]);
  const grammar = JSON.parse(read(GRAMMAR));
  for (const rule of Object.keys(grammar.repository)) {
    names.add(rule);
    names.add(`${rule}_begin`);
    names.add(`${rule}_content`);
    names.add(`${rule}_end`);
  }
  const enumBody = stripComments(read(NODE_ID)).match(/enum NodeID\s*\{([^}]*)\}/);
  if (!enumBody) throw new Error(`could not find the NodeID enum in ${NODE_ID}`);
  for (const m of enumBody[1].matchAll(/\b([A-Za-z_$][\w$]*)\b\s*(?:=[^,]*)?(?:,|$)/gm)) {
    names.add(m[1]);
  }
  const errorNames = read(NODE_NAME).match(/type ErrorNodeName\s*=([^;]*);/);
  if (!errorNames) throw new Error(`could not find ErrorNodeName in ${NODE_NAME}`);
  for (const m of errorNames[1].matchAll(/"([^"]+)"/g)) names.add(m[1]);
  return names;
}

// Replaces comments with spaces (newlines kept) so that line numbers survive
// and a name inside a comment is never reported. String and template literals
// are skipped so a `//` inside one is not taken for a comment.
export function stripComments(src) {
  let out = "";
  let i = 0;
  const n = src.length;
  while (i < n) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < n && src[i] !== "\n") {
        out += " ";
        i += 1;
      }
    } else if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < n && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i += 1;
      }
      out += "  ";
      i += 2;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          out += src[i] + (src[i + 1] ?? "");
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += src[i] ?? "";
      i += 1;
    } else {
      out += c;
      i += 1;
    }
  }
  return out;
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

function literalsIn(arg) {
  return [...arg.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// The `{ ... }` block that starts at `open`, or the end of the source when it
// never closes. Comments and strings were stripped before this runs.
function blockEnd(src, open) {
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return src.length;
}

const ARG = String.raw`"[^"]*"|\[[^\]]*\]`;

// Every string literal used as a node name, with the line it sits on.
export function nodeNameLiterals(source) {
  const src = stripComments(source);
  const found = [];
  const push = (index, names) => {
    const line = lineOf(src, index);
    for (const name of names) found.push({ line, name });
  };

  // node.name === "X", n.type.name !== "X", nodeName === "X"
  for (const m of src.matchAll(
    /(?:\.name|\bnodeName)\s*(?:===|!==|==|!=)\s*("[^"]+")/g,
  )) {
    push(m.index, literalsIn(m[1]));
  }
  // "X" === node.name
  for (const m of src.matchAll(
    /("[^"]+")\s*(?:===|!==|==|!=)\s*[\w$.?!\[\]]*(?:\.name|\bnodeName)\b/g,
  )) {
    push(m.index, literalsIn(m[1]));
  }
  // getDescendent("X", ...), getDescendentInsideParent(["X", "Y"], "Z", ...)
  const helperCall = new RegExp(
    String.raw`\b(?:${HELPERS.join("|")})\s*\(\s*(${ARG})(?:\s*,\s*(${ARG}))?`,
    "g",
  );
  for (const m of src.matchAll(helperCall)) {
    push(m.index, literalsIn(m[1]));
    if (m[2]) push(m.index, literalsIn(m[2]));
  }
  // node.getChild("X"), node.getChildren("X")
  for (const m of src.matchAll(/\.getChild(?:ren)?\s*\(\s*("[^"]+")/g)) {
    push(m.index, literalsIn(m[1]));
  }
  // switch (node.name) { case "X": ... }
  for (const m of src.matchAll(/\bswitch\s*\(\s*[\w$.?!\[\]]*\.name\s*\)\s*\{/g)) {
    const open = m.index + m[0].length - 1;
    const body = src.slice(open, blockEnd(src, open));
    for (const c of body.matchAll(/\bcase\s+("[^"]+")\s*:/g)) {
      push(open + c.index, literalsIn(c[1]));
    }
  }
  return found;
}

// Lines whose comment carries the opt-out marker.
function optedOutLines(source) {
  const lines = new Set();
  source.split("\n").forEach((text, i) => {
    const comment = text.indexOf("//");
    if (comment !== -1 && text.slice(comment).includes(OPT_OUT)) lines.add(i + 1);
  });
  return lines;
}

function scannedFiles() {
  const out = execFileSync(
    "git",
    ["ls-files", "--", "*.ts", "*.tsx", "*.mts"],
    { cwd: ROOT, encoding: "utf8" },
  );
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((p) => !p.endsWith(".d.ts"))
    .filter((p) => !SKIPPED_PREFIXES.some((prefix) => p.startsWith(prefix)))
    .map((p) => ({ path: p, source: read(p) }))
    .filter((f) => GRAMMAR_FILE_MARKERS.test(f.source))
    .sort((a, b) => a.path.localeCompare(b.path));
}

function main() {
  const list = process.argv.includes("--list");
  const legal = legalNames();
  const files = scannedFiles();

  if (list) {
    console.log(`${files.length} file(s) scanned:`);
    for (const f of files) console.log(`  ${f.path}`);
    return;
  }

  let checked = 0;
  const findings = [];
  for (const f of files) {
    const optedOut = optedOutLines(f.source);
    for (const { line, name } of nodeNameLiterals(f.source)) {
      checked += 1;
      if (legal.has(name) || optedOut.has(line)) continue;
      findings.push(`${f.path}:${line}: "${name}" is not a grammar node name`);
    }
  }

  for (const finding of findings) console.log(finding);
  console.log(
    `\n${files.length} file(s), ${checked} node-name literal(s), ${findings.length} unknown`,
  );
  if (findings.length > 0) {
    console.log(
      `A name the grammar cannot produce never matches. Fix the name, or if the` +
        ` value is not a node name, append \`// ${OPT_OUT}\` to the line.`,
    );
    process.exitCode = 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}

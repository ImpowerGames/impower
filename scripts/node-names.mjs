import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootArg = process.argv.find((a) => a.startsWith("--root="));
export const ROOT = rootArg
  ? path.resolve(rootArg.slice("--root=".length))
  : process.env.NODE_NAMES_ROOT
    ? path.resolve(process.env.NODE_NAMES_ROOT)
    : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export const GRAMMAR = "packages/sparkdown/language/sparkdown.language-grammar.json";
export const GRAMMAR_COPY = "vscode-sparkdown/language/sparkdown.language-grammar.json";
export const REGENERATE = "cd definitions && npm run language";
const NODE_ID = "packages/textmate-grammar-tree/src/core/enums/NodeID.ts";
const NODE_NAME = "packages/textmate-grammar-tree/src/grammar/types/NodeName.ts";
const ROOT_RULE = "sparkdown";

export const SKIPPED_PREFIXES = [
  "packages/sparkdown/src/inkjs/",
  "packages/textmate-grammar-tree/",
  "packages/codemirror-vscode-language/",
  "packages/sparkdown/src/tests/incremental/crossChunkAssemblySpike.test.ts",
  "packages/sparkdown-language-server/src/tests/types/nodeNameTyping.typecheck.ts",
];

export const GRAMMAR_FILE_MARKERS =
  /textmate-grammar-tree\/src\/tree\/|SparkdownNodeName|SparkdownSyntaxNodeRef|nodeNameSet|@lezer\/common|\bSyntaxNode\b|\.topNode\b/;

export const OPT_OUT = "not a node name";

const NAME_FIRST_HELPERS = [
  "getDescendent",
  "getDescendents",
  "getDescendentInsideParent",
  "getDescendentsInsideParent",
  "getNodesInsideParent",
  "getOtherNodesInsideParent",
];

const NAME_SECOND_HELPERS = ["findChildByName", "findChild", "directChild"];

const NAME_SHAPE = /^[A-Z][A-Za-z0-9]*(?:_begin|_content|_end)?$/;

function read(rel) {
  return readFileSync(path.join(ROOT, rel), "utf8");
}

export function ruleNames(grammarPath) {
  return Object.keys(JSON.parse(read(grammarPath)).repository).sort();
}

export function legalNames() {
  const names = new Set();
  for (const rule of [ROOT_RULE, ...ruleNames(GRAMMAR)]) {
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

const REGEX_PRECEDER =
  /(?:^|[(,=:[!&|?{};+\-*%<>~^]|\breturn|\bcase|\btypeof|\bvoid|\bin|\bof)\s*$/;

function scan(src, blankStrings) {
  let out = "";
  let i = 0;
  const n = src.length;
  const blank = (c) => (c === "\n" ? "\n" : " ");
  const skipEscaped = () => {
    out += blankStrings ? "  " : src[i] + (src[i + 1] ?? "");
    i += 2;
  };
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
        out += blank(src[i]);
        i += 1;
      }
      out += "  ";
      i += 2;
    } else if (c === "/" && REGEX_PRECEDER.test(out.slice(-20))) {
      out += c;
      i += 1;
      let inClass = false;
      while (i < n && src[i] !== "\n" && (inClass || src[i] !== "/")) {
        if (src[i] === "\\") {
          skipEscaped();
          continue;
        }
        if (src[i] === "[") inClass = true;
        else if (src[i] === "]") inClass = false;
        out += blankStrings ? " " : src[i];
        i += 1;
      }
      out += src[i] ?? "";
      i += 1;
    } else if (c === '"' || c === "'" || c === "`") {
      const quote = c;
      out += c;
      i += 1;
      while (i < n && src[i] !== quote) {
        if (src[i] === "\\") {
          skipEscaped();
          continue;
        }
        out += blankStrings ? blank(src[i]) : src[i];
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

export function stripComments(src) {
  return scan(src, false);
}

export function stripCommentsAndStrings(src) {
  return scan(src, true);
}

function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === "\n") line += 1;
  return line;
}

function literalsIn(text, base) {
  return [...text.matchAll(/"([^"]+)"|'([^']+)'/g)].map((m) => ({
    name: m[1] ?? m[2],
    index: base + m.index,
  }));
}

function blockEnd(blanked, open) {
  let depth = 0;
  for (let i = open; i < blanked.length; i += 1) {
    if (blanked[i] === "{") depth += 1;
    else if (blanked[i] === "}") {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return blanked.length;
}

const LIT = String.raw`"[^"]+"|'[^']+'`;
const ARG = String.raw`${LIT}|\[[^\]]*\]|[^,()\[\]"']+`;
const NAME_EXPR = String.raw`(?:[\w$.?!\[\]]*\.name|\bnodeName)\b`;
const TYPE_ARGS = String.raw`(?:<[^()]*>)?`;

export function nodeNameLiterals(source, legal = new Set()) {
  const src = stripComments(source);
  const blanked = stripCommentsAndStrings(source);
  const found = [];
  const push = (literals) => {
    for (const { name, index } of literals) {
      found.push({ line: lineOf(src, index), name });
    }
  };
  const at = (m, group) => m.index + m[0].indexOf(m[group]);

  for (const m of src.matchAll(
    new RegExp(String.raw`${NAME_EXPR}\s*(?:===|!==|==|!=)\s*(${LIT})`, "g"),
  )) {
    push(literalsIn(m[1], at(m, 1)));
  }
  for (const m of src.matchAll(
    new RegExp(String.raw`(${LIT})\s*(?:===|!==|==|!=)\s*${NAME_EXPR}`, "g"),
  )) {
    push(literalsIn(m[1], at(m, 1)));
  }
  for (const m of src.matchAll(
    new RegExp(String.raw`(\[[^\]]*\])\.includes\(\s*${NAME_EXPR}`, "g"),
  )) {
    push(literalsIn(m[1], at(m, 1)));
  }
  const nameFirst = new RegExp(
    String.raw`\b(?:${NAME_FIRST_HELPERS.join("|")})${TYPE_ARGS}\(\s*(${ARG})(?:\s*,\s*(${ARG}))?`,
    "g",
  );
  for (const m of src.matchAll(nameFirst)) {
    push(literalsIn(m[1], at(m, 1)));
    if (m[2]) push(literalsIn(m[2], m.index + m[0].lastIndexOf(m[2])));
  }
  const nameSecond = new RegExp(
    String.raw`\b(?:${NAME_SECOND_HELPERS.join("|")})${TYPE_ARGS}\(\s*[^,()]+,\s*(${ARG})`,
    "g",
  );
  for (const m of src.matchAll(nameSecond)) {
    push(literalsIn(m[1], m.index + m[0].lastIndexOf(m[1])));
  }
  for (const m of src.matchAll(/\.getChild(?:ren)?\s*(\((?:[^()]|\([^()]*\))*\))/g)) {
    push(literalsIn(m[1], at(m, 1)));
  }
  for (const m of src.matchAll(
    new RegExp(String.raw`\bswitch\s*\(\s*${NAME_EXPR}\s*\)\s*\{`, "g"),
  )) {
    const open = m.index + m[0].length - 1;
    const body = src.slice(open, blockEnd(blanked, open));
    for (const c of body.matchAll(new RegExp(String.raw`\bcase\s+(${LIT})\s*:`, "g"))) {
      push(literalsIn(c[1], open + c.index + c[0].indexOf(c[1])));
    }
  }
  for (const m of src.matchAll(/\bnew Set(?:<[^>]*>)?\(\s*(\[[^\]]*\])/g)) {
    const literals = literalsIn(m[1], at(m, 1));
    if (
      literals.length > 0 &&
      literals.every((l) => NAME_SHAPE.test(l.name)) &&
      literals.some((l) => legal.has(l.name))
    ) {
      push(literals);
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

export function optedOutLines(source) {
  const lines = new Set();
  source.split("\n").forEach((text, i) => {
    const line = text.indexOf("//");
    const block = text.indexOf("/*");
    const comment = line === -1 ? block : block === -1 ? line : Math.min(line, block);
    if (comment !== -1 && text.slice(comment).includes(OPT_OUT)) lines.add(i + 1);
  });
  return lines;
}

export function scannedFiles() {
  const out = execFileSync("git", ["ls-files", "--", "*.ts", "*.tsx", "*.mts"], {
    cwd: ROOT,
    encoding: "utf8",
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  return out
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((p) => !p.endsWith(".d.ts"))
    .filter((p) => !SKIPPED_PREFIXES.some((prefix) => p.startsWith(prefix)))
    .map((p) => ({ path: p, source: read(p) }))
    .filter((f) => GRAMMAR_FILE_MARKERS.test(f.source))
    .sort((a, b) => a.path.localeCompare(b.path));
}

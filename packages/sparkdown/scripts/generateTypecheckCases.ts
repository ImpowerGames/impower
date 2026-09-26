// Generates `src/tests/luau-conformance/upstream/typecheck-cases.json`: every
// test case in Luau's type-checker test files, which the ported type-checking
// tests are checked against (see `src/tests/luau-conformance/typecheck/README.md`).
//
// Point it at a checkout of luau-lang/luau at the commit to pin, from this
// package's directory:
//
//   node scripts/generateTypecheckCases.ts <luau-checkout>
//
// It reads the checkout's `tests/` directory and
// `Analysis/include/Luau/Error.h`, and records the checkout's HEAD commit as
// the pin. `upstream/VENDORING.md` has the commands that fetch those files.

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// The type-checker test files #589 ports, across its slices P1 to P9. Luau's
// linter tests (`Linter.test.cpp`) are lints, not type checking, and are left
// out.
export const TYPECHECK_TEST_FILES = [
  "NonStrictTypeChecker.test.cpp",
  "NonstrictMode.test.cpp",
  "TypeInfer.aliases.test.cpp",
  "TypeInfer.annotations.test.cpp",
  "TypeInfer.anyerror.test.cpp",
  "TypeInfer.builtins.test.cpp",
  "TypeInfer.cfa.test.cpp",
  "TypeInfer.classes.test.cpp",
  "TypeInfer.const.test.cpp",
  "TypeInfer.definitions.test.cpp",
  "TypeInfer.externTypes.test.cpp",
  "TypeInfer.functions.test.cpp",
  "TypeInfer.generics.test.cpp",
  "TypeInfer.intersectionTypes.test.cpp",
  "TypeInfer.loops.test.cpp",
  "TypeInfer.metatableOOP.test.cpp",
  "TypeInfer.modules.test.cpp",
  "TypeInfer.negations.test.cpp",
  "TypeInfer.operators.test.cpp",
  "TypeInfer.primitives.test.cpp",
  "TypeInfer.provisional.test.cpp",
  "TypeInfer.refinements.test.cpp",
  "TypeInfer.singletons.test.cpp",
  "TypeInfer.tables.test.cpp",
  "TypeInfer.test.cpp",
  "TypeInfer.tryUnify.test.cpp",
  "TypeInfer.typeInstantiations.test.cpp",
  "TypeInfer.typePacks.test.cpp",
  "TypeInfer.typestates.test.cpp",
  "TypeInfer.unionTypes.test.cpp",
  "TypeInfer.unknownnever.test.cpp",
];

export interface UpstreamCase {
  /** The case name, the string literal in its `TEST_CASE` header. */
  name: string;
  /** The fixture of a `TEST_CASE_FIXTURE`; absent for a plain `TEST_CASE`. */
  fixture?: string;
  /**
   * `DOES_NOT_PASS_NEW_SOLVER_GUARD()` forces Luau's old solver until the end
   * of the block it is called in: `true` when that block is the case body, so
   * the whole case runs on the old solver, and `"partly"` when every guard is
   * inside a nested block, so the case's other checks run on the new solver.
   */
  doesNotPassNewSolver?: true | "partly";
  /**
   * Upstream never compiles the case: the value is the `#if 0` line it sits
   * under, or `commented out` for a case inside a block comment.
   */
  disabledUpstream?: string;
  /** Offsets into the file: the header, and the body including its braces. */
  headerFrom: number;
  bodyFrom: number;
  bodyTo: number;
}

// Blanks every comment, and the contents of every string and character
// literal, keeping the length and the line breaks, so that braces, macro
// names and directives can be found in the result without being fooled by
// Luau source held in a string. Also returns where each block comment's
// contents lie, since a case can be commented out.
export function maskCpp(text: string): {
  masked: string;
  blockComments: { from: number; to: number }[];
} {
  const out = text.split("");
  const blockComments: { from: number; to: number }[] = [];
  const blank = (from: number, to: number) => {
    for (let i = from; i < to; i++) {
      if (out[i] !== "\n") out[i] = " ";
    }
  };
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      const to = end < 0 ? text.length : end;
      blank(i, to);
      i = to;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) throw new Error(`unterminated block comment at ${i}`);
      blockComments.push({ from: i + 2, to: end });
      blank(i, end + 2);
      i = end + 2;
    } else if (c === '"' && isRawStringStart(text, i)) {
      const open = text.indexOf("(", i);
      const delimiter = text.slice(i + 1, open);
      const close = text.indexOf(`)${delimiter}"`, open);
      if (open < 0 || close < 0) throw new Error(`unterminated raw string at ${i}`);
      const to = close + delimiter.length + 2;
      blank(i + 1, to - 1);
      i = to;
    } else if (c === "'" && isDigitSeparator(text, i)) {
      i++;
    } else if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < text.length && text[j] !== c) {
        // An escaped character, including a line break that continues the
        // literal on the next line.
        if (text[j] === "\\") {
          j += 2;
          continue;
        }
        if (text[j] === "\n") throw new Error(`unterminated literal at ${i}`);
        j++;
      }
      blank(i + 1, j);
      i = j + 1;
    } else {
      i++;
    }
  }
  return { masked: out.join(""), blockComments };
}

// `R"delim(` opens a raw string, optionally prefixed by `u8`, `u`, `U` or `L`;
// an `R` that ends a longer identifier (`fooR"x"`) does not.
function isRawStringStart(text: string, quote: number): boolean {
  if (text[quote - 1] !== "R") return false;
  const before = text.slice(Math.max(0, quote - 4), quote - 1);
  const prefix = before.match(/(?:u8|u|U|L)?$/)?.[0] ?? "";
  const beforePrefix = text[quote - 2 - prefix.length];
  return beforePrefix === undefined || !/[A-Za-z0-9_]/.test(beforePrefix);
}

// A `'` inside a number (`10'000`) separates digits rather than opening a
// character literal: the token it sits in starts with a digit.
function isDigitSeparator(text: string, quote: number): boolean {
  let start = quote;
  while (start > 0 && /[0-9A-Za-z_.']/.test(text[start - 1] ?? "")) start--;
  return start < quote && /[0-9]/.test(text[start] ?? "");
}

function matchingClose(masked: string, open: number): number {
  const pairs: Record<string, string> = { "(": ")", "{": "}", "[": "]" };
  const closer = pairs[masked[open] ?? ""];
  if (!closer) throw new Error(`no bracket at ${open}`);
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    if (masked[i] === masked[open]) depth++;
    else if (masked[i] === closer && --depth === 0) return i;
  }
  throw new Error(`unbalanced bracket at ${open}`);
}

function readStringLiteral(text: string, quote: number): string {
  let value = "";
  for (let i = quote + 1; i < text.length && text[i] !== '"'; i++) {
    value += text[i] === "\\" ? text[++i] : text[i];
  }
  return value;
}

// The `#if 0` regions of the file, as the offsets of the lines they cover
// and each region's `#if 0` line. Any other condition is assumed true, since
// every other conditional in these files selects a build configuration rather
// than switching tests off.
function disabledRegions(
  text: string,
  masked: string,
): { from: number; to: number; directive: string }[] {
  const regions: { from: number; to: number; directive: string }[] = [];
  const stack: { disabled: boolean; from: number; directive: string }[] = [];
  let offset = 0;
  for (const line of masked.split("\n")) {
    const directive = line.match(/^\s*#\s*(if|ifdef|ifndef|elif|else|endif)\b\s*(.*)$/);
    if (directive) {
      const [, keyword, rest] = directive;
      const outer = stack.some((frame) => frame.disabled);
      if (keyword === "if" || keyword === "ifdef" || keyword === "ifndef") {
        const zero = keyword === "if" && /^0\b/.test(rest ?? "");
        const original = text.slice(offset, offset + line.length).trim();
        stack.push({ disabled: zero && !outer, from: offset, directive: original });
      } else if (keyword === "elif" || keyword === "else") {
        const frame = stack[stack.length - 1];
        if (!frame) throw new Error(`#${keyword} without #if at ${offset}`);
        if (frame.disabled) regions.push({ from: frame.from, to: offset, directive: frame.directive });
        frame.disabled = false;
      } else {
        const frame = stack.pop();
        if (!frame) throw new Error(`#endif without #if at ${offset}`);
        if (frame.disabled) regions.push({ from: frame.from, to: offset, directive: frame.directive });
      }
    }
    offset += line.length + 1;
  }
  if (stack.length) throw new Error("unterminated #if");
  return regions;
}

// The cases whose headers begin a line of `masked`, which is `text` with
// everything but code blanked. `offset` places them within an enclosing text.
function findCases(text: string, masked: string, offset: number): UpstreamCase[] {
  const cases: UpstreamCase[] = [];
  const header = /^[ \t]*TEST_CASE(_FIXTURE)?[ \t]*\(/gm;
  for (let match = header.exec(masked); match; match = header.exec(masked)) {
    const open = match.index + match[0].length - 1;
    const close = matchingClose(masked, open);
    const args = masked.slice(open + 1, close);
    const quote = open + 1 + args.indexOf('"');
    if (quote <= open) throw new Error(`case without a name at ${offset + match.index}`);
    const name = readStringLiteral(text, quote);
    const fixture = match[1] ? args.slice(0, args.indexOf(",")).trim() : undefined;
    const bodyFrom = masked.indexOf("{", close);
    if (bodyFrom < 0 || masked.slice(close + 1, bodyFrom).trim() !== "") {
      throw new Error(`case ${name} has no body`);
    }
    const bodyTo = matchingClose(masked, bodyFrom) + 1;
    const found: UpstreamCase = {
      name,
      headerFrom: offset + match.index,
      bodyFrom: offset + bodyFrom,
      bodyTo: offset + bodyTo,
    };
    if (fixture) found.fixture = fixture;
    const guard = newSolverGuard(masked.slice(bodyFrom, bodyTo));
    if (guard) found.doesNotPassNewSolver = guard;
    cases.push(found);
    header.lastIndex = bodyTo;
  }
  return cases;
}

// Whether a masked case body, braces included, calls the guard at its own
// top level, only inside nested blocks, or not at all.
function newSolverGuard(body: string): true | "partly" | undefined {
  let found: true | "partly" | undefined;
  const guard = /\bDOES_NOT_PASS_NEW_SOLVER_GUARD\s*\(/g;
  for (let match = guard.exec(body); match; match = guard.exec(body)) {
    let depth = 0;
    for (let i = 0; i < match.index; i++) {
      if (body[i] === "{") depth++;
      else if (body[i] === "}") depth--;
    }
    if (depth === 1) return true;
    found = "partly";
  }
  return found;
}

/** Offsets in the result refer to `source` with its CRLF line breaks made LF. */
export function parseTestFile(source: string): UpstreamCase[] {
  const text = source.replace(/\r\n/g, "\n");
  const { masked, blockComments } = maskCpp(text);
  const regions = disabledRegions(text, masked);
  const cases = findCases(text, masked, 0);
  for (const c of cases) {
    const region = regions.find((r) => r.from <= c.headerFrom && c.headerFrom < r.to);
    if (region) c.disabledUpstream = region.directive;
  }
  for (const comment of blockComments) {
    const inner = text.slice(comment.from, comment.to);
    if (!/^[ \t]*TEST_CASE/m.test(inner)) continue;
    for (const c of findCases(inner, maskCpp(inner).masked, comment.from)) {
      c.disabledUpstream = "commented out";
      cases.push(c);
    }
  }
  return cases.sort((a, b) => a.headerFrom - b.headerFrom);
}

export function parseErrorKinds(errorHeader: string): string[] {
  const variant = errorHeader.match(/using\s+TypeErrorData\s*=\s*Variant\s*<([^>]*)>\s*;/);
  if (!variant?.[1]) throw new Error("TypeErrorData not found in Error.h");
  return variant[1]
    .split(",")
    .map((kind) => kind.trim())
    .filter(Boolean);
}

function main(checkout: string | undefined) {
  if (!checkout) {
    throw new Error("usage: node scripts/generateTypecheckCases.ts <luau-checkout>");
  }
  const tests = join(checkout, "tests");
  const missing = TYPECHECK_TEST_FILES.filter((f) => !existsSync(join(tests, f)));
  if (missing.length) {
    throw new Error(`the checkout has no ${missing.join(", ")}; update TYPECHECK_TEST_FILES`);
  }
  const unlisted = readdirSync(tests).filter(
    (f) =>
      /^(TypeInfer\b.*|.*Nonstrict.*|.*NonStrict.*)\.test\.cpp$/.test(f) &&
      !TYPECHECK_TEST_FILES.includes(f),
  );
  const pin = execFileSync("git", ["-C", checkout, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  const errorKinds = parseErrorKinds(
    readFileSync(join(checkout, "Analysis", "include", "Luau", "Error.h"), "utf8"),
  );

  const lines: string[] = [];
  lines.push("{");
  lines.push(
    `  "$comment": ${JSON.stringify(
      "Generated by packages/sparkdown/scripts/generateTypecheckCases.ts from luau-lang/luau at the pin below; do not edit by hand.",
    )},`,
  );
  lines.push(`  "pin": ${JSON.stringify(pin)},`);
  lines.push(`  "errorKinds": [`);
  lines.push(errorKinds.map((kind) => `    ${JSON.stringify(kind)}`).join(",\n"));
  lines.push("  ],");
  lines.push(`  "files": {`);
  let total = 0;
  let guarded = 0;
  let partlyGuarded = 0;
  let disabled = 0;
  // doctest runs two cases of the same name, so both stay listed, in order.
  const repeated: string[] = [];
  const fileBlocks: string[] = [];
  for (const file of TYPECHECK_TEST_FILES) {
    const cases = parseTestFile(readFileSync(join(tests, file), "utf8"));
    const names = new Set<string>();
    for (const c of cases) {
      if (names.has(c.name)) repeated.push(`${file} ${c.name}`);
      names.add(c.name);
    }
    total += cases.length;
    guarded += cases.filter((c) => c.doesNotPassNewSolver === true).length;
    partlyGuarded += cases.filter((c) => c.doesNotPassNewSolver === "partly").length;
    disabled += cases.filter((c) => c.disabledUpstream !== undefined).length;
    const entries = cases.map((c) => {
      const entry: Record<string, unknown> = { name: c.name };
      if (c.fixture) entry["fixture"] = c.fixture;
      if (c.doesNotPassNewSolver) entry["doesNotPassNewSolver"] = c.doesNotPassNewSolver;
      if (c.disabledUpstream !== undefined) entry["disabledUpstream"] = c.disabledUpstream;
      const fields = Object.entries(entry).map(
        ([key, value]) => `${JSON.stringify(key)}: ${JSON.stringify(value)}`,
      );
      return `      {${fields.join(", ")}}`;
    });
    fileBlocks.push(`    ${JSON.stringify(file)}: [\n${entries.join(",\n")}\n    ]`);
  }
  lines.push(fileBlocks.join(",\n"));
  lines.push("  }");
  lines.push("}");

  const here = dirname(fileURLToPath(import.meta.url));
  const output = join(here, "..", "src", "tests", "luau-conformance", "upstream", "typecheck-cases.json");
  writeFileSync(output, lines.join("\n") + "\n");
  console.log(
    `${output}: ${total} cases in ${TYPECHECK_TEST_FILES.length} files at ${pin}; ` +
      `${guarded} marked as not passing on the new solver and ${partlyGuarded} partly, ` +
      `${disabled} disabled upstream; ${errorKinds.length} error kinds`,
  );
  if (repeated.length) {
    console.log(`case names used twice in one file: ${repeated.join("; ")}`);
  }
  if (unlisted.length) {
    console.log(`not listed in TYPECHECK_TEST_FILES, check whether they belong: ${unlisted.join(", ")}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv[2]);
}

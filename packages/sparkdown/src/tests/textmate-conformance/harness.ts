// Conformance harness: runs upstream vscode-textmate tokenization fixtures
// (test-cases/first-mate, test-cases/suite1) through OUR engine
// (textmate-grammar-tree) and compares the per-line token/scope stream against
// the expected output recorded by the real vscode-textmate engine.
//
// This is the same idea as the Luau conformance suite: upstream owns the
// oracle; we measure how close our re-implementation is, and the gaps become
// the work list. The expected tokens in `tests.json` ARE vscode-textmate's
// recorded output, so no live engine is needed here.

import { TextmateGrammarParser } from "@impower/textmate-grammar-tree/src/tree/classes/TextmateGrammarParser";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import vstm from "vscode-textmate";

const { parseRawGrammar } = vstm;

export interface ExpectedToken {
  value: string;
  scopes: string[];
}
export interface ExpectedLine {
  line: string;
  tokens: ExpectedToken[];
}
export interface TestCase {
  desc?: string;
  grammarPath?: string;
  grammarScopeName?: string;
  grammars?: string[];
  grammarInjections?: string[];
  lines: ExpectedLine[];
}

/** Outcome category — the "axis" a case lands on. */
export type Axis =
  | "pass"
  | "mismatch"
  | "capture-model" // RegExpMatcher rejects sparse / non-full-cover captures
  | "while-rule" // `while` rules unsupported
  | "regex-invalid" // pattern failed to compile under JS RegExp
  | "incomplete" // tree contains ERROR_INCOMPLETE / ERROR_UNRECOGNIZED
  | "throw-other"
  | "external-includes" // entry grammar references other grammars (multi/injection)
  | "load-error";

export interface CaseResult {
  suite: string;
  index: number;
  desc: string;
  grammar: string;
  axis: Axis;
  detail?: string;
  /** First divergence (for mismatch), human readable. */
  firstDiff?: string;
  lineCount: number;
}

interface OurToken {
  from: number;
  to: number;
  value: string;
  scopes: string[];
}

const TOP_ID = 1;
const UNRECOGNIZED_ID = 2;
const INCOMPLETE_ID = 3;

/** Detect `include` references to OTHER grammars (scopeName), not local `#` / `$self` / `$base`. */
function hasExternalIncludes(rawText: string): boolean {
  const re = /"include"\s*:\s*"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(rawText))) {
    const inc = m[1]!;
    if (!inc.startsWith("#") && inc !== "$self" && inc !== "$base") {
      return true;
    }
  }
  // plist form: <key>include</key><string>source.x</string>
  const re2 = /<key>include<\/key>\s*<string>([^<]+)<\/string>/g;
  while ((m = re2.exec(rawText))) {
    const inc = m[1]!;
    if (!inc.startsWith("#") && inc !== "$self" && inc !== "$base") {
      return true;
    }
  }
  return false;
}

function buildScopeMap(parser: any): Map<number, string> {
  const m = new Map<number, string>();
  for (const n of parser.grammar.nodes) {
    if (n?.props?.name) {
      m.set(n.typeIndex, n.props.name);
    }
  }
  return m;
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Flatten our parsed tree into TextMate-style per-character scope stacks, then
 * coalesce equal-stack runs into tokens. Newline positions are dropped (upstream
 * tokenizes line-by-line without the trailing newline).
 */
function flatten(
  parser: any,
  tree: any,
  rootScope: string,
  text: string,
): { tokens: OurToken[]; hasErrors: boolean } {
  const scopeMap = buildScopeMap(parser);
  const charScopes: string[][] = new Array(text.length);
  const root = [rootScope];
  for (let i = 0; i < text.length; i++) charScopes[i] = root;

  let hasErrors = false;

  // Adversarial fixtures (e.g. the upstream infinite-loop grammar) can yield a
  // pathologically deep/large tree; bound the walk so the harness never hangs.
  let visits = 0;
  function walk(node: any, chain: string[]) {
    if (!node || !node.type) return;
    if (++visits > 500000) {
      throw new Error("node blowup (pathological grammar)");
    }
    if (node.type.id === UNRECOGNIZED_ID || node.type.id === INCOMPLETE_ID) {
      hasErrors = true;
    }
    const sc = scopeMap.get(node.type.id);
    const my = sc ? [...chain, sc] : chain;
    for (let i = node.from; i < node.to; i++) charScopes[i] = my;
    let c = node.firstChild;
    while (c) {
      walk(c, my);
      c = c.nextSibling;
    }
  }
  walk(tree.topNode, root);

  // coalesce, splitting at newlines
  const tokens: OurToken[] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] === "\n") {
      i++;
      continue;
    }
    const start = i;
    const stack = charScopes[i]!;
    i++;
    while (i < text.length && text[i] !== "\n" && arraysEqual(charScopes[i]!, stack)) {
      i++;
    }
    tokens.push({ from: start, to: i, value: text.slice(start, i), scopes: stack });
  }
  return { tokens, hasErrors };
}

/** Group our flat tokens by line index. */
function tokensByLine(tokens: OurToken[], text: string): OurToken[][] {
  const lineStarts: number[] = [0];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\n") lineStarts.push(i + 1);
  }
  const byLine: OurToken[][] = lineStarts.map(() => []);
  function lineOf(pos: number): number {
    let lo = 0,
      hi = lineStarts.length - 1,
      ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (lineStarts[mid]! <= pos) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  }
  for (const t of tokens) byLine[lineOf(t.from)]!.push(t);
  return byLine;
}

/** Compare our line tokens vs expected; return first divergence or null. */
function diffLine(
  ours: OurToken[],
  expected: ExpectedToken[],
): string | null {
  const n = Math.max(ours.length, expected.length);
  for (let i = 0; i < n; i++) {
    const o = ours[i];
    const e = expected[i];
    if (!o)
      return `token[${i}] missing (expected ${JSON.stringify(e!.value)} ${JSON.stringify(e!.scopes)})`;
    if (!e)
      return `token[${i}] extra (got ${JSON.stringify(o.value)} ${JSON.stringify(o.scopes)})`;
    if (o.value !== e.value)
      return `token[${i}] value got ${JSON.stringify(o.value)} want ${JSON.stringify(e.value)}`;
    if (!arraysEqual(o.scopes, e.scopes))
      return `token[${i}] (${JSON.stringify(o.value)}) scopes got ${JSON.stringify(o.scopes)} want ${JSON.stringify(e.scopes)}`;
  }
  return null;
}

function classifyThrow(msg: string): Axis {
  if (msg.includes("Invalid capturing group lengths")) return "capture-model";
  if (msg.toLowerCase().includes("while")) return "while-rule";
  if (msg.toLowerCase().includes("regex") || msg.includes("Invalid RegExp"))
    return "regex-invalid";
  return "throw-other";
}

/**
 * Resolve the ENTRY grammar for a case. Upstream cases either name it directly
 * via `grammarPath`, or select it from the `grammars` list by `grammarScopeName`
 * (falling back to the last listed grammar). We load only the entry into our
 * single-grammar engine; cross-grammar includes are flagged separately.
 */
function resolveEntry(
  suiteDir: string,
  c: TestCase,
): { rawText: string; raw: any; path: string } {
  if (c.grammarPath) {
    const full = resolve(suiteDir, c.grammarPath);
    const rawText = readFileSync(full, "utf8");
    return { rawText, raw: parseRawGrammar(rawText, full), path: c.grammarPath };
  }
  const candidates = c.grammars ?? [];
  let fallback: { rawText: string; raw: any; path: string } | null = null;
  for (const rel of candidates) {
    const full = resolve(suiteDir, rel);
    let rawText: string;
    let raw: any;
    try {
      rawText = readFileSync(full, "utf8");
      raw = parseRawGrammar(rawText, full);
    } catch {
      continue;
    }
    const entry = { rawText, raw, path: rel };
    fallback = entry;
    if (c.grammarScopeName && raw?.scopeName === c.grammarScopeName) {
      return entry;
    }
  }
  if (fallback) return fallback;
  throw new Error(
    `Could not resolve entry grammar (scopeName=${c.grammarScopeName})`,
  );
}

export function runCase(
  suite: string,
  suiteDir: string,
  index: number,
  c: TestCase,
): CaseResult {
  const base: CaseResult = {
    suite,
    index,
    desc: c.desc ?? `case#${index}`,
    grammar: c.grammarPath ?? c.grammarScopeName ?? "",
    axis: "pass",
    lineCount: c.lines.length,
  };

  let rawText: string;
  let raw: any;
  try {
    const entry = resolveEntry(suiteDir, c);
    rawText = entry.rawText;
    raw = entry.raw;
    base.grammar = entry.path;
  } catch (e) {
    return { ...base, axis: "load-error", detail: (e as Error).message };
  }

  if (hasExternalIncludes(rawText)) {
    return { ...base, axis: "external-includes" };
  }

  const rootScope: string = raw.scopeName;
  let parser: any;
  try {
    parser = new TextmateGrammarParser(raw);
  } catch (e) {
    return { ...base, axis: classifyThrow((e as Error).message), detail: (e as Error).message };
  }

  // Join all lines and parse as a single document.
  const text = c.lines.map((l) => l.line).join("\n");
  let tree: any;
  try {
    tree = parser.parse(text);
  } catch (e) {
    return { ...base, axis: classifyThrow((e as Error).message), detail: (e as Error).message };
  }

  let flat: { tokens: OurToken[]; hasErrors: boolean };
  try {
    flat = flatten(parser, tree, rootScope, text);
  } catch (e) {
    return { ...base, axis: "throw-other", detail: "flatten: " + (e as Error).message };
  }

  const byLine = tokensByLine(flat.tokens, text);
  for (let li = 0; li < c.lines.length; li++) {
    const expected = c.lines[li]!.tokens;
    let ours = byLine[li] ?? [];
    // Upstream tokenizes line-by-line: an empty (or whitespace-only that
    // produced nothing) line still yields a single token carrying just the
    // root scope. Synthesize it so empty lines compare correctly.
    if (ours.length === 0) {
      ours = [{ from: 0, to: 0, value: "", scopes: [rootScope] }];
    }
    const d = diffLine(ours, expected);
    if (d) {
      return {
        ...base,
        axis: flat.hasErrors ? "incomplete" : "mismatch",
        firstDiff: `line ${li + 1} ${JSON.stringify(c.lines[li]!.line)}: ${d}`,
      };
    }
  }

  if (flat.hasErrors) {
    return { ...base, axis: "incomplete", detail: "tokens matched but tree has error nodes" };
  }
  return base;
}

export function loadSuite(suiteDir: string, file: string): TestCase[] {
  return JSON.parse(readFileSync(join(suiteDir, file), "utf8"));
}

export function suiteDirFor(metaUrl: string, suite: string): string {
  const here = dirname(new URL(metaUrl).pathname);
  // On win32 the pathname is like /C:/... — strip leading slash.
  const fixed = here.match(/^\/[A-Za-z]:/) ? here.slice(1) : here;
  return join(fixed, "vendor", suite);
}

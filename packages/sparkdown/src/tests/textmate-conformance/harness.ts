import { GrammarRegistry } from "@impower/textmate-grammar-tree/src/grammar/classes/GrammarRegistry";
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

export type Axis =
  | "pass"
  | "mismatch"
  | "capture-model"
  | "while-rule"
  | "regex-invalid"
  | "incomplete"
  | "throw-other"
  | "load-error";

export interface CaseResult {
  suite: string;
  index: number;
  desc: string;
  grammar: string;
  axis: Axis;
  detail?: string;
  firstDiff?: string;
  lineCount: number;
}

interface OurToken {
  from: number;
  to: number;
  value: string;
  scopes: string[];
}

const INCOMPLETE_ID = 3;

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

  let visits = 0;
  function walk(node: any, chain: string[]) {
    if (!node || !node.type) return;
    if (++visits > 500000) {
      throw new Error("node blowup (pathological grammar)");
    }
    if (node.type.id === INCOMPLETE_ID) {
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

function loadGrammars(suiteDir: string, c: TestCase): { raw: any; path: string }[] {
  const loaded: { raw: any; path: string }[] = [];
  for (const rel of c.grammars ?? []) {
    const full = resolve(suiteDir, rel);
    try {
      loaded.push({ raw: parseRawGrammar(readFileSync(full, "utf8"), full), path: rel });
    } catch (error) {
      throw new Error(`Could not load grammar ${rel}: ${(error as Error).message}`);
    }
  }
  return loaded;
}

function resolveEntry(
  suiteDir: string,
  c: TestCase,
): { raw: any; path: string; grammars: any[] } {
  const loaded = loadGrammars(suiteDir, c);
  if (c.grammarPath) {
    const full = resolve(suiteDir, c.grammarPath);
    const raw = parseRawGrammar(readFileSync(full, "utf8"), full);
    return { raw, path: c.grammarPath, grammars: [raw, ...loaded.map((other) => other.raw)] };
  }
  const entry =
    loaded.find(({ raw }) => c.grammarScopeName && raw?.scopeName === c.grammarScopeName) ??
    loaded.at(-1);
  if (entry) {
    const others = loaded.filter((other) => other !== entry).map((other) => other.raw);
    return { ...entry, grammars: [entry.raw, ...others] };
  }
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

  let raw: any;
  let grammars: any[];
  try {
    const entry = resolveEntry(suiteDir, c);
    raw = entry.raw;
    grammars = entry.grammars;
    base.grammar = entry.path;
  } catch (e) {
    return { ...base, axis: "load-error", detail: (e as Error).message };
  }

  const rootScope: string = raw.scopeName;
  let parser: any;
  try {
    parser = new TextmateGrammarParser(new GrammarRegistry(grammars));
  } catch (e) {
    return { ...base, axis: classifyThrow((e as Error).message), detail: (e as Error).message };
  }

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
  const fixed = here.match(/^\/[A-Za-z]:/) ? here.slice(1) : here;
  return join(fixed, "vendor", suite);
}

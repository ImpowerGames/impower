import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { createSparkdownParser } from "../../compiler/utils/createSparkdownParser";
import { getParser, parseSource } from "./grammarSnapshot";
import { LUAU_FILE_SCOPE_NAME, tokenize } from "./vscodeGrammarSnapshot";

const GRAMMAR = GRAMMAR_DEFINITION as any;
const SCOPE_NAME: string = GRAMMAR.scopeName;

export interface EngineOptions {
  luauFile?: boolean;
}

let luauFileParser: ReturnType<typeof createSparkdownParser> | undefined;

function parseAs(source: string, { luauFile = false }: EngineOptions) {
  if (!luauFile) return parseSource(source);
  luauFileParser ??= createSparkdownParser("inmemory:///scope-equality.luau");
  return luauFileParser.parse(source);
}

const rootScopeOf = ({ luauFile = false }: EngineOptions) => (luauFile ? LUAU_FILE_SCOPE_NAME : SCOPE_NAME);

const NAME_BY_TYPE_ID = new Map<string, string>();
for (const node of (getParser() as any).grammar.nodes as any[]) {
  const props = node?.props ?? {};
  if (typeof props.name === "string") {
    NAME_BY_TYPE_ID.set(node.typeId, props.name);
  }
}

export function treeNodeScope(nodeName: string): string | undefined {
  return NAME_BY_TYPE_ID.get(nodeName);
}

export function treeScopeStackAt(tree: any, offset: number, options: EngineOptions = {}): string[] {
  const node = tree.resolveInner(offset, 1);
  const chain: string[] = [];
  let n: any = node;
  while (n) {
    chain.unshift(n.name);
    n = n.parent;
  }
  const scopes: string[] = [rootScopeOf(options)];
  for (let i = 0; i < chain.length; i++) {
    const name = chain[i]!;
    if (name === chain[i - 1]) continue;
    const sc = treeNodeScope(name);
    if (sc) {
      for (const part of sc.split(/\s+/)) {
        if (part) scopes.push(part);
      }
    }
  }
  return scopes;
}

export async function vscodeScopeStacksPerChar(
  source: string,
  options: EngineOptions = {},
): Promise<string[][]> {
  const dumps = await tokenize(source, options);
  const perChar: string[][] = new Array(source.length);
  for (let i = 0; i < source.length; i++) perChar[i] = [rootScopeOf(options)];

  const lines = source.split("\n");
  let lineStart = 0;
  for (let li = 0; li < lines.length; li++) {
    const dump = dumps[li];
    if (dump) {
      for (const tok of dump.tokens) {
        for (let c = tok.startIndex; c < tok.endIndex; c++) {
          const abs = lineStart + c;
          if (abs < source.length) perChar[abs] = tok.scopes;
        }
      }
    }
    lineStart += lines[li]!.length + 1;
  }
  return perChar;
}

export interface CharDivergence {
  offset: number;
  char: string;
  lineCol: string;
  vscode: string[];
  tree: string[];
}

export interface EngineComparison {
  source: string;
  divergences: CharDivergence[];
}

export async function compareEnginesFull(
  rawSource: string,
  options: EngineOptions = {},
): Promise<EngineComparison> {
  const source = rawSource.replace(/\r\n?/g, "\n");
  const tree = parseAs(source, options);
  const vscodePerChar = await vscodeScopeStacksPerChar(source, options);

  const divergences: CharDivergence[] = [];
  let line = 1;
  let col = 0;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (ch === "\n") {
      line++;
      col = 0;
      continue;
    }
    const vscode = vscodePerChar[i]!;
    const treeScopes = treeScopeStackAt(tree, i, options);
    if (!scopeStacksEqual(vscode, treeScopes)) {
      divergences.push({
        offset: i,
        char: ch,
        lineCol: `${line}:${col}`,
        vscode,
        tree: treeScopes,
      });
    }
    col++;
  }
  return { source, divergences };
}

export async function compareEngines(
  rawSource: string,
  options: EngineOptions = {},
): Promise<CharDivergence[]> {
  return (await compareEnginesFull(rawSource, options)).divergences;
}

function scopeStacksEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

export function formatDivergences(
  source: string,
  divergences: CharDivergence[],
): string {
  if (divergences.length === 0) return "(engines agree at every character)";
  const lines: string[] = [];
  lines.push(
    `${divergences.length} divergent character(s) between vscode-textmate and textmate-grammar-tree:`,
  );
  let i = 0;
  while (i < divergences.length) {
    const start = divergences[i]!;
    let j = i;
    while (
      j + 1 < divergences.length &&
      divergences[j + 1]!.offset === divergences[j]!.offset + 1 &&
      sameStacks(divergences[j + 1]!, start)
    ) {
      j++;
    }
    const end = divergences[j]!;
    const text = source.slice(start.offset, end.offset + 1);
    lines.push("");
    lines.push(
      `  @ ${start.lineCol}..${end.lineCol} (offset ${start.offset}..${end.offset}) ${JSON.stringify(text)}`,
    );
    lines.push(`    vscode: ${start.vscode.join(" / ")}`);
    lines.push(`    tree:   ${start.tree.join(" / ")}`);
    i = j + 1;
  }
  return lines.join("\n");
}

function sameStacks(a: CharDivergence, b: CharDivergence): boolean {
  return (
    a.vscode.join("\u0000") === b.vscode.join("\u0000") &&
    a.tree.join("\u0000") === b.tree.join("\u0000")
  );
}

import type { SyntaxNode } from "@lezer/common";
import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { blockIsClosed } from "../../compiler/lower/utils/structBodyEntries";
import {
  braceBodyParts,
  keywordBraceBody,
  keywordWithBody,
  STRUCT_KEYWORD_BLOCK_NAMES,
} from "../../compiler/utils/braceBlocks";
import { declares } from "../../compiler/utils/declarationOnly";
import { parseSource } from "./grammarSnapshot";
import { tokenize, type VsTokenDump } from "./vscodeGrammarSnapshot";

const CORPUS_DIRS = [
  "packages/sparkdown/src/tests",
  "packages/sparkdown-language-server/src/tests",
  "docs/sparkle",
];

const CORPUS_FILES = ["packages/sparkdown/src/compiler/builtins/builtins.sd"];

const KEYWORDS: Record<string, string> = {
  LuauStyle: "style",
  LuauAnimation: "animation",
  LuauTheme: "theme",
  LuauMorph: "morph",
  LuauLayout: "layout",
  LuauComponent: "component",
  LuauScreen: "screen",
};

const UNCLOSED: Record<string, string> = {
  style: "style open_probe {\n  color = red\n\n",
  layout: 'layout open_probe {\n  row { text "a" }\n\n',
};

const CLOSED = "style closed_probe {}\n\n";

export interface CorpusFile {
  path: string;
  text: string;
}

export interface DeclarationLine {
  path: string;
  line: string;
  node: string;
}

export interface BodyProbe {
  path: string;
  keyword: string;
  probe: string;
  indented: string;
}

export interface BoundaryFailure {
  check: string;
  path: string;
  text: string;
}

function walk(dir: string, out: string[]) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (entry.endsWith(".sd")) out.push(full);
  }
}

export function readCorpus(root: string): CorpusFile[] {
  const paths: string[] = CORPUS_FILES.map((file) => join(root, file));
  for (const dir of CORPUS_DIRS) walk(join(root, dir), paths);
  return paths.map((path) => ({
    path: relative(root, path).replace(/\\/g, "/"),
    text: readFileSync(path, "utf8").replace(/\r\n?/g, "\n"),
  }));
}

function lineAt(text: string, from: number): { start: number; text: string } {
  const start = text.lastIndexOf("\n", from - 1) + 1;
  const end = text.indexOf("\n", start);
  return { start, text: text.slice(start, end < 0 ? undefined : end) };
}

function topLevelAt(text: string, offset: number): SyntaxNode | null {
  const tree = parseSource(text);
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    if (node.from <= offset && offset < node.to) return node;
  }
  return null;
}

export function declarationLines(corpus: CorpusFile[]): DeclarationLine[] {
  const seen = new Set<string>();
  const lines: DeclarationLine[] = [];
  for (const file of corpus) {
    const read = (from: number, to: number) => file.text.slice(from, to);
    const tree = parseSource(file.text);
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      if (!declares(node, read)) continue;
      const line = lineAt(file.text, node.from);
      if (line.start !== node.from || /^\s/.test(line.text)) continue;
      if (seen.has(line.text)) continue;
      seen.add(line.text);
      lines.push({ path: file.path, line: line.text, node: node.name });
    }
  }
  return lines;
}

function bodyRange(node: SyntaxNode): { from: number; to: number } | null {
  const brace = keywordBraceBody(node);
  if (brace) {
    if (!blockIsClosed(brace)) return null;
    const { begin, end } = braceBodyParts(brace);
    return begin && end ? { from: begin.to, to: end.from } : null;
  }
  const withBody = keywordWithBody(node);
  const end = node.lastChild;
  if (!withBody || !end || end.name !== `${node.name}_end` || end.to <= end.from) return null;
  const begin = withBody.firstChild;
  return { from: begin?.to ?? withBody.from, to: withBody.to };
}

export function bodyProbes(corpus: CorpusFile[]): BodyProbe[] {
  const seen = new Set<string>();
  const probes: BodyProbe[] = [];
  for (const file of corpus) {
    const tree = parseSource(file.text);
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      if (!STRUCT_KEYWORD_BLOCK_NAMES.has(node.name)) continue;
      const range = bodyRange(node);
      if (!range) continue;
      const lines = file.text.slice(range.from, range.to).split("\n");
      if (!lines.some((line) => line.trim())) continue;
      const keyword = KEYWORDS[node.name]!;
      const wrap = (body: string[]) => `${keyword} probe {\n${body.join("\n")}\n}\n`;
      const dedented = lines.map((line) => line.trimStart());
      const probe = wrap(dedented);
      if (seen.has(probe)) continue;
      seen.add(probe);
      const indented = wrap(dedented.map((line) => (line ? `  ${line}` : line)));
      probes.push({ path: file.path, keyword, probe, indented });
    }
  }
  return probes;
}

export function treeDeclarationFailures(lines: DeclarationLine[]): BoundaryFailure[] {
  const failures: BoundaryFailure[] = [];
  for (const { path, line } of lines) {
    const expected = topLevelAt(`${CLOSED}${line}\n`, CLOSED.length)?.name;
    for (const [opened, prefix] of Object.entries(UNCLOSED)) {
      const found = topLevelAt(`${prefix}${line}\n`, prefix.length);
      if (!found || found.from !== prefix.length || found.name !== expected) {
        failures.push({ check: `tree after an unclosed ${opened}`, path, text: line });
      }
    }
  }
  return failures;
}

const lineTokens = (dumps: VsTokenDump[], index: number) =>
  JSON.stringify(dumps[index]?.tokens.map((token) => [token.text, token.scopes]));

export async function vscodeDeclarationFailures(lines: DeclarationLine[]): Promise<BoundaryFailure[]> {
  const failures: BoundaryFailure[] = [];
  for (const { path, line } of lines) {
    const expected = lineTokens(await tokenize(`${CLOSED}${line}\n`), 2);
    for (const [opened, prefix] of Object.entries(UNCLOSED)) {
      const index = prefix.split("\n").length - 1;
      if (lineTokens(await tokenize(`${prefix}${line}\n`), index) !== expected) {
        failures.push({ check: `vscode after an unclosed ${opened}`, path, text: line });
      }
    }
  }
  return failures;
}

function bodyExtent(probe: string): string {
  const node = parseSource(probe).topNode.firstChild;
  const brace = node ? keywordBraceBody(node) : null;
  const lines = (offset: number) => probe.slice(0, offset).split("\n").length;
  return JSON.stringify([
    node?.name,
    node ? lines(node.to) : null,
    brace ? blockIsClosed(brace) : null,
  ]);
}

export function treeBodyFailures(probes: BodyProbe[]): BoundaryFailure[] {
  const failures: BoundaryFailure[] = [];
  for (const { path, keyword, probe, indented } of probes) {
    if (bodyExtent(probe) !== bodyExtent(indented)) {
      failures.push({ check: `tree body of ${keyword}`, path, text: probe });
    }
  }
  return failures;
}

const lastLineTokens = (dumps: VsTokenDump[]) => lineTokens(dumps, dumps.length - 2);

export async function vscodeBodyFailures(probes: BodyProbe[]): Promise<BoundaryFailure[]> {
  const failures: BoundaryFailure[] = [];
  for (const { path, keyword, probe, indented } of probes) {
    if (lastLineTokens(await tokenize(probe)) !== lastLineTokens(await tokenize(indented))) {
      failures.push({ check: `vscode body of ${keyword}`, path, text: probe });
    }
  }
  return failures;
}

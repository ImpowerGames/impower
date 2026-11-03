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

export interface CorpusFile {
  path: string;
  text: string;
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

export function bodyProbe(path: string, keyword: string, lines: string[]): BodyProbe {
  const wrap = (body: string[]) => `${keyword} probe {\n${body.join("\n")}\n}\n`;
  const dedented = lines.map((line) => line.trimStart());
  const indented = dedented.map((line) => (line ? `  ${line}` : line));
  return { path, keyword, probe: wrap(dedented), indented: wrap(indented) };
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
      const probe = bodyProbe(file.path, KEYWORDS[node.name]!, lines);
      if (seen.has(probe.probe)) continue;
      seen.add(probe.probe);
      probes.push(probe);
    }
  }
  return probes;
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

export function closesAtItsBrace({ keyword, probe }: BodyProbe): boolean {
  const name = Object.keys(KEYWORDS).find((key) => KEYWORDS[key] === keyword);
  return bodyExtent(probe) === JSON.stringify([name, probe.split("\n").length - 1, true]);
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

const lastLineTokens = (dumps: VsTokenDump[]) =>
  JSON.stringify(dumps[dumps.length - 2]?.tokens.map((token) => [token.text, token.scopes]));

export async function vscodeBodyFailures(probes: BodyProbe[]): Promise<BoundaryFailure[]> {
  const failures: BoundaryFailure[] = [];
  for (const { path, keyword, probe, indented } of probes) {
    if (lastLineTokens(await tokenize(probe)) !== lastLineTokens(await tokenize(indented))) {
      failures.push({ check: `vscode body of ${keyword}`, path, text: probe });
    }
  }
  return failures;
}

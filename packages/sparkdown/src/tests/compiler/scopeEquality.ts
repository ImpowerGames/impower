// Engine-equality harness.
//
// We ship ONE TextMate grammar JSON to two engines:
//   1. vscode-textmate (+ vscode-oniguruma) — what VSCode uses for editor
//      syntax highlighting. We do NOT control this engine.
//   2. textmate-grammar-tree — our re-implementation, used by the language
//      server, the screenplay-preview decorator, and the PDF exporter.
//
// The whole point of sharing a grammar is that both engines must agree on the
// interpretation of every source position: the TextMate scope stack VSCode
// computes at column N must match the node ancestry textmate-grammar-tree
// builds at column N (after mapping tree nodes back to their TextMate scope
// names). When they disagree, syntax highlighting and semantic features drift
// apart — and because vscode-textmate is the engine we ship to users and
// cannot patch, ANY disagreement is a grammar bug we must fix in the grammar.
//
// This module runs a source through both engines and produces a per-character
// scope-stack comparison. See packages/sparkdown/docs/compiler/GRAMMAR.md §17.

import GRAMMAR_DEFINITION from "../../../language/sparkdown.language-grammar.json";
import { getParser, parseSource } from "./grammarSnapshot";
import { tokenize } from "./vscodeGrammarSnapshot";

const GRAMMAR = GRAMMAR_DEFINITION as any;
const SCOPE_NAME: string = GRAMMAR.scopeName;

// Build maps from every tree node type id -> the TextMate scope it
// contributes. The tree's lezer node `name` is the grammar rule's *typeId*
// (its repository key, or a generated capture/begin/end/content id), NOT its
// TextMate scope. The TextMate scope (`name` / `contentName`) lives on the
// GrammarNode's `props`. Reading it straight from the live grammar nodes is
// the only robust source: it correctly carries scopes declared directly on a
// capture group (e.g. an operator captured as `beginCaptures.2.name`), which
// is impossible to reconstruct by parsing node-name suffixes.
//
// TextMate distinguishes `name` (applies to a rule's WHOLE span) from
// `contentName` (applies ONLY to the content between a begin/end pair). The
// tree models that split structurally: a Scoped rule `<Rule>` node spans the
// whole begin..end region, and its `<Rule>_content` child spans exactly the
// content. So `name` maps to the `<Rule>` node and `contentName` maps to the
// `<Rule>_content` node — applying each to the right sub-range automatically.
// `tag` is intentionally ignored: it is a CodeMirror/lezer highlight tag, not
// a TextMate scope, and vscode-textmate never sees it.
const NAME_BY_TYPE_ID = new Map<string, string>();
const CONTENT_NAME_BY_TYPE_ID = new Map<string, string>();
for (const node of (getParser() as any).grammar.nodes as any[]) {
  const props = node?.props ?? {};
  if (typeof props.name === "string") {
    NAME_BY_TYPE_ID.set(node.typeId, props.name);
  }
  if (typeof props.contentName === "string") {
    CONTENT_NAME_BY_TYPE_ID.set(node.typeId, props.contentName);
  }
}

/**
 * Maps a textmate-grammar-tree node name (its lezer typeId) back to the
 * TextMate scope it contributes (the `name` / `contentName` the same rule
 * pushes under vscode-textmate), or `undefined` for purely structural nodes.
 */
export function treeNodeScope(nodeName: string): string | undefined {
  const name = NAME_BY_TYPE_ID.get(nodeName);
  if (name !== undefined) return name;
  // `<Rule>_content` carries the parent rule's `contentName`. The content
  // node itself has no scope prop — the `contentName` lives on the parent
  // `<Rule>` grammar node (begin/end rules store it there).
  if (nodeName.endsWith("_content")) {
    const parent = nodeName.slice(0, -"_content".length);
    return CONTENT_NAME_BY_TYPE_ID.get(parent);
  }
  return undefined;
}

/** The TextMate scope stack the tree assigns to the character at `offset`. */
export function treeScopeStackAt(tree: any, offset: number): string[] {
  // `resolveInner(offset, 1)` resolves at the boundary leaning right, i.e. the
  // deepest node covering the character that STARTS at `offset`.
  const node = tree.resolveInner(offset, 1);
  const chain: string[] = [];
  let n: any = node;
  while (n) {
    chain.unshift(n.name);
    n = n.parent;
  }
  const scopes: string[] = [SCOPE_NAME];
  for (const name of chain) {
    const sc = treeNodeScope(name);
    // A TextMate `name` may list several space-separated scopes; vscode-textmate
    // pushes each as its own stack entry, so split to match.
    if (sc) {
      for (const part of sc.split(/\s+/)) {
        if (part) scopes.push(part);
      }
    }
  }
  return scopes;
}

/**
 * The TextMate scope stack vscode-textmate assigns to every character offset
 * of `source`. Characters not covered by any token (newlines, blank lines)
 * get the bare root scope — matching how the tree leaves them at root.
 */
export async function vscodeScopeStacksPerChar(
  source: string,
): Promise<string[][]> {
  // `source` is expected to already be newline-normalized (see compareEngines).
  const dumps = await tokenize(source);
  const perChar: string[][] = new Array(source.length);
  // Pre-fill with the bare root scope (covers newlines / blank lines / any
  // gap vscode-textmate doesn't emit a token for).
  for (let i = 0; i < source.length; i++) perChar[i] = [SCOPE_NAME];

  // `tokenize` splits on \n; reconstruct absolute offsets the same way.
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
    lineStart += lines[li]!.length + 1; // +1 for the '\n' split
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
  /** The newline-normalized source the comparison ran against. */
  source: string;
  divergences: CharDivergence[];
}

/**
 * Compares the scope stack at every character of `source` between the two
 * engines.
 *
 * Newline characters are intentionally NOT compared: vscode-textmate
 * tokenizes one line at a time with the trailing `\n` stripped, so it
 * structurally never assigns a scope to a line break, whereas the tree models
 * line breaks as explicit `Newline` nodes. That difference is invisible to a
 * reader (you can't highlight a line break) and would otherwise drown out the
 * real divergences. Any genuine over-/under-scoping still surfaces on the
 * non-newline characters of the affected lines.
 */
export async function compareEnginesFull(
  rawSource: string,
): Promise<EngineComparison> {
  // Feed the byte-identical, newline-normalized string to BOTH engines so
  // character offsets line up. (vscode-textmate's snapshot helper normalizes
  // CRLF internally; the tree parses whatever it is handed — so we normalize
  // up front and compare on the normalized string.)
  const source = rawSource.replace(/\r\n?/g, "\n");
  const tree = parseSource(source);
  const vscodePerChar = await vscodeScopeStacksPerChar(source);

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
    const treeScopes = treeScopeStackAt(tree, i);
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

/** Convenience wrapper returning just the divergence list. */
export async function compareEngines(
  rawSource: string,
): Promise<CharDivergence[]> {
  return (await compareEnginesFull(rawSource)).divergences;
}

function scopeStacksEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Renders divergences as a readable report for assertion messages. */
export function formatDivergences(
  source: string,
  divergences: CharDivergence[],
): string {
  if (divergences.length === 0) return "(engines agree at every character)";
  const lines: string[] = [];
  lines.push(
    `${divergences.length} divergent character(s) between vscode-textmate and textmate-grammar-tree:`,
  );
  // Collapse consecutive offsets with identical stacks into ranges for brevity.
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
    a.vscode.join(" ") === b.vscode.join(" ") &&
    a.tree.join(" ") === b.tree.join(" ")
  );
}

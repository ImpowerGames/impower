// Incremental-reuse harness for textmate-grammar-tree, driven through the real
// sparkdown grammar. Two guarantees we care about:
//   1. CORRECTNESS — an incremental reparse after an edit must produce a tree
//      byte-identical to a from-scratch parse of the edited source.
//   2. BOUNDEDNESS — the re-tokenized span should be ~the edited construct, not
//      the whole enclosing block. (Today, editing inside a then/choose/if/for/
//      while block re-tokenizes the entire block — the perf bug we're fixing.)
//
// Mirrors the incremental driver in SparkdownDocumentRegistry: full parse ->
// addTree -> on edit, applyChanges(fragments, [changedRange]) -> parse(newText,
// fragments).

import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { getParser } from "../compiler/grammarSnapshot";

export interface Edit {
  /** Start offset of the replaced range. */
  from: number;
  /** End offset of the replaced range (== from for pure insertion). */
  to: number;
  /** Replacement text. */
  insert: string;
}

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(ESC + "\\[\\d+(?:;\\d+)*m", "g");
const stripAnsi = (s: string) => s.replace(ANSI, "");

export function fullParse(text: string): Tree {
  return getParser().parse(text);
}

export function applyEdit(text: string, e: Edit): string {
  return text.slice(0, e.from) + e.insert + text.slice(e.to);
}

export interface IncResult {
  newText: string;
  incTree: Tree;
  scratchTree: Tree;
  /** True if the incremental tree is byte-identical to a from-scratch parse. */
  identical: boolean;
  /** Structural diff (empty when identical). */
  diff: string;
  /** The span the engine actually re-tokenized, or null if a full reparse. */
  reparsed: { from: number; to: number } | null;
}

/** Reads the re-tokenized span recorded on the tree's cached compiler. */
export function reparsedSpan(tree: Tree): { from: number; to: number } | null {
  const c: any = tree.prop(cachedCompilerProp as any);
  if (!c) return null;
  const from = c.reparsedFrom;
  const to = c.reparsedTo;
  if (from == null && to == null) return null;
  return { from: from ?? 0, to: to ?? tree.length };
}

function firstDiff(a: string, b: string): string {
  const la = a.split("\n");
  const lb = b.split("\n");
  const n = Math.max(la.length, lb.length);
  for (let i = 0; i < n; i++) {
    if (la[i] !== lb[i]) {
      return `line ${i + 1}:\n  inc:     ${JSON.stringify(la[i])}\n  scratch: ${JSON.stringify(lb[i])}`;
    }
  }
  return "";
}

/**
 * Full-parse `text`, apply `edit`, incrementally reparse, and compare against a
 * from-scratch parse of the edited text.
 */
export function editAndReparse(text: string, edit: Edit): IncResult {
  const parser = getParser();
  const fullTree = parser.parse(text);

  const newText = applyEdit(text, edit);
  let fragments = TreeFragment.addTree(fullTree);
  const change = {
    fromA: edit.from,
    toA: edit.to,
    fromB: edit.from,
    toB: edit.from + edit.insert.length,
  };
  fragments = TreeFragment.applyChanges(fragments, [change]);

  const incTree = parser.parse(newText, fragments);
  const scratchTree = parser.parse(newText);

  const incStr = stripAnsi(printTree(incTree, newText));
  const scratchStr = stripAnsi(printTree(scratchTree, newText));
  const identical = incStr === scratchStr;

  return {
    newText,
    incTree,
    scratchTree,
    identical,
    diff: identical ? "" : firstDiff(incStr, scratchStr),
    reparsed: reparsedSpan(incTree),
  };
}

/** Convenience: build an edit that replaces the first occurrence of `find`. */
export function replaceEdit(text: string, find: string, insert: string): Edit {
  const from = text.indexOf(find);
  if (from < 0) throw new Error(`replaceEdit: ${JSON.stringify(find)} not found`);
  return { from, to: from + find.length, insert };
}

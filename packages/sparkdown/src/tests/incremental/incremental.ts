import { cachedCompilerProp } from "@impower/textmate-grammar-tree/src/tree/props/cachedCompilerProp";
import { printTree } from "@impower/textmate-grammar-tree/src/tree/utils/printTree";
import { type Tree, TreeFragment } from "@lezer/common";
import { getParser } from "../compiler/grammarSnapshot";

export interface Edit {
  from: number;
  to: number;
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
  identical: boolean;
  diff: string;
  reparsed: { from: number; to: number } | null;
}

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

export function replaceEdit(text: string, find: string, insert: string): Edit {
  const from = text.indexOf(find);
  if (from < 0) throw new Error(`replaceEdit: ${JSON.stringify(find)} not found`);
  return { from, to: from + find.length, insert };
}

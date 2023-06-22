import { foldInside } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import { SyntaxNode } from "@lezer/common";

/**
 * `offset(n n)`, `offset(-2 -5)`, `offset(+1 2)`, `offset(0 0)`, etc.
 *
 * 1. Left offset
 * 2. Right offset
 */
const PARSE_OFFSET_FOLD_REGEX = /^offset\(([+-]?\d+),\s+([+-]?\d+)\)$/;

/** Parses a `fold` string, returning a CodeMirror `foldNodeProp` compatible function. */
const parseFold = (
  fold: true | string
): ((
  node: SyntaxNode,
  state: EditorState
) => { from: number; to: number } | null) => {
  // prettier-ignore
  switch (fold) {
  // folds entire node
  case true: return node => ({ from: node.from, to: node.to })
  // folds between two delimiters, which are the first and last child
  case "inside": return foldInside
  // folds everything past the first-ish line
  case "past_first_line": return (node, state) => ({
    from: Math.min(node.from + 20, state.doc.lineAt(node.from).to),
    to: node.to - 1
  })
  // like the "true" case, except with an offset
  // (or the fold string is invalid)
  default: {
    if (fold.startsWith("offset")) {
      const match = PARSE_OFFSET_FOLD_REGEX.exec(fold)
      if (!match) { 
        throw new Error("Invalid fold offset");
      }
      const left = parseInt(match[1]!, 10)
      const right = parseInt(match[2]!, 10)
      return node => ({ from: node.from + left, to: node.to + right })
    } else {
      throw new Error(`Unknown fold option: ${fold}`)
    }
  }
}
};

export default parseFold;

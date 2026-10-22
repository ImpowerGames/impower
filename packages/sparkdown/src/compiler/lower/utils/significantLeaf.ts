import { type SyntaxNode } from "@lezer/common";
import { nodeNameSet } from "../../utils/nodeNameSet";

// The lines that continue the line before them, the trivia between a line
// and the line that continues it, and the trivia a statement's last
// significant token is read past. They stand apart from
// `lineContinuation.ts` so that the define body's statement reading
// (`defineStatement.ts`), which the type checker's node questions ask, does
// not load the lowerer's continuation reading.

export const LINE_CONTINUATION = nodeNameSet([
  "LuauLineContinuation",
  "LuauMinusLineContinuation",
  "LuauIndexerLineContinuation",
]);

// Whether `node` is a line that continues the line before it.
export function isLineContinuation(node: { name: string }): boolean {
  return LINE_CONTINUATION.has(node.name);
}

export const CONTINUATION_BRIDGE: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
  "LuauTypeTrailingBlockCommentClose",
]);

export const SKIPPABLE: ReadonlySet<string> = new Set([
  ...CONTINUATION_BRIDGE,
  "Whitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "LuauComment",
  "LuauReturnLineBreak",
]);

export function lastSignificantLeaf(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (SKIPPABLE.has(child.name) || child.from === child.to) continue;
    if (!child.firstChild) return child;
    const leaf = lastSignificantLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

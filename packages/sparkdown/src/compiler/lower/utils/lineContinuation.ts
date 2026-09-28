import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { LowerContext } from "../context";

// A `LuauLineContinuation` is a line of Luau code that begins with `.name` or
// `:name` and so continues the expression on the line before it (`t` then
// `.a` reads as `t.a`). The grammar cannot nest it in the expression, which
// has already closed at its own line's end, so it is a sibling of the
// statement that line ended, and the lowerer joins the two.

const CONTINUATION_BRIDGE: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
]);

// The lines that continue the statement `node`: each `LuauLineContinuation`
// after it, with the rest of its line (`.a + 1`), across any blank or comment
// lines between them, as Luau reads them. Empty when the next line of code
// does not continue it.
export function collectLineContinuation(node: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  let scan = node.nextSibling;
  for (;;) {
    while (scan && CONTINUATION_BRIDGE.has(scan.name)) scan = scan.nextSibling;
    if (!scan || scan.name !== "LuauLineContinuation") return nodes;
    while (scan && scan.name !== "Newline") {
      nodes.push(scan);
      scan = scan.nextSibling;
    }
  }
}

// Take the continuation `lowerStatements` set for the statement being
// lowered, so that nothing lowered inside the statement takes it as well.
export function takeLineContinuation(ctx: LowerContext): SyntaxNode[] {
  const nodes = ctx.lineContinuation ?? [];
  ctx.lineContinuation = null;
  return nodes;
}

// Report continuation lines that no value on the line before them takes:
// one after a statement that does not end in a value (`end`, `break`), or
// with no statement before it in its block.
export function reportUntakenLineContinuation(
  nodes: SyntaxNode[],
  ctx: LowerContext,
): void {
  for (const node of nodes) {
    if (node.name !== "LuauLineContinuation") continue;
    const raw = ctx.read(node.from, node.to);
    const text = raw.trim();
    const from = node.from + raw.length - raw.trimStart().length;
    ctx.diagnostics?.push({
      message: `\`${text}\` continues the line before it, which does not end in a value to access. Join it to the value it reads from.`,
      severity: ErrorType.Error,
      source: {
        fileName: null,
        filePath: ctx.filePath ?? null,
        startLineNumber: ctx.lineNumber(from) + 1,
        endLineNumber: ctx.lineNumber(node.to) + 1,
        startCharacterNumber: ctx.characterNumber(from) + 1,
        endCharacterNumber: ctx.characterNumber(node.to) + 1,
      },
    });
  }
}

// Replace each `LuauLineContinuation` in `nodes` with the access parts,
// call arguments and indexers it holds, so that they read as the parts
// that follow the value before them.
export function expandLineContinuations(nodes: SyntaxNode[]): SyntaxNode[] {
  if (!nodes.some((n) => n.name === "LuauLineContinuation")) return nodes;
  const expanded: SyntaxNode[] = [];
  for (const node of nodes) {
    if (node.name !== "LuauLineContinuation") {
      expanded.push(node);
      continue;
    }
    let content = node.firstChild;
    while (content && content.name !== "LuauLineContinuation_content") {
      content = content.nextSibling;
    }
    for (let part = content?.firstChild; part; part = part.nextSibling) {
      expanded.push(part);
    }
  }
  return expanded;
}

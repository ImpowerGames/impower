import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { LowerContext } from "../context";

// A `LuauLineContinuation` is a line of Luau code that begins with `.name`,
// `:name` or a binary operator and so continues the expression on the line
// before it (`t` then `.a` reads as `t.a`). The grammar cannot nest it in the
// expression, which has already closed at its own line's end, so it is a
// sibling of the statement that line ended, and the lowerer joins the two.
//
// A statement's lowerer receives the lines that continue it through
// `ctx.lineContinuation`. A line counts as taken only once its parts are
// lowered into a value (`expandLineContinuations`) or read as a type
// qualifier (`markLineContinuationUsed`); `lowerStatements` reports every line
// that was not.

const CONTINUATION_BRIDGE: ReadonlySet<string> = new Set([
  "Newline",
  "ExtraWhitespace",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
]);

const SKIPPABLE: ReadonlySet<string> = new Set([
  ...CONTINUATION_BRIDGE,
  "Whitespace",
  "OptionalWhitespace",
  "RequiredWhitespace",
  "LuauComment",
  "LuauReturnLineBreak",
]);

// The lines that continue the statement `node`: each `LuauLineContinuation`
// after it, with the rest of its line (`.a = 1`), across any blank or comment
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

// Record that the continuation lines among `nodes` were used.
export function markLineContinuationUsed(
  nodes: SyntaxNode[],
  ctx: LowerContext,
): void {
  for (const node of nodes) {
    if (node.name === "LuauLineContinuation") {
      ctx.usedLineContinuations?.add(node.from);
    }
  }
}

// Whether the continuation line `node` was used.
export function isLineContinuationUsed(
  node: SyntaxNode,
  ctx: LowerContext,
): boolean {
  return ctx.usedLineContinuations?.has(node.from) ?? false;
}

// Report continuation lines, or the access parts of one, that nothing on
// the line before them takes: one after a statement that does not end in a
// value (`end`, a bare `return`), with no statement before it in its block,
// or after a type that is not a name (`t :: { x: number }` then `.a`).
export function reportUntakenLineContinuation(
  nodes: SyntaxNode[],
  ctx: LowerContext,
): void {
  for (const node of nodes) {
    if (node.name !== "LuauLineContinuation" && node.name !== "LuauAccessPart") {
      continue;
    }
    const raw = ctx.read(node.from, node.to);
    const text = raw.trim();
    const from = node.from + raw.length - raw.trimStart().length;
    ctx.diagnostics?.push({
      message: `\`${text}\` continues the line before it, which does not end in a value it can continue. Join it to the value it continues.`,
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

// Replace each `LuauLineContinuation` in `nodes` with the access parts, call
// arguments, indexers and operations it holds, so that they read as the parts
// that follow the value before them. A continuation line with no value before
// it in `nodes` (the first value of a group, or the first after a comma or an
// assignment operator) is reported and left out.
export function expandLineContinuations(
  nodes: SyntaxNode[],
  ctx: LowerContext,
): SyntaxNode[] {
  if (!nodes.some((n) => n.name === "LuauLineContinuation")) return nodes;
  const expanded: SyntaxNode[] = [];
  let hasValue = false;
  for (const node of nodes) {
    if (node.name !== "LuauLineContinuation") {
      expanded.push(node);
      if (
        node.name === "LuauCommaSeparator" ||
        node.name === "LuauAssignmentOperator"
      ) {
        hasValue = false;
      } else if (!SKIPPABLE.has(node.name)) {
        hasValue = true;
      }
      continue;
    }
    if (!hasValue) {
      reportUntakenLineContinuation([node], ctx);
      markLineContinuationUsed([node], ctx);
      continue;
    }
    markLineContinuationUsed([node], ctx);
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      expanded.push(part);
    }
  }
  return expanded;
}

// Whether `nodes` are continuation lines that only qualify a type name
// (`types` then `.Button`), which Luau reads as one qualified type.
export function isTypeQualifierContinuation(nodes: SyntaxNode[]): boolean {
  let lines = 0;
  for (const node of nodes) {
    if (SKIPPABLE.has(node.name)) continue;
    if (node.name !== "LuauLineContinuation") return false;
    lines++;
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      if (SKIPPABLE.has(part.name)) continue;
      if (
        part.name !== "LuauAccessPart" ||
        part.firstChild?.name !== "LuauPropertyAccessor"
      ) {
        return false;
      }
    }
  }
  return lines > 0;
}

// Whether the type syntax in `node` ends in a type name, leaving out any
// comment and whitespace after it, so that a `.Name` continuation can
// qualify it (`types` then `.Button`, but not `{ x: number }` then `.b`).
// A `::` cast's type parses as a value, so its name is a `LuauVariable`, and a
// module named like a primitive (`string` then `.Button`) reads as a
// `LuauPrimitiveType` until its qualifier is on the same line.
const TYPE_NAME_NODES: ReadonlySet<string> = new Set([
  "LuauTypeName",
  "LuauPrimitiveType",
  "LuauVariable",
]);

export function endsInTypeName(node: SyntaxNode): boolean {
  for (let n = lastSignificantLeaf(node); n && n !== node; n = n.parent) {
    if (TYPE_NAME_NODES.has(n.name)) return true;
  }
  return false;
}

function lastSignificantLeaf(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.lastChild; child; child = child.prevSibling) {
    if (SKIPPABLE.has(child.name) || child.from === child.to) continue;
    if (!child.firstChild) return child;
    const leaf = lastSignificantLeaf(child);
    if (leaf) return leaf;
  }
  return null;
}

// Split `nodes` into its comma-separated groups, leaving out line breaks,
// whitespace and comments. The first group continues the value before the
// continuation; each later group is a further value.
export function splitOnCommas(nodes: SyntaxNode[]): SyntaxNode[][] {
  if (nodes.length === 0) return [];
  const groups: SyntaxNode[][] = [[]];
  for (const node of nodes) {
    if (node.name === "LuauCommaSeparator") groups.push([]);
    else if (!SKIPPABLE.has(node.name)) groups[groups.length - 1]!.push(node);
  }
  return groups;
}

function lineContinuationContent(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauLineContinuation_content") return child.firstChild;
  }
  return null;
}

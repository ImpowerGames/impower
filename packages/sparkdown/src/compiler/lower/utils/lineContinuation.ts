import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { LowerContext } from "../context";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import { findOwnDeclarationName } from "./findOwnDeclarationName";

// A `LuauLineContinuation` is a line of Luau code that begins with `.name`,
// `:name`, a binary operator or a cast's `::` and so continues the expression
// on the line before it (`t` then `.a` reads as `t.a`). In a statement body a
// line that begins with `-` does too (`LuauMinusLineContinuation`), since no
// statement begins with `-`, and outside a table a line that begins with `[`
// indexes it (`LuauIndexerLineContinuation`). The grammar cannot nest these
// in the expression, which has already closed at its own line's end, so each
// is a sibling of the statement that line ended, and the lowerer joins the two.
//
// A statement's lowerer receives the lines that continue it through
// `ctx.lineContinuation`. A line counts as taken only once its parts are
// lowered into a value (`expandLineContinuations`) or read as a type
// qualifier (`markLineContinuationUsed`); `lowerStatements` reports every line
// that was not.

const LINE_CONTINUATION = nodeNameSet([
  "LuauLineContinuation",
  "LuauMinusLineContinuation",
  "LuauIndexerLineContinuation",
]);

// Whether `node` is a line that continues the line before it.
export function isLineContinuation(node: { name: string }): boolean {
  return LINE_CONTINUATION.has(node.name);
}

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

// The lines that continue the statement `node`: each continuation line after
// it, with the rest of its line (`.a = 1`), across any blank or comment
// lines between them, as Luau reads them. Empty when the next line of code
// does not continue it.
//
// In a Luau declaration or reassignment a continued line that ends with a
// comma carries the list onto the next line of code, as the statement's own
// line-ending comma does (`n` then `+ 4,` then `5`), unless that line starts
// a statement; the comma is then left without a value, and the statement
// reports it.
const COMMA_CARRYING_STATEMENTS = nodeNameSet([
  "LuauVariableDefinition",
  "LuauReassignment",
]);

export function collectLineContinuation(node: SyntaxNode): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  let scan = node.nextSibling;
  for (;;) {
    while (scan && CONTINUATION_BRIDGE.has(scan.name)) scan = scan.nextSibling;
    if (!scan) return nodes;
    const carried =
      COMMA_CARRYING_STATEMENTS.has(node.name) &&
      lastSignificant(nodes)?.name === "LuauCommaSeparator" &&
      !startsStatement(scan);
    if (!carried && !isLineContinuation(scan)) return nodes;
    while (scan && scan.name !== "Newline") {
      nodes.push(scan);
      scan = scan.nextSibling;
    }
  }
}

function lastSignificant(nodes: SyntaxNode[]): SyntaxNode | undefined {
  for (let i = nodes.length - 1; i >= 0; i--) {
    if (!SKIPPABLE.has(nodes[i]!.name)) return nodes[i];
  }
  return undefined;
}

// The statements `LuauDeclarations` reaches besides the trailing ones, and
// the blocks and loops `LuauControlBlock` does (matched by their suffix).
// `statementBoundary.test.ts` holds this classification to the grammar.
const DECLARATION_STATEMENTS = nodeNameSet([
  "LuauFunctionTypeDeclaration",
  "LuauDataTypeDeclaration",
  "LuauDefine",
  "LuauShebang",
  "LuauStyle",
  "LuauLayout",
  "LuauScreen",
  "LuauComponent",
  "LuauAnimation",
  "LuauTheme",
  "LuauMorph",
]);

// Whether `name` is a node that starts a statement in a block, or a `;`
// that ends one, so no value can begin with it.
export function isStatementNodeName(name: string): boolean {
  return (
    name === "LuauSemicolonSeparator" ||
    TRAILING_STATEMENT_NAMES.has(name) ||
    DECLARATION_STATEMENTS.has(name) ||
    /(?:Block|Blocks|Loop)$/.test(name)
  );
}

// Whether `node`, the first node of a line in a block, is a statement rather
// than a value: an anonymous function is a value.
function startsStatement(node: SyntaxNode): boolean {
  if (node.name === "LuauFunctionDefinition") {
    return findOwnDeclarationName(node) != null;
  }
  return isStatementNodeName(node.name);
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
    if (isLineContinuation(node)) {
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
// `advice` replaces the default advice, to join the line to its value.
export function reportUntakenLineContinuation(
  nodes: SyntaxNode[],
  ctx: LowerContext,
  advice = "Join it to the value it continues.",
): void {
  for (const node of nodes) {
    if (!isLineContinuation(node) && node.name !== "LuauAccessPart") {
      continue;
    }
    const raw = ctx.read(node.from, node.to);
    const text = raw.trim();
    const from = node.from + raw.length - raw.trimStart().length;
    ctx.diagnostics?.push({
      message: `\`${text}\` continues the line before it, which does not end in a value it can continue. ${advice}`,
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

// Replace each continuation line in `nodes` with the access parts, call
// arguments, indexers and operations it holds, so that they read as the parts
// that follow the value before them. A continuation line with no value before
// it in `nodes` (the first value of a group, or the first after a comma or an
// assignment operator) is reported and left out.
export function expandLineContinuations(
  nodes: SyntaxNode[],
  ctx: LowerContext,
): SyntaxNode[] {
  if (!nodes.some(isLineContinuation)) return nodes;
  const expanded: SyntaxNode[] = [];
  let hasValue = false;
  for (const node of nodes) {
    if (!isLineContinuation(node)) {
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
    if (!isLineContinuation(node)) return false;
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

// Luau reads at most one module prefix in a type name (`module.Type`).
export const TYPE_NAME_EXTRA_QUALIFIER =
  "A type name takes at most one module prefix\n> e.g. `types.Button`, not `types.ui.Button`";

// How many dot-separated segments the type name that the type syntax in
// `node` ends with has, leaving out any comment and whitespace after it, or 0
// when it does not end in a name, so that a `.Name` continuation can qualify
// it (`types` then `.Button`, but not `{ x: number }` then `.b`). A `::`
// cast's type parses as a value, so its name is a `LuauAccessPath`, and a
// module named like a primitive (`string` then `.Button`) reads as a
// `LuauPrimitiveType` until its qualifier is on the same line.
export function typeNameSegments(node: SyntaxNode): number {
  for (let n = lastSignificantLeaf(node); n && n !== node; n = n.parent) {
    if (n.name === "LuauPrimitiveType") return 1;
    if (n.name === "LuauTypeName") {
      if (hasDescendant(n, "LuauTypeNameExtraQualifier")) return 3;
      return hasDescendant(n, "LuauVariableName") ? 2 : 1;
    }
    if (n.name === "LuauAccessPath") {
      let segments = 0;
      for (let part = firstContentChild(n); part; part = part.nextSibling) {
        if (part.name !== "LuauAccessPart") continue;
        const inner = part.firstChild?.name;
        if (inner !== "LuauVariable" && inner !== "LuauPropertyAccessor") {
          return 0;
        }
        segments++;
      }
      return segments;
    }
  }
  return 0;
}

export function endsInTypeName(node: SyntaxNode): boolean {
  return typeNameSegments(node) > 0;
}

// The access parts of `nodes`: those of each continuation line, and any
// access part already expanded from one.
export function continuationParts(nodes: SyntaxNode[]): SyntaxNode[] {
  const parts: SyntaxNode[] = [];
  for (const node of nodes) {
    if (node.name === "LuauAccessPart") parts.push(node);
    if (!isLineContinuation(node)) continue;
    for (let part = lineContinuationContent(node); part; part = part.nextSibling) {
      if (part.name === "LuauAccessPart") parts.push(part);
    }
  }
  return parts;
}

// Report the continued `parts` that give the type name `typeNode` ends with
// more than one module prefix (`types.ui` then `.Button`), as the same name
// written on one line is reported.
export function reportExtraTypeQualifiers(
  typeNode: SyntaxNode,
  parts: SyntaxNode[],
  ctx: LowerContext,
): void {
  const extra = parts.slice(Math.max(0, 2 - typeNameSegments(typeNode)));
  const first = extra[0];
  const last = extra[extra.length - 1];
  if (!first || !last) return;
  ctx.diagnostics?.push({
    message: TYPE_NAME_EXTRA_QUALIFIER,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(first.from) + 1,
      endLineNumber: ctx.lineNumber(last.to) + 1,
      startCharacterNumber: ctx.characterNumber(first.from) + 1,
      endCharacterNumber: ctx.characterNumber(last.to) + 1,
    },
  });
}

function hasDescendant(node: SyntaxNode, name: string): boolean {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name || hasDescendant(child, name)) return true;
  }
  return false;
}

function firstContentChild(node: SyntaxNode): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) return child.firstChild;
  }
  return null;
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
    if (child.name === `${node.name}_content`) return child.firstChild;
  }
  return null;
}

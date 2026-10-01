import { type SyntaxNode } from "@lezer/common";
import { ErrorType } from "../../../inkjs/compiler/Parser/ErrorType";
import type { LowerContext } from "../context";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import { ownAssignmentOperation } from "../../utils/variableDefinitionNames";
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
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
  "LuauTypeTrailingBlockCommentClose",
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
// In a Luau declaration a continued line that ends with a comma carries the
// list onto the next line of code, as the declaration's own line-ending
// comma does (`n` then `+ 4,` then `5`), unless that line starts a statement;
// the comma is then left without a value, and the declaration reports it.
export function collectLineContinuation(node: SyntaxNode): SyntaxNode[] {
  return collectLineContinuationFrom(node, node.nextSibling);
}

// The lines at the start of a function body that qualify the name its return
// type ends with (`function f(): types` then `.Button`), with that return
// type. A return type takes in the line break after it, so the body opens at
// the next line and those lines are its first children rather than siblings
// of a statement. Null when the body does not start with such lines.
export function leadingReturnTypeQualifier(
  bodyContent: SyntaxNode,
): { returnType: SyntaxNode; lines: SyntaxNode[] } | null {
  const body =
    bodyContent.name === "LuauFunctionBody_content"
      ? bodyContent.parent
      : bodyContent.name === "LuauFunctionBody"
        ? bodyContent
        : null;
  let returnType: SyntaxNode | null = null;
  for (let n = body?.prevSibling ?? null; n; n = n.prevSibling) {
    if (n.name === "LuauFunctionReturnType") returnType = n;
    if (n.name === "LuauFunctionReturnType" || n.name === "LuauFunctionParameters") break;
  }
  if (!returnType || !endsInTypeName(returnType)) return null;
  const lines = collectLineContinuationFrom(null, bodyContent.firstChild);
  if (!isTypeQualifierContinuation(lines)) return null;
  return { returnType, lines };
}

// The continuation lines from `start` on. After the statement `node`, a line
// after a comma that ends a declaration's line is carried too, unless it
// starts a statement.
function collectLineContinuationFrom(
  node: SyntaxNode | null,
  start: SyntaxNode | null,
): SyntaxNode[] {
  const nodes: SyntaxNode[] = [];
  let scan = start;
  for (;;) {
    while (scan && CONTINUATION_BRIDGE.has(scan.name)) scan = scan.nextSibling;
    if (!scan) return nodes;
    const afterComma =
      nodes.length === 0
        ? node != null && endsOnValueComma(node)
        : lastSignificant(nodes)?.name === "LuauCommaSeparator";
    const before = nodes.length > 0 ? lastSignificant(nodes) : node;
    const carried =
      (!startsStatement(scan) &&
        scan.name !== "LuauInvalidStatement" &&
        ((node?.name === "LuauVariableDefinition" && afterComma) ||
          (nodes.length === 0 && node != null && endsOnEmptyAssignment(node)))) ||
      // A string or a table after a value that can be called is its
      // argument, as Luau reads it (`f` then `"x"`, `t.f` then `{ 1 }`): no
      // statement begins with one.
      (CALL_ARGUMENT_NODES.has(scan.name) &&
        before != null &&
        // An argument this collector carried is a call too (`maker` then
        // `"A"` then `"B"`).
        ((nodes.length > 0 && CALL_ARGUMENT_NODES.has(before.name)) ||
          endsInCallee(before)) &&
        inLuauBody(scan));
    if (!carried && !isLineContinuation(scan)) return nodes;
    while (scan && scan.name !== "Newline") {
      nodes.push(scan);
      scan = scan.nextSibling;
    }
  }
}

// The `= value` that ends the union member lines after the declaration
// `node`, across blank and comment lines, which the declaration ended
// before (`local v: number` then `-- note` then `| string = 1`).
export function typeUnionLineValue(node: SyntaxNode): SyntaxNode | null {
  if (!endsInTypeAnnotation(node)) return null;
  let value: SyntaxNode | null = null;
  for (let scan = node.nextSibling; scan; scan = scan.nextSibling) {
    if (SKIPPABLE.has(scan.name)) continue;
    if (scan.name !== "LuauTypeUnionLineContinuation") break;
    for (let part = firstContentChild(scan); part; part = part.nextSibling) {
      if (part.name === "LuauAssignmentOperation") value = part;
    }
  }
  return value;
}

// Whether the declaration `node` ends in its last target's type annotation,
// with no value after it (`local v: number`).
function endsInTypeAnnotation(node: SyntaxNode): boolean {
  if (node.name !== "LuauVariableDefinition" && node.name !== "LuauSparkdownVariableDefinition") {
    return false;
  }
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) content = child;
  }
  let last: SyntaxNode | null = content?.lastChild ?? null;
  while (last && SKIPPABLE.has(last.name)) last = last.prevSibling;
  return (
    last?.name === "LuauVariableAssignment" &&
    hasDescendant(last, "LuauTypeAnnotationOperation") &&
    !ownAssignmentOperation(last)
  );
}

// Whether the union member line `line` (a `LuauTypeUnionLineContinuation`)
// continues a type: the nearest node before it, across blank and comment
// lines, is a declaration that ends in its type, a type alias, an annotated
// parameter, or another such line with no value; or it starts a function
// body after the function's return type.
export function hasTypeUnionLineOwner(line: SyntaxNode): boolean {
  let prev = line.prevSibling;
  while (prev && SKIPPABLE.has(prev.name)) prev = prev.prevSibling;
  if (!prev) {
    const body = line.parent?.name === "LuauFunctionBody_content" ? line.parent.parent : null;
    for (let n = body?.prevSibling ?? null; n; n = n.prevSibling) {
      if (n.name === "LuauFunctionReturnType") return true;
      if (n.name === "LuauFunctionParameters") return false;
    }
    return false;
  }
  if (prev.name === "LuauTypeUnionLineContinuation") {
    return !hasDescendant(prev, "LuauAssignmentOperation");
  }
  return (
    prev.name === "LuauDataTypeDeclaration" ||
    prev.name === "LuauTypeAnnotationOperation" ||
    endsInTypeAnnotation(prev)
  );
}

// Report a union member line that continues no type (`print(1)` then
// `-- note` then `| string`), which Luau rejects.
export function reportUnownedTypeUnionLine(line: SyntaxNode, ctx: LowerContext): void {
  const raw = ctx.read(line.from, line.to);
  const text = raw.trim();
  const from = line.from + raw.length - raw.trimStart().length;
  ctx.diagnostics?.push({
    message: `\`${text}\` continues a type, but the line before it does not end in one.`,
    severity: ErrorType.Error,
    source: {
      fileName: null,
      filePath: ctx.filePath ?? null,
      startLineNumber: ctx.lineNumber(from) + 1,
      endLineNumber: ctx.lineNumber(line.to) + 1,
      startCharacterNumber: ctx.characterNumber(from) + 1,
      endCharacterNumber: ctx.characterNumber(line.to) + 1,
    },
  });
}

// Whether the declaration `node` ends on a comma after its `=`: its comma's
// line break reached an unindented line, where the declaration ends, so the
// value after the comma is on the lines that follow it. A comma's line break
// that holds an if expression (`1,` then an unindented `if c`) has its value.
function endsOnValueComma(node: SyntaxNode): boolean {
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) content = child;
  }
  let last: SyntaxNode | null = content?.lastChild ?? null;
  while (last && SKIPPABLE.has(last.name)) last = last.prevSibling;
  if (last?.name !== "LuauCommaSeparator" && last?.name !== "LuauCommaLineBreak") {
    return false;
  }
  if (
    last.name === "LuauCommaLineBreak" &&
    last.getChild("LuauCommaLineBreak_content")?.getChild("LuauTernaryExpression")
  ) {
    return false;
  }
  for (let child = content?.firstChild; child; child = child.nextSibling) {
    if (child.name === "LuauVariableAssignment" && ownAssignmentOperation(child)) {
      return true;
    }
  }
  return false;
}

// The blocks whose bodies are Luau code, and the constructs whose bodies are
// narrative, where a statement ends at its line.
const LUAU_BODY_OWNERS = nodeNameSet([
  "LuauFunctionDefinition",
  "LuauMethodDefinition",
  "LuauFunctionTypeDeclaration",
  "LuauIfBlock",
  "LuauElseifBlock",
  "LuauElseBlock",
  "LuauForLoop",
  "LuauWhileLoop",
  "LuauRepeatLoop",
  "LuauDoBlock",
  "LuauDefine",
]);
const NARRATIVE_OWNERS = nodeNameSet(["Scene", "Branch", "LuauExplicitStatement"]);

// The values that are a call's argument after a callee (`f "x"`, `f { 1 }`).
const CALL_ARGUMENT_NODES = nodeNameSet([
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauMultilineString",
  "LuauInterpolatedString",
  "LuauTable",
]);

// Whether `node` ends in a value Luau can call: a name, a closing bracket,
// or a call argument, whose call can be called again (`f "a"` then `"b"`).
function endsInCallee(node: SyntaxNode): boolean {
  // A declaration with no `=` ends in a name it declares, not a value
  // (`local x`).
  if (
    (node.name === "LuauVariableDefinition" || node.name === "LuauSparkdownVariableDefinition") &&
    !findDescendant(node, "LuauAssignmentOperation")
  ) {
    return false;
  }
  const leaf = lastSignificantLeaf(node);
  if (!leaf) return false;
  if (CALLEE_END.test(leaf.name)) return true;
  // The end of a string or a table that is a call's argument (`maker "A"`):
  // what the call returns can be called in turn.
  for (let n: SyntaxNode | null = leaf; n && n !== node; n = n.parent) {
    if (CALL_ARGUMENT_NODES.has(n.name)) {
      return n.parent?.name === "LuauFunctionCall_content";
    }
  }
  return false;
}

const CALLEE_END =
  /(?:VariableName|FunctionName|PropertyName|StdLibFunctions|StdLibConstants|StdLibGlobals|StdLibMethods|SelfKeyword|PunctuationParenClose|PunctuationBracketClose)$/;

// Whether `node` is in Luau code rather than a narrative body.
function inLuauBody(node: SyntaxNode): boolean {
  for (let n = node.parent; n; n = n.parent) {
    if (LUAU_BODY_OWNERS.has(n.name)) return true;
    if (NARRATIVE_OWNERS.has(n.name) || n.name.startsWith("LuauSparkdown")) return false;
  }
  return false;
}

// Whether the assignment operation `op` has no value after its operator on
// its line.
function isEmptyAssignment(op: SyntaxNode): boolean {
  const operator = findDescendant(op, "LuauAssignmentOperator");
  if (!operator) return false;
  for (let sib = operator.nextSibling; sib; sib = sib.nextSibling) {
    if (!SKIPPABLE.has(sib.name)) return false;
  }
  return true;
}

// Whether the statement `node` in Luau code ends with an `=` that has no
// value on its line (`local x =`, `a, b =`), so the value is on the next
// line, as Luau reads it. A declaration is always Luau code; a reassignment
// can be in a narrative body, where it ends at its line.
function endsOnEmptyAssignment(node: SyntaxNode): boolean {
  if (node.name === "LuauAssignmentOperation") {
    return isEmptyAssignment(node) && inLuauBody(node);
  }
  if (node.name === "LuauPropertyDefinition") {
    // A define property (`value =` then `12`).
    const op = findDescendant(node, "LuauAssignmentOperation");
    return op != null && isEmptyAssignment(op);
  }
  if (node.name !== "LuauVariableDefinition" && node.name !== "LuauReassignment") {
    return false;
  }
  let content: SyntaxNode | null = null;
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === `${node.name}_content`) content = child;
  }
  let last: SyntaxNode | null = content?.lastChild ?? null;
  while (last && SKIPPABLE.has(last.name)) last = last.prevSibling;
  if (!last) return false;
  if (node.name === "LuauReassignment") {
    return last.name === "LuauAssignmentOperation" && isEmptyAssignment(last) && inLuauBody(node);
  }
  const op =
    last.name === "LuauVariableAssignment" ? findDescendant(last, "LuauAssignmentOperation") : null;
  return op != null && isEmptyAssignment(op);
}

function findDescendant(node: SyntaxNode, name: string): SyntaxNode | null {
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.name === name) return child;
    const found = findDescendant(child, name);
    if (found) return found;
  }
  return null;
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
  // A define body's own statements (`color = red`, `greet(self) … end`).
  if (node.name === "LuauPropertyDefinition" || node.name === "LuauMethodDefinition") {
    return true;
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

export function lastSignificantLeaf(node: SyntaxNode): SyntaxNode | null {
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

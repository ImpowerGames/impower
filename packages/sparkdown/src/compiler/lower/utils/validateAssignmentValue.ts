import { isExplicitRuleName } from "../../utils/explicitRuleNames";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, type SourceMetadata } from "../../../runtime/Error";
import type { LowerContext } from "../context";
import { commaLineBreakValue, isListCommaName } from "../../utils/listCommaNames";
import { REASSIGNMENT_NAMES, reassignmentParts } from "../../utils/reassignmentNames";
import { TRAILING_STATEMENT_NAMES } from "../../utils/trailingStatementNames";
import {
  VARIABLE_DEFINITION_BEGIN_NAMES,
  VARIABLE_DEFINITION_END_NAMES,
  VARIABLE_DEFINITION_NAMES,
  ownAssignmentOperation,
} from "../../utils/variableDefinitionNames";
import { checkerReadsOnTo } from "../../typecheck/LuauUnitNodes";
import { AstExprBinary, AstExprError, AstExprUnary } from "../../typecheck/Ast";
import { luauPositionOffset, nextLuauToken, readLuauExpressionAfter } from "../../typecheck/readLuauAst";
import { offsetAt, readExpressionAst } from "./luauAst";
import { commaBeforeStatement, typeUnionLineValue } from "./lineContinuation";
import { validateExplicitStatement } from "./validateExplicitStatement";

// Sparkdown's own reports of Luau's parse errors in an assignment or a
// declaration: a value missing after `=` or after a comma, a second `=`, a
// compound operator after a target list, and a target list with no `=`.
// The converter reads these statements as Luau does and leaves an error
// where the value or the `=` should be; these reports place the error on the
// operator or comma that is left without a value, and name the token Luau
// finds instead, which in a narrative body can be a word of the story that
// the type checker does not read. The validateTypes merge in
// `SparkdownCompiler` drops a type-checker syntax error whose token one of
// these reports covers.

// Grammar node names that carry no value — whitespace and comments. A comment
// is lexical whitespace to Luau, so `name = -- todo` has an EMPTY right-hand
// side just like a bare `name =`.
const COMMENT_NAMES: ReadonlySet<string> = nodeNameSet([
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
  "LuauTypeTrailingBlockCommentClose",
  "LuauComment",
]);

function isInsignificant(name: string): boolean {
  return (
    name === "OptionalWhitespace" ||
    name === "Whitespace" ||
    name === "ExtraWhitespace" ||
    name === "RequiredWhitespace" ||
    name === "Newline" ||
    COMMENT_NAMES.has(name)
  );
}

/**
 * Runs the validators of a statement node the converter read statements
 * from: a reassignment, a declaration, an `&` statement, or, in a function
 * body, an assignment whose target and operation are sibling nodes.
 * `continuation` holds the nodes after it that the statement continues into
 * (the values after a line-ending comma, the lines that continue a value).
 */
export function validateStatementNode(
  node: SyntaxNode,
  continuation: readonly SyntaxNode[],
  ctx: LowerContext,
): void {
  if (REASSIGNMENT_NAMES.has(node.name)) {
    const parts = reassignmentParts(node);
    const isOperation = (part: SyntaxNode) => isExplicitRuleName(part.name, "LuauAssignmentOperation");
    // A target list that ends its line with a comma goes on at the next
    // line. When that line is unindented the reassignment ends at its
    // start (`a,` then `g = 1, 2`, or `g` alone), and the converter reads
    // the nodes there as the rest of this one, up to its operation.
    let rest = continuation;
    while (!parts.some(isOperation)) {
      const at = rest.findIndex((n) => !isInsignificant(n.name));
      const next = at < 0 ? undefined : rest[at];
      if (!next) break;
      parts.push(...rest.slice(0, at), ...(REASSIGNMENT_NAMES.has(next.name) ? reassignmentParts(next) : [next]));
      rest = rest.slice(at + 1);
    }
    validateReassignmentList(parts, rest, ctx);
    const op = parts.find(isOperation);
    if (op) validateAssignmentValue(op, ctx);
    return;
  }
  if (VARIABLE_DEFINITION_NAMES.has(node.name)) {
    validateVariableDefinition(node, continuation, ctx);
    return;
  }
  if (node.name === "LuauExplicitStatement" || node.name === "LuauSparkdownExplicitStatement" || node.name === "LuauSparkdownExplicitBlockStatement") {
    // Stylistic diagnostic: inside a function body, the `&` prefix is
    // redundant.
    const diagnostics = validateExplicitStatement(node, ctx);
    if (diagnostics.length > 0) ctx.diagnostics?.push(...diagnostics);
    const declaration = getDescendent(["LuauSparkdownVariableDefinition", "LuauSparkdownExplicitStoryVariableDefinition"], node);
    if (declaration) {
      validateVariableDefinition(declaration, continuation, ctx);
      return;
    }
    // A comma that ends the statement's value list: the statement ends at
    // its line, so the comma is left without a value (`& a, b = 1,`).
    const content = node.getChild(`${node.name}_content`);
    if (content) validateReassignmentList(childrenOf(content), continuation, ctx);
    return;
  }
  // In a function body, a target and its operation (`x = 1`), or a call or
  // parenthesized value followed by the links a store goes through
  // (`o:get().x = 6`, `(t)[k] = v`), are sibling nodes.
  const op = siblingAssignmentOperation(node);
  if (op) validateAssignmentValue(op, ctx);
}

function childrenOf(node: SyntaxNode): SyntaxNode[] {
  const children: SyntaxNode[] = [];
  for (let child = node.firstChild; child; child = child.nextSibling) children.push(child);
  return children;
}

// The links a store through a call or a parenthesized value goes through,
// at statement level: a call's arguments, a `:method` call and a property
// or index link.
const STORE_LINK_NAMES = nodeNameSet([
  "LuauParenthetical",
  "LuauChainedFunctionCall",
  "LuauChainedPropertyAccess",
]);

const SIBLING_BRIDGE: ReadonlySet<string> = nodeNameSet([
  "Newline",
  "ExtraWhitespace",
  "LuauComment",
  "LuauBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
]);

// The assignment operation after a statement's first node, past the links
// a store goes through, or null when no operation follows it.
function siblingAssignmentOperation(node: SyntaxNode): SyntaxNode | null {
  for (let next = node.nextSibling; next; next = next.nextSibling) {
    if (SIBLING_BRIDGE.has(next.name) || STORE_LINK_NAMES.has(next.name)) {
      continue;
    }
    return isExplicitRuleName(next.name, "LuauAssignmentOperation") ? next : null;
  }
  return null;
}

// Emit a Luau-style parse error when an assignment's right-hand side is empty
// — `name =` with nothing after the operator before the line ends. An empty
// RHS is meaningless, and (before the grammar stopped the assignment operator
// from spanning newlines — see `reproEmptyRhs.test.ts`) it used to swallow the
// next line's `end` as its value, running the enclosing block away. Luau's
// parser reports this exact situation as:
//
//   Expected identifier when parsing expression, got 'end'
//
// We mirror that wording — `<token>` is the next thing the parser sees instead
// of a value (the block `end`, the next property's name, or end-of-file) — and
// point the squiggle at the `=`/`+=` operator, where the missing value belongs.
//
// No-op when the operation carries a value, or when there's no operator node
// (a bare `local x` declaration has no operator and is valid). A trailing
// comment (`name = -- todo`) is still an empty RHS — the value is detected from
// the parse tree (a comment node is not a value), not from raw source text.
//
// `opNode` is a `LuauAssignmentOperation` grammar node.
export function validateAssignmentValue(
  opNode: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const operator = getDescendent("LuauAssignmentOperator", opNode);
  if (!operator) return;
  // The value node (string/number/table/access-path/…) is a SIBLING of the
  // operator inside the operation. If every sibling after the operator is
  // whitespace or a comment, there's no value.
  for (let sib = operator.nextSibling; sib; sib = sib.nextSibling) {
    if (!isInsignificant(sib.name)) return;
  }
  const range = operatorTokenRange(operator, ctx);
  // The highlighting node may end at the line-ending operator while Luau
  // reads a value on the following line. Validate the converter's value.
  const read = (from: number, to: number) => ctx.read(from, to);
  const next = nextSignificantToken(opNode, operator.to, read, ctx.documentText);
  if (checkerReadsOnTo(opNode, next?.from, read)) {
    const value = readLuauExpressionAfter(operator.to, wholeDocument(opNode, read, ctx.documentText));
    if (value.errors.every((error) => error.message.startsWith("Expected the end of the expression"))) return;
  }
  if (typeCheckerReportsMissingValue(opNode, operator.to, read, ctx.documentText)) return;
  const got = nextTokenAfter(opNode, range.to, ctx);
  ctx.diagnostics.push({
    message: `Expected identifier when parsing expression, got ${display(got)}`,
    severity: ErrorType.Error,
    source: makeSource(range, ctx),
  });
}

// The same Luau parse error for a comma in a declaration's list with nothing
// after it: `local a, b = 1,` before a line that starts with `end` or a
// statement in Luau code, or any such comma in a narrative body, where the
// declaration ends at its line. Luau reads the next token as the missing
// value (or, before the `=`, the missing name) and reports it; the squiggle
// points at the comma.
//
// `comma` is a `LuauCommaSeparator` or `LuauCommaLineBreak` grammar node.
export function validateListComma(
  comma: SyntaxNode,
  afterAssignment: boolean,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  // The node holds the comma after any whitespace before it.
  const text = ctx.read(comma.from, comma.to);
  const at = comma.from + text.length - text.trimStart().length;
  if (afterAssignment && typeCheckerReportsMissingValue(comma, at + 1, (from, to) => ctx.read(from, to), ctx.documentText)) {
    return;
  }
  const got = nextTokenAfter(comma, at + 1, ctx);
  const parsing = afterAssignment ? "expression" : "binding name";
  ctx.diagnostics.push({
    message: `Expected identifier when parsing ${parsing}, got ${display(got)}`,
    severity: ErrorType.Error,
    source: makeSource({ from: at, to: at + 1 }, ctx),
  });
}

// The Luau parse error for a second `=` in a declaration's list
// (`local a = 1, x = 99`, or `x = 99` on the line after a comma that ends
// the declaration's line): Luau ends the list at `x`, and the statement
// that follows cannot start with `=`. The squiggle points at that `=`.
//
// `opNode` is the second `LuauAssignmentOperation`.
export function validateSecondAssignment(
  opNode: SyntaxNode,
  ctx: LowerContext,
): void {
  if (!ctx.diagnostics) return;
  const operator = getDescendent("LuauAssignmentOperator", opNode);
  if (!operator) return;
  const range = operatorTokenRange(operator, ctx);
  const got = ctx.read(range.from, range.to);
  ctx.diagnostics.push({
    message: `Expected identifier when parsing expression, got '${got}'`,
    severity: ErrorType.Error,
    source: makeSource(range, ctx),
  });
}

// Luau's parse errors in a reassignment's value list (`a, g = 1, 2`, bare or
// after `&`): a comma after the `=` with no value after it, where the list
// ended (at a statement on the next line in Luau code, at the line's end in
// a narrative body, or at a statement after the lines `continuation` holds,
// which continue the last value), a comma followed by an operator that
// cannot begin a value (`a, g = 1,` then `+ 2`), and a second `=` after a
// comma that ends its line (`a, g = 1,` then `x = 99`). Each is reported
// once, at the first. `parts` are the statement's targets, commas,
// operation and values, in order.
//
// A compound operator (`+=`) takes one target and one value: after a target
// list Luau expects `=` there (`a, g += 1`), and a comma after its value
// starts a statement Luau cannot read (`g += 1, 2`). A target list that ends
// its line with a comma (`a,` then `g = 1`) can also end with no `=` at all:
// with a comma last Luau is missing the next target (`a,` then `end`), and
// otherwise the `=` (`a,` then `g` then `end`).
export function validateReassignmentList(
  parts: readonly SyntaxNode[],
  continuation: readonly SyntaxNode[],
  ctx: LowerContext,
): void {
  let sawAssignment = false;
  let compound = false;
  // Whether everything before the operation is targets and commas, and
  // whether one of those is a comma.
  let onlyTargets = true;
  let sawTargetComma = false;
  let last: SyntaxNode | null = null;
  for (const child of parts) {
    if (isInsignificant(child.name)) continue;
    if (!sawAssignment && !isExplicitRuleName(child.name, "LuauAssignmentOperation")) {
      if (isListCommaName(child.name)) sawTargetComma = true;
      else if (!isExplicitRuleName(child.name, "LuauAccessPath") && child.name !== "LuauVariable") onlyTargets = false;
    }
    if (isExplicitRuleName(child.name, "LuauAssignmentOperation")) {
      if (sawAssignment) {
        validateSecondAssignment(child, ctx);
        return;
      }
      sawAssignment = true;
      const operator = getDescendent("LuauAssignmentOperator", child);
      const range = operator && operatorTokenRange(operator, ctx);
      const opText = range ? ctx.read(range.from, range.to) : "=";
      compound = opText !== "=";
      if (compound && sawTargetComma && range) {
        reportParseError(`Expected '=' when parsing assignment, got '${opText}'`, range, ctx);
        return;
      }
    } else if (compound && isListCommaName(child.name)) {
      const text = ctx.read(child.from, child.to);
      const at = child.from + text.length - text.trimStart().length;
      // Luau's parser reports this comma too, and the type checker reports
      // its error where it reads the statement (#1175).
      if (typeCheckerReportsMissingValue(child, at, (from, to) => ctx.read(from, to), ctx.documentText)) return;
      reportParseError(
        "Expected identifier when parsing expression, got ','",
        { from: at, to: at + 1 },
        ctx,
      );
      return;
    } else if (
      sawAssignment &&
      last &&
      isListCommaName(last.name) &&
      cannotBeginValue(child, ctx)
    ) {
      validateListComma(last, true, ctx);
      return;
    }
    // A comma that holds its value (an unindented if expression after the
    // line break) is followed by that value, not left without one.
    last = commaLineBreakValue(child) ?? child;
  }
  if (!sawAssignment) {
    if (!onlyTargets || !sawTargetComma || !last) return;
    if (isListCommaName(last.name)) {
      validateListComma(last, true, ctx);
      return;
    }
    const got = nextTokenAfter(last, last.to, ctx);
    const at = got?.from ?? last.to;
    reportParseError(
      `Expected '=' when parsing assignment, got ${display(got)}`,
      { from: at, to: at + (got?.text.length ?? 0) },
      ctx,
    );
    return;
  }
  const beforeStatement = commaBeforeStatement([last, ...continuation], ctx);
  if (beforeStatement) {
    validateListComma(beforeStatement, true, ctx);
    return;
  }
  const lastContinued = continuation.findLast((n) => !isInsignificant(n.name));
  if (lastContinued?.name === "LuauCommaSeparator") {
    validateListComma(lastContinued, true, ctx);
  } else if (!lastContinued && isListCommaName(last?.name)) {
    validateListComma(last!, true, ctx);
  }
}

// The nodes of a declaration's content that are no item of its list:
// whitespace, comments, and the declaration's own begin and end parts.
function isDeclarationTrivia(name: string): boolean {
  return (
    isInsignificant(name) ||
    VARIABLE_DEFINITION_BEGIN_NAMES.has(name) ||
    VARIABLE_DEFINITION_END_NAMES.has(name)
  );
}

/**
 * Luau's parse errors in a declaration's list (`local`, `store` or `const`):
 * a second `=` (`local a = 1, x = 99`), a comma with nothing after it,
 * where the list ended (at the line's end in a narrative body, at a
 * statement, or at a line no value can begin, as Luau reads the line after a
 * comma that ends its line), a comma followed by a token no value can begin
 * with (`local a, g = 1,` then `+ 2`), and a value missing after `=`.
 * `continuation` holds the nodes after the declaration's node that it
 * continues into, as the converter read it.
 */
export function validateVariableDefinition(
  node: SyntaxNode,
  continuation: readonly SyntaxNode[],
  ctx: LowerContext,
): void {
  const content = node.getChild(`${node.name}_content`);
  let sawAssignmentOp = false;
  let hasValueGroup = false;
  let trailingStatements = 0;
  let lastTarget: SyntaxNode | null = null;
  // A comma no target or value has followed yet, so a comma with nothing
  // after it, or with a statement after it, can be reported.
  let unresolvedComma: SyntaxNode | null = null;
  let unresolvedAfterAssignment = false;
  let previous: SyntaxNode | null = null;
  for (let child = content?.firstChild ?? null; child; child = child.nextSibling) {
    if (isDeclarationTrivia(child.name)) continue;
    const pendingComma = unresolvedComma;
    unresolvedComma = null;
    const before = previous;
    previous = child;
    if (isExplicitRuleName(child.name, "LuauVariableAssignment")) {
      const opNode = ownAssignmentOperation(child);
      if (sawAssignmentOp) {
        // A second `=` (`local a = 1, x = 99`): Luau ends the list at `x`
        // and cannot parse a statement that starts with `=`. A name after
        // the `=` is a value.
        if (opNode) validateSecondAssignment(opNode, ctx);
        else hasValueGroup = true;
        continue;
      }
      if (getDescendent("LuauVariableName", child)) lastTarget = child;
      if (opNode) sawAssignmentOp = true;
      continue;
    }
    if (isListCommaName(child.name)) {
      // Before the `=` the comma separates names, so an if expression after
      // it is the missing binding name Luau reports, not a value.
      const value = sawAssignmentOp ? commaLineBreakValue(child) : null;
      if (value) {
        hasValueGroup = true;
      } else {
        unresolvedComma = child;
        unresolvedAfterAssignment = sawAssignmentOp;
      }
      continue;
    }
    // A bare name before any `=` is a target (`local a` before a statement
    // on its line).
    if (isExplicitRuleName(child.name, "LuauAccessPath") && !sawAssignmentOp && !hasValueGroup) {
      lastTarget = child;
      continue;
    }
    // A function directly after a comma is a value in the list.
    if (
      child.name === "LuauFunctionDefinition" &&
      sawAssignmentOp &&
      isListCommaName(before?.name)
    ) {
      hasValueGroup = true;
      continue;
    }
    // A statement after a comma is an adjacent statement, not a value; one
    // where the comma needs a value (`store a = 1, return`) is Luau's
    // missing-value error. A function after the `=` is a value (above), so
    // one here stands before any `=`.
    if (TRAILING_STATEMENT_NAMES.has(child.name)) {
      if (pendingComma && child.name !== "LuauFunctionDefinition") {
        validateListComma(pendingComma, unresolvedAfterAssignment, ctx);
      }
      trailingStatements++;
      continue;
    }
    // A value after the comma that starts with a token no value can begin
    // with (`local a, g = 1,` then `+ 2` or `:method()`) is Luau's
    // missing-value error at the comma, as in a reassignment.
    if (pendingComma && unresolvedAfterAssignment && cannotBeginValue(child, ctx)) {
      validateListComma(pendingComma, true, ctx);
    }
    hasValueGroup = true;
  }

  // A comma that ends the list: in Luau code the next line started with
  // something that is not a value (`end`, a statement), and in a narrative
  // body the declaration ended at its line. Luau reports the token it
  // found in place of the value or name. The same holds for a comma that
  // ends the last line continuing the declaration (`n` then `+ 4,`).
  const lastContinued = continuation.findLast((n) => !isDeclarationTrivia(n.name));
  // A value comma that ends the content, with lines carried after it: the
  // declaration ended at the start of an unindented line after the comma,
  // and the continuation holds the values that follow it (`local a, g =
  // 1,` then `2`).
  const valuesAfterComma =
    unresolvedComma != null &&
    unresolvedAfterAssignment &&
    trailingStatements === 0 &&
    lastContinued != null;
  const beforeStatement =
    sawAssignmentOp &&
    commaBeforeStatement([unresolvedComma ?? previous, ...continuation], ctx);
  if (beforeStatement) {
    validateListComma(beforeStatement, true, ctx);
  } else if (lastContinued?.name === "LuauCommaSeparator") {
    validateListComma(lastContinued, true, ctx);
  } else if (unresolvedComma && !valuesAfterComma) {
    validateListComma(unresolvedComma, unresolvedAfterAssignment, ctx);
  }
  if (!lastTarget) return;

  // The last target's `=` gives the first value. With no `=` of its own, the
  // `=` can stand on a line that continues its type (`local x: types` then
  // `.Button = 1`), or on the last union member line after a comment line
  // (`local v: number` then `-- note` then `| string = 1`).
  let firstOp =
    isExplicitRuleName(lastTarget.name, "LuauVariableAssignment")
      ? ownAssignmentOperation(lastTarget)
      : null;
  if (!firstOp && trailingStatements === 0 && !valuesAfterComma) {
    for (const n of continuation) {
      if (n.name === "LuauCommaSeparator") break;
      if (isExplicitRuleName(n.name, "LuauAssignmentOperation")) {
        firstOp = n;
        break;
      }
    }
  }
  if (!firstOp && !sawAssignmentOp) firstOp = typeUnionLineValue(node);
  if (firstOp) validateAssignmentValue(firstOp, ctx);
}

/**
 * Whether the value node `node`, after a list comma, starts with a token no
 * Luau value can begin with: a binary operator (`+ 2`, `and x`), an
 * accessor or indexer with no base (`:method()`, `.field`, `[1]`), as the
 * converter finds reading a value there. A value can begin with the unary
 * `-`, `not` or `#`, with `...`, a number such as `.5`, or a long string.
 */
export function cannotBeginValue(node: SyntaxNode, ctx: LowerContext): boolean {
  const reading = readExpressionAst([node], ctx);
  if (!reading || !(reading.expr instanceof AstExprError)) return false;
  // A token that cannot begin a value is Luau's error at that token; a
  // value cut short by the node's end (`s:upper` before its arguments)
  // fails differently.
  const error = reading.source.errors[0];
  if (!error?.message.startsWith("Expected identifier when parsing expression")) {
    return false;
  }
  const text = ctx.read(node.from, node.to);
  const first = node.from + text.length - text.trimStart().length;
  return offsetAt(error.location.begin, ctx) === first;
}

// The token after `pos` that Luau would report: the first token of the next
// node of the tree after `pos` that is not whitespace or a comment, read
// from the leaf that holds it (a name or keyword whole, any other token by
// its first character), with its document offset, or null (rendered as
// `<eof>`) when the document has none.
function nextTokenAfter(
  anyNode: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): { text: string; from: number } | null {
  let top = anyNode;
  while (top.parent) top = top.parent;
  let node: SyntaxNode | null = top.resolveInner(pos, 1);
  while (node) {
    const token = firstTokenIn(node, pos, ctx);
    if (token) {
      // A story line that begins with `--` (an em-dash action line) is a
      // comment to Luau, which reads on from the next line, or, after a
      // long bracket (`--[[ note ]]`, which the story reads as an image),
      // from the bracket's end.
      if (token.text !== "-" || ctx.read(token.from, token.from + 2) !== "--") {
        return token;
      }
      const bracket = longBracketAt(top, token.from + 2, ctx);
      if (bracket) {
        pos = bracket.to;
      } else {
        const lineEnd = newlineAfter(top, token.from);
        if (!lineEnd) return null;
        pos = lineEnd.to;
      }
      node = top.resolveInner(pos, 1);
      continue;
    }
    while (node && !node.nextSibling) node = node.parent;
    node = node?.nextSibling ?? null;
  }
  return null;
}

// The outermost node that begins at `pos` with a long bracket's opening
// (`[[` or `[=`), or null.
function longBracketAt(
  top: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): SyntaxNode | null {
  const open = ctx.read(pos, pos + 2);
  if (open !== "[[" && open !== "[=") return null;
  let node: SyntaxNode | null = top.resolveInner(pos, 1);
  if (!node || node.from !== pos) return null;
  while (node.parent && node.parent.from === pos && node.parent !== top) {
    node = node.parent;
  }
  return node;
}

// The first line break of the tree at or after `pos`.
function newlineAfter(top: SyntaxNode, pos: number): SyntaxNode | null {
  const cursor = top.cursor();
  cursor.moveTo(pos, 1);
  do {
    if (cursor.name === "Newline" && cursor.from >= pos) return cursor.node;
  } while (cursor.next());
  return null;
}

// The first token at or after `pos` under `node`, skipping whitespace and
// comment nodes, and the text between a node's children that no child
// holds.
function firstTokenIn(
  node: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): { text: string; from: number } | null {
  if (node.to <= pos || isInsignificant(node.name)) return null;
  let at = Math.max(node.from, pos);
  for (let child = node.firstChild; child; child = child.nextSibling) {
    if (child.from > at) {
      const token = tokenAt(ctx.read(at, child.from), at);
      if (token) return token;
    }
    const token = firstTokenIn(child, pos, ctx);
    if (token) return token;
    at = Math.max(at, child.to);
  }
  return node.to > at ? tokenAt(ctx.read(at, node.to), at) : null;
}

function isNameStart(code: number): boolean {
  return (
    (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 95
  );
}

function isNameChar(code: number): boolean {
  return isNameStart(code) || (code >= 48 && code <= 57);
}

// The first token of `text`, which starts at `from`: a name or keyword
// whole, any other token by its first character.
function tokenAt(
  text: string,
  from: number,
): { text: string; from: number } | null {
  const trimmed = text.trimStart();
  if (!trimmed) return null;
  const start = from + text.length - trimmed.length;
  if (!isNameStart(trimmed.charCodeAt(0))) {
    return { text: String.fromCodePoint(trimmed.codePointAt(0)!), from: start };
  }
  let end = 1;
  while (end < trimmed.length && isNameChar(trimmed.charCodeAt(end))) end++;
  return { text: trimmed.slice(0, end), from: start };
}

function display(got: { text: string } | null): string {
  return got == null ? "<eof>" : `'${got.text}'`;
}

// Whether Luau reports the value missing where the checker reads it.
// A valid expression on the next line belongs to Sparkdown's diagnostic;
// an AstExprError where the operand should begin belongs to Luau's parser.
export function typeCheckerReportsMissingValue(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
  document?: () => string,
): boolean {
  const text = wholeDocument(node, read, document);
  const authoredEnd = authoredIslandEnd(node);
  const reading = readLuauExpressionAfter(pos, text, authoredEnd);
  let expr = reading.expr;
  // A leading binary operator (`+ 1`) leaves its missing left operand in
  // the AST while recovery reads the right operand. That missing operand
  // belongs to Luau's diagnostic just as a missing unary operand does.
  while (expr instanceof AstExprUnary || expr instanceof AstExprBinary) {
    expr = expr instanceof AstExprUnary ? expr.expr : expr.left;
  }
  if (!(expr instanceof AstExprError) || expr.expressions.length > 0) return false;
  const error = reading.errors[expr.messageIndex];
  if (!error?.message.startsWith("Expected identifier when parsing expression")) return false;
  const at = luauPositionOffset(error.location.begin, text);
  const got = nextLuauToken(at, text, authoredEnd);
  if (got?.text === ":" || got?.text === "@") return false;
  return checkerReadsOnTo(node, got?.from, read);
}

// A marked story island has its own authored EOF. Reading the following
// prose as an operand or method name would report at a story token while
// the bounded checker separately reports the missing token at EOF.
// A genuine function inside the island keeps its multiline Luau ownership.
export function authoredIslandEnd(node: SyntaxNode): number | undefined {
  for (let parent: SyntaxNode | null = node; parent; parent = parent.parent) {
    if (parent.name === "LuauFunctionBody") return undefined;
    if (parent.name === "LuauSparkdownExplicitStatement") return parent.to;
  }
  return undefined;
}

function wholeDocument(node: SyntaxNode, read: (from: number, to: number) => string, document?: () => string): string {
  if (document) return document();
  while (node.parent) node = node.parent;
  return read(0, node.to);
}

/** The converter's next token, including beyond the grammar's statement end. */
export function nextSignificantToken(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
  document?: () => string,
  to?: number,
): { text: string; from: number } | null {
  return nextLuauToken(pos, wholeDocument(node, read, document), to);
}

// The `=`/`+=`/`..=` token's own range, with the surrounding same-line
// whitespace the `LuauAssignmentOperator` node captures (`(WS*)(op)(WS*)`)
// trimmed off — so the squiggle lands on the operator, not its trailing
// spaces.
function operatorTokenRange(
  operator: SyntaxNode,
  ctx: LowerContext,
): { from: number; to: number } {
  const text = ctx.read(operator.from, operator.to);
  const leading = text.length - text.trimStart().length;
  const trailing = text.length - text.trimEnd().length;
  const from = operator.from + leading;
  const to = operator.to - trailing;
  // Guard against an all-whitespace read (shouldn't happen — the operator is
  // always present) collapsing to a zero/negative span.
  return to > from ? { from, to } : { from: operator.from, to: operator.to };
}

// Reports a Luau parse error worded `message` on the source `range`.
function reportParseError(
  message: string,
  range: { from: number; to: number },
  ctx: LowerContext,
): void {
  ctx.diagnostics?.push({
    message,
    severity: ErrorType.Error,
    source: makeSource(range, ctx),
  });
}

function makeSource(
  range: { from: number; to: number },
  ctx: LowerContext,
): SourceMetadata {
  return {
    fileName: null,
    filePath: ctx.filePath ?? null,
    startLineNumber: ctx.lineNumber(range.from) + 1,
    endLineNumber: ctx.lineNumber(range.to) + 1,
    startCharacterNumber: ctx.characterNumber(range.from) + 1,
    endCharacterNumber: ctx.characterNumber(range.to) + 1,
  };
}

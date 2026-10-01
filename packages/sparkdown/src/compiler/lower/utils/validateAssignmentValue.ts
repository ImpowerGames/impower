import { nodeNameSet } from "../../utils/nodeNameSet";
import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, type SourceMetadata } from "../../../inkjs/engine/Error";
import type { LowerContext } from "../context";
import { commaLineBreakValue, isListCommaName } from "../../utils/listCommaNames";
import { RESERVED } from "../../lint/luauNames";
import { isCheckedLuau, isCheckedLuauAt } from "../../typecheck/LuauUnitNodes";

// The first window `nextSignificantToken` reads for the next token, which
// it doubles until the token is whole or the document ends.
const LOOKAHEAD = 4096;

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
  // Whether the value is on the next line, after an `=` that ends its line
  // (`local x =` then `y`), which Luau reads as the value.
  valueOnNextLine = false,
): void {
  if (!ctx.diagnostics || valueOnNextLine) return;
  const operator = getDescendent("LuauAssignmentOperator", opNode);
  if (!operator) return;
  // The value node (string/number/table/access-path/…) is a SIBLING of the
  // operator inside the operation. If every sibling after the operator is
  // whitespace or a comment, there's no value.
  for (let sib = operator.nextSibling; sib; sib = sib.nextSibling) {
    if (!isInsignificant(sib.name)) return;
  }

  const got = nextSignificantToken(operator.to, (from, to) =>
    ctx.read(from, to),
  );
  if (typeCheckerReportsMissingValue(opNode, operator.to, ctx)) return;
  const gotDisplay = got == null ? "<eof>" : `'${got.text}'`;
  ctx.diagnostics.push({
    message: `Expected identifier when parsing expression, got ${gotDisplay}`,
    severity: ErrorType.Error,
    source: makeSource(operatorTokenRange(operator, ctx), ctx),
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
  const at = comma.from + ctx.read(comma.from, comma.to).indexOf(",");
  const got = nextSignificantToken(at + 1, (from, to) => ctx.read(from, to));
  if (afterAssignment && typeCheckerReportsMissingValue(comma, at + 1, ctx)) {
    return;
  }
  const gotDisplay = got == null ? "<eof>" : `'${got.text}'`;
  const parsing = afterAssignment ? "expression" : "binding name";
  ctx.diagnostics.push({
    message: `Expected identifier when parsing ${parsing}, got ${gotDisplay}`,
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
// once, at the first. `content` is the statement's content node, whose
// children are its targets, commas, operation and values.
//
// A compound operator (`+=`) takes one target and one value: after a target
// list Luau expects `=` there (`a, g += 1`), and a comma after its value
// starts a statement Luau cannot read (`g += 1, 2`). A target list that ends
// its line with a comma (`a,` then `g = 1`) can also end with no `=` at all:
// with a comma last Luau is missing the next target (`a,` then `end`), and
// otherwise the `=` (`a,` then `g` then `end`).
export function validateReassignmentList(
  content: SyntaxNode,
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
  for (let child = content.firstChild; child; child = child.nextSibling) {
    if (isInsignificant(child.name)) continue;
    if (!sawAssignment && child.name !== "LuauAssignmentOperation") {
      if (isListCommaName(child.name)) sawTargetComma = true;
      else if (child.name !== "LuauAccessPath") onlyTargets = false;
    }
    if (child.name === "LuauAssignmentOperation") {
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
      const at = child.from + ctx.read(child.from, child.to).indexOf(",");
      // Luau's parser reports this comma too, and the type checker reports
      // its error where it reads the statement (#1175).
      if (typeCheckerReportsMissingValue(child, at, ctx)) return;
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
    const got = nextSignificantToken(last.to, (from, to) => ctx.read(from, to));
    const at = got?.from ?? last.to;
    const gotDisplay = got == null ? "<eof>" : `'${got.text}'`;
    reportParseError(
      `Expected '=' when parsing assignment, got ${gotDisplay}`,
      { from: at, to: at + (got?.text.length ?? 0) },
      ctx,
    );
    return;
  }
  const lastContinued = continuation.findLast((n) => !isInsignificant(n.name));
  if (lastContinued?.name === "LuauCommaSeparator") {
    validateListComma(lastContinued, true, ctx);
  } else if (!lastContinued && isListCommaName(last?.name)) {
    validateListComma(last!, true, ctx);
  }
}

// A token that cannot begin a Luau value: a binary operator (`+`, `*`, `/`,
// `%`, `^`, `..`, a comparison, `and`, `or`), an accessor with no base
// (`:method()`, `.field`, `::`), or an indexer with no base (`[1]`, but not a
// `[[` or `[=[` long string). A value can begin with the unary `-`, `not` or
// `#`, with `...`, or with a number such as `.5`. The grammar reads each of
// these tokens after a comma as the rest of an expression with no start
// (an operation, a chained call, an indexer), in a node whose name varies, so
// the source text is what tells them apart.
const CANNOT_BEGIN_VALUE =
  /^(?:[+*/%^<>=~:]|\.(?![.\d])|\.\.(?!\.)|\[(?!=*\[)|(?:and|or)(?![A-Za-z0-9_]))/;

// Whether the value node `node`, after a list comma, starts with a token that
// cannot begin a value (`+ 2`, `:method()`, `and x`).
export function cannotBeginValue(node: SyntaxNode, ctx: LowerContext): boolean {
  return CANNOT_BEGIN_VALUE.test(ctx.read(node.from, node.to).trimStart());
}

// The keywords that begin an expression; every other one ends it.
const EXPRESSION_KEYWORDS: ReadonlySet<string> = new Set([
  "nil",
  "true",
  "false",
  "not",
  "function",
  "if",
]);

// Whether Luau's parser can read an expression that begins with `token`, as
// `nextSignificantToken` gives it: a name, a keyword that begins an
// expression, a number, a string, a table, a parenthesized value, a unary
// operator, `...` (or a number such as `.5`), a long string or a Sparkdown
// regex literal (`@/x/`).
export function startsLuauExpression(token: string): boolean {
  if (/^[A-Za-z_]/.test(token)) {
    return !RESERVED.has(token) || EXPRESSION_KEYWORDS.has(token);
  }
  return /^[\d"'`{(\-#.[@]/.test(token);
}

// The unary operators, which an operand must follow.
const UNARY_OPERATORS: ReadonlySet<string> = new Set(["-", "not", "#"]);

// Whether Luau's parser reports a value missing where the grammar found none
// after `pos`: the next token, past any unary operators, cannot begin a
// value, so Luau does not read one there either. Where it can (a value on
// a narrative body's next line, or on a line at column 0), the grammar and
// Luau read the lines differently, and only Sparkdown reports the value
// missing. A cast's `::` is Sparkdown's to report too (see
// `SparkdownTypechecker`).
// The type checker reports it only where it reads both the statement
// (`node`) and the token Luau finds instead: in a narrative body a `;` or a
// word the grammar reads as story is not in the checked Luau.
export function luauReportsMissingValue(
  node: SyntaxNode,
  pos: number,
  read: (from: number, to: number) => string,
): boolean {
  let got = nextSignificantToken(pos, read);
  while (got && UNARY_OPERATORS.has(got.text)) {
    got = nextSignificantToken(got.from + got.text.length, read);
  }
  if (got && (got.text === ":" || startsLuauExpression(got.text))) return false;
  return isCheckedLuau(node, read) && (got == null || isCheckedLuauAt(node, got.from, read));
}

// Whether the type checker reports a value missing after `node`, at `pos`,
// as Luau's parser does, with Luau's range, the token found instead (#1175).
function typeCheckerReportsMissingValue(
  node: SyntaxNode,
  pos: number,
  ctx: LowerContext,
): boolean {
  return luauReportsMissingValue(node, pos, (from, to) => ctx.read(from, to));
}

// The token Luau would report after `pos`. Scans forward over whitespace,
// newlines, and Luau comments (`-- line` and `--[[ block ]]`), returning the
// next identifier/keyword run or the next single (punctuation) character with
// its document offset, or `null` (rendered as `<eof>`) when nothing but
// skippable text follows. The text read doubles until the token is whole or
// the document ends, so no comment is too long to see past.
export function nextSignificantToken(
  pos: number,
  read: (from: number, to: number) => string,
): { text: string; from: number } | null {
  for (let size = LOOKAHEAD; ; size *= 2) {
    const window = read(pos, pos + size);
    const token = tokenIn(window, window.length < size);
    if (token !== undefined) {
      return token ? { text: token.text, from: pos + token.at } : null;
    }
  }
}

// The first significant token in `window`, or `null` when there is none.
// Unless the window runs to the end of the document (`complete`), a comment
// or token that reaches near its end gives `undefined`: a longer window is
// needed to read it whole.
function tokenIn(
  window: string,
  complete: boolean,
): { text: string; at: number } | null | undefined {
  // A token, or a comment's opening, is never this long.
  const reach = complete ? window.length : window.length - 64;
  let i = 0;
  while (i < reach) {
    const c = window[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === "-" && window[i + 1] === "-") {
      // Block comment `--[[ … ]]` (and long-bracket levels `--[==[ … ]==]`).
      const block = /^--\[(=*)\[/.exec(window.slice(i));
      if (block) {
        const close = "]" + block[1] + "]";
        const end = window.indexOf(close, i + block[0]!.length);
        if (end < 0) return complete ? null : undefined;
        i = end + close.length;
        continue;
      }
      // Line comment `-- …` runs to end of line.
      const nl = window.indexOf("\n", i);
      if (nl < 0) return complete ? null : undefined;
      i = nl + 1;
      continue;
    }
    const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(window.slice(i));
    if (word && !complete && i + word[0].length >= window.length) {
      return undefined;
    }
    return { text: word ? word[0] : c, at: i };
  }
  return complete ? null : undefined;
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

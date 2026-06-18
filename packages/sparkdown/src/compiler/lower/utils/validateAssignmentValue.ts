import { type SyntaxNode } from "@lezer/common";
import { getDescendent } from "@impower/textmate-grammar-tree/src/tree/utils/getDescendent";
import { ErrorType, SourceMetadata } from "../../../inkjs/engine/Error";
import { LowerContext } from "../context";

// How far past the `=` to scan for the token Luau reports as "got '<token>'".
// Generous enough to skip whitespace, blank lines, and a trailing comment to
// the next real token. If the next token were somehow farther than this (only
// reachable with thousands of chars of pure whitespace/comments — never in
// authored content) the message degrades to `got <eof>`; the diagnostic still
// fires, since emptiness is detected from the parse tree, not this window.
const LOOKAHEAD = 4096;

// Grammar node names that carry no value — whitespace and comments. A comment
// is lexical whitespace to Luau, so `name = -- todo` has an EMPTY right-hand
// side just like a bare `name =`.
const COMMENT_NAMES: ReadonlySet<string> = new Set([
  "LuauLineComment",
  "LuauBlockComment",
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

  const got = nextSignificantToken(operator.to, ctx);
  const gotDisplay = got == null ? "<eof>" : `'${got}'`;
  ctx.diagnostics.push({
    message: `Expected identifier when parsing expression, got ${gotDisplay}`,
    severity: ErrorType.Error,
    source: makeSource(operatorTokenRange(operator, ctx), ctx),
  });
}

// The token Luau would report after the `=`. Scans forward from `pos` over
// whitespace, newlines, and Luau comments (`-- line` and `--[[ block ]]`),
// returning the next identifier/keyword run, the next single (punctuation)
// character, or `null` (rendered as `<eof>`) when nothing but skippable text
// follows.
function nextSignificantToken(pos: number, ctx: LowerContext): string | null {
  const window = ctx.read(pos, pos + LOOKAHEAD);
  let i = 0;
  while (i < window.length) {
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
        if (end < 0) return null; // unterminated within the window
        i = end + close.length;
        continue;
      }
      // Line comment `-- …` runs to end of line.
      const nl = window.indexOf("\n", i);
      if (nl < 0) return null; // runs to (at least) the window end
      i = nl + 1;
      continue;
    }
    break;
  }
  if (i >= window.length) return null;
  const rest = window.slice(i);
  const word = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
  if (word) {
    // If the identifier match reached the window's edge it may be truncated;
    // re-read a fresh slice from its start to capture it whole.
    if (i + word[0].length >= window.length) {
      const tail = ctx.read(pos + i, pos + i + 512);
      const full = /^[A-Za-z_][A-Za-z0-9_]*/.exec(tail);
      if (full) return full[0];
    }
    return word[0];
  }
  return rest[0]!;
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

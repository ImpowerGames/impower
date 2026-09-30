import { ancestorMatching } from "../../utils/ancestorMatching";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { Range } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import VALID_STYLE_PROPS_DATA from "../../constants/validStyleProps.json";
import {
  CUSTOM_PROPERTY_ALIASES,
  isAliasedAttributeProp,
} from "../../constants/dataAttributeProps";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { formatList } from "../../utils/formatList";
import {
  isLineContinuation,
  TYPE_NAME_EXTRA_QUALIFIER,
} from "../../lower/utils/lineContinuation";
import { nextSignificantToken } from "../../lower/utils/validateAssignmentValue";
import { RESERVED } from "../../lint/luauNames";
import { isTrivia, soleVariableName } from "../../lint/luauTree";
import { isCheckedLuau } from "../../typecheck/LuauUnitNodes";
import { VARIABLE_DEFINITION_CONTENT_NAMES } from "../../utils/variableDefinitionNames";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import { RUN_WRAPPER_SUFFIX, runWrapperName } from "../../utils/runWrapper";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS || [];
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS || [];
const LAYOUT_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LAYOUT_CONTROL_KEYWORDS || [];
const LOAD_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LOAD_CONTROL_KEYWORDS || [];
// `[[...]]` brackets carry visual (show/hide/animate), screen-lifecycle
// (open/close/navigate), and preload (load) verbs — see the *_CONTROL_KEYWORDS
// variables in the grammar.
const BRACKET_CONTROL_KEYWORDS = [
  ...IMAGE_CONTROL_KEYWORDS,
  ...LAYOUT_CONTROL_KEYWORDS,
  ...LOAD_CONTROL_KEYWORDS,
];

// The whole `[[…]]` / `((…))` command + its control token. A clause keyword/
// value is a SIBLING of AssetCommandInstruction (both under the command), so
// reading the control from a clause node walks up to the command, not the
// instruction.
const ASSET_COMMAND = nodeNameSet(["ImageCommand", "AudioCommand"]);
const ASSET_COMMAND_CONTROL = nodeNameSet(["AssetCommandControl"]);

// The closed set of `@event` names a Sparkle element line can bind. Source of
// truth: the runtime's `EventMap` (packages/spark-engine/src/game/core/types/
// EventMap.ts) — the renderer only forwards these, and an unknown name silently
// never fires, so a typo (`@clik`) is always a bug. Keep in sync with EventMap.
const VALID_SPARKLE_EVENTS = new Set([
  "click", "mousedown", "mouseenter", "mouseleave", "mousemove", "mouseout",
  "mouseover", "mouseup",
  "pointercancel", "pointerdown", "pointerenter", "pointerleave", "pointermove",
  "pointerout", "pointerover", "pointerup", "gotpointercapture",
  "lostpointercapture",
  "touchcancel", "touchend", "touchmove", "touchstart",
  "drag", "dragend", "dragenter", "dragleave", "dragover", "dragstart", "drop",
  "wheel",
  "scroll", "scrollend",
  "input", "change",
  "keydown", "keyup", "keypress",
  "focus", "focusin", "focusout", "blur",
]);

// The prop names a Sparkle `#prop=value` may use without warning: every real CSS
// property + the sparkle style vocabulary + widget props (generated into
// validStyleProps.json from mdn-data + sparkle-style-transformer). Sparkle passes
// unknown props straight through to CSS, so the value is catching typos
// (`#colr`) without flagging valid raw CSS or `--custom` props.
const VALID_STYLE_PROPS = new Set<string>(VALID_STYLE_PROPS_DATA.props);

// The element-line handler attribute (`@click=save`). `EventAttributeName` is
// also emitted for STYLE SELECTORS (`@hovered:`, `@theme(dark)`), whose
// vocabulary is unrelated — so the EventMap check must find this wrapper above
// it before it says anything.
const SPARKLE_EVENT_HANDLER = nodeNameSet(["LuauEventAttribute"]);

// Luau string literals. Every form parses as `<name>_begin`, `<name>_content`
// and `<name>_end`; an unfinished literal has no `_end` child.
const LUAU_QUOTED_STRING = nodeNameSet([
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauInterpolatedString",
]);
const LUAU_STRING = nodeNameSet([
  "LuauDoubleQuotedString",
  "LuauSingleQuotedString",
  "LuauInterpolatedString",
  "LuauMultilineString",
]);

// Luau numeric literals. Their first child is the literal text; the second is
// the trailing whitespace capture.
const LUAU_NUMBER = nodeNameSet([
  "LuauNumericDecimal",
  "LuauNumericHex",
  "LuauNumericBinary",
]);
// The grammar's `LUAU_TYPE_END_BEFORE_OPTIONAL` without the `]` that a block
// comment's close adds, tested against the two characters before a position.
const LUAU_TYPE_END_BEFORE_OPTIONAL = /(?:[\w)}"'`?]|[^-]>)$/;

// The inline text command (`<1.5x:...>`) reuses the number rule for its
// control argument, where the surrounding syntax is not Luau.
const TEXT_COMMAND_CONTROL = nodeNameSet(["TextCommandControl"]);

// The characters Luau's lexer skips after a `\z` escape. Narrower than JS
// `\s`, which also matches non-breaking and other Unicode spaces.
const LUAU_WHITESPACE_RUN = /^[ \t\r\n\v\f]+$/;

const MALFORMED_STRING = "Malformed string; did you forget to finish it?";
const MALFORMED_NUMBER = "Malformed number";
// Luau reports an unfinished `--[[` from wherever the parser was expecting
// its next token; the expression-position wording is the one its test suite
// pins, so it is the one sparkdown uses everywhere.
const UNFINISHED_COMMENT =
  "Expected identifier when parsing expression, got unfinished comment";
const STRAY_OPTIONAL = "Expected type, got '?'";
const MISSING_OPERAND = "Expected identifier when parsing expression, got ';'";
const MISSING_TYPE = "Expected type";
// The grammar's tokens for a type that is missing or malformed, and for a
// declaration target's `::`.
const TYPE_ERROR_TOKENS = nodeNameSet([
  "LuauTypeStrayOptionalOperator",
  "LuauTypeStrayColon",
  "LuauTypeAnnotationMissingType",
  "LuauTypeBinaryOperatorMissingType",
  "LuauFunctionReturnMissingType",
  "LuauTargetTypeCastOperator",
  "LuauTypeOptionalOperator",
]);
const MISSING_METHOD_NAME = "Expected identifier when parsing method name";
const TARGET_TYPECAST = "Expected identifier when parsing expression, got '::'";
const MISSING_VARIABLE_NAME = "Expected identifier when parsing variable name";
const DECLARATION_COMMA = nodeNameSet([
  "LuauCommaSeparator",
  "LuauCommaLineBreak",
]);
const DECLARATION_ASSIGNMENT = nodeNameSet(["LuauAssignmentOperation"]);
const MISSING_TYPE_NODES = nodeNameSet([
  "LuauTypeAnnotationMissingType",
  "LuauTypeBinaryOperatorMissingType",
  "LuauFunctionReturnMissingType",
]);
const EMPTY_AT_END_OPERATIONS = nodeNameSet([
  "LuauTypeAnnotationOperation",
  "LuauFunctionReturnType",
]);
// The `:` of each, with the whitespace around it on its line.
const TYPE_COLON_BEGINS = nodeNameSet([
  "LuauTypeAnnotationOperator_begin",
  "LuauFunctionReturnType_begin",
]);
const LUAU_TYPE_LITERAL = nodeNameSet(["LuauTypeLiteral"]);
const LUAU_NAME_START = /[A-Za-z_]/;
const LUAU_NAME = /^[A-Za-z_]\w*/;
// The keywords that cannot start a type, which leave an annotation empty.
const LUAU_NON_TYPE_KEYWORDS = new Set<string>(
  GRAMMAR_DEFINITION.variables.LUAU_NON_TYPE_KEYWORDS,
);
// The `end` line a `run` file's wrapper closes its function with.
const RUN_WRAPPER_END = RUN_WRAPPER_SUFFIX.slice("\n".length);
const STRAY_CLOSING_BRACKET =
  "Expected identifier when parsing expression, got ']'";
// A block comment after a type that closes on a later line is its own rule
// (`LuauTypeTrailingBlockComment`), which differs in what it leaves after
// its close: the whitespace before code, or, before code right after the
// close, the closing brackets, which the body reads as
// `LuauTypeTrailingBlockCommentClose`.
const LUAU_BLOCK_COMMENT_OPENINGS: SparkdownNodeName[] = [
  "LuauBlockComment",
  "LuauTypeTrailingBlockComment",
];
const LUAU_BLOCK_COMMENT_NAMES: SparkdownNodeName[] = [
  ...LUAU_BLOCK_COMMENT_OPENINGS,
  "LuauTypeTrailingBlockCommentClose",
];
const LUAU_BLOCK_COMMENT_OPENING = nodeNameSet(LUAU_BLOCK_COMMENT_OPENINGS);
const LUAU_BLOCK_COMMENT = nodeNameSet(LUAU_BLOCK_COMMENT_NAMES);
const LUAU_COMMENT = nodeNameSet([
  ...LUAU_BLOCK_COMMENT_NAMES,
  "LuauDocLineComment",
  "LuauLineComment",
]);
// Luau reads a name on a later line after a `.`, but a Sparkdown access path
// ends with its line.
const NAME_ON_LATER_LINE =
  "Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line";
// Luau's parser reports the first part of an if expression it does not find
// in these words (`parseIfElseExpr`): a condition or an arm's value is an
// expression, and `then` and `else` are keywords it expects. It adds the
// token it found instead, which lies outside the expression, so these leave
// it out.
const IF_EXPRESSION_WITHOUT_VALUE =
  "Expected identifier when parsing expression";
const IF_EXPRESSION_WITHOUT_THEN =
  "Expected 'then' when parsing if then else expression";
const IF_EXPRESSION_WITHOUT_ELSE =
  "Expected 'else' when parsing if then else expression";
const LUAU_IF_KEYWORD = nodeNameSet(["LuauIfKeyword"]);
const LUAU_THEN_KEYWORD = nodeNameSet(["LuauThenKeyword"]);
const LUAU_ELSE_KEYWORD = nodeNameSet(["LuauElseKeyword"]);
// The parts of an if expression's clause that are not its value.
const IF_CLAUSE_TRIVIA = new Set([
  "LuauThenOperator",
  "LuauElseOperator",
  "LuauComment",
  "LuauLineComment",
  "LuauDocLineComment",
  ...LUAU_BLOCK_COMMENT_NAMES,
  "LuauCommaSeparator",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "Newline",
]);
// The hosts whose `{…}` interpolations Sparkle and struct bodies lower as
// Luau bindings. Everywhere else a `{…}` interpolation is display text,
// which `lowerDisplay.ts` lowers as an inline conditional when it is an if
// expression (`tryLowerInlineConditional`).
const LUAU_BINDING_INTERPOLATION_HOSTS = nodeNameSet([
  "LuauPropAttribute",
  "StringFieldValueInterpolated",
  "LuauElementContentStringInterpolated",
]);

function isInlineConditional(node: any): boolean {
  return (
    node.parent?.name === "LuauInterpolatedStringExpression_content" &&
    !ancestorMatching(node.parent.parent, LUAU_BINDING_INTERPOLATION_HOSTS)
  );
}

// The operations whose node begins with their operator. Only `-`, `not` and
// `#` can begin a value, and then only with an operand after them.
const OPERATOR_FIRST_OPERATIONS = new Set([
  "LuauArithmeticOperation",
  "LuauCompareOperation",
  "LuauConcatOperation",
  "LuauLogicalOperation",
  "LuauLengthOperation",
  "LuauTypeCastOperation",
]);
const UNARY_OPERATORS = new Set(["-", "not", "#"]);

// The first part of `node`'s `_content` from `start` on that is not a
// comment or space.
function firstPart(node: any, start = node?.firstChild): any {
  let part = start;
  while (part && IF_CLAUSE_TRIVIA.has(part.name)) part = part.nextSibling;
  return part ?? null;
}

// Whether an if expression's clause holds a value: its first part that is not
// its keyword, a comment or space is a value, not a line or an operator that
// continues a value before it, nor a unary operator with nothing after it.
function clauseHasValue(
  clause: any,
  read: (from: number, to: number) => string,
): boolean {
  const content = childNamed(clause, `${clause.name}_content`);
  const part = firstPart(content);
  return !!part && !isLineContinuation(part) && isValue(part, read);
}

// Whether `part` begins a value. An operation that begins with its operator,
// or an operator on its own, begins one only when the operator is unary and a
// value follows it (`not x`, but not `not not`, which the grammar reads as one
// operation holding both operators).
function isValue(
  part: any,
  read: (from: number, to: number) => string,
): boolean {
  if (OPERATOR_FIRST_OPERATIONS.has(part.name)) {
    const operator = firstPart(childNamed(part, `${part.name}_content`));
    return !!operator && isValue(operator, read);
  }
  if (!part.name.endsWith("Operator")) return true;
  if (!UNARY_OPERATORS.has(read(part.from, part.to).trim())) return false;
  const operand = firstPart(part.parent, part.nextSibling);
  return !!operand && isValue(operand, read);
}

// The first part an if expression lacks, reading it in order: a condition,
// `then` and its value, then either `elseif` and another condition or
// `else` and its value. The node it returns is the keyword to report on:
// the `if`, or the `elseif`, `then` or `else` of the clause that is short.
function missingIfExpressionPart(
  node: any,
  read: (from: number, to: number) => string,
): { message: string; at: any } | null {
  const content = childNamed(node, "LuauTernaryExpression_content");
  let at = firstDescendant(node, LUAU_IF_KEYWORD);
  let expecting: "condition" | "then" | "else" = "condition";
  const missing = () => ({
    message:
      expecting === "condition"
        ? IF_EXPRESSION_WITHOUT_VALUE
        : expecting === "then"
          ? IF_EXPRESSION_WITHOUT_THEN
          : IF_EXPRESSION_WITHOUT_ELSE,
    at,
  });
  for (let c = content?.firstChild; c; c = c.nextSibling) {
    if (c.name === "LuauTernaryExpressionCondition") {
      if (expecting !== "condition") return missing();
      if (!clauseHasValue(c, read)) return { message: IF_EXPRESSION_WITHOUT_VALUE, at };
      expecting = "then";
    } else if (c.name === "LuauThenExpression") {
      if (expecting !== "then") return missing();
      if (!clauseHasValue(c, read)) {
        return {
          message: IF_EXPRESSION_WITHOUT_VALUE,
          at: firstDescendant(c, LUAU_THEN_KEYWORD) ?? at,
        };
      }
      expecting = "else";
    } else if (c.name === "LuauElseifKeyword") {
      if (expecting !== "else") return missing();
      at = c;
      expecting = "condition";
    } else if (c.name === "LuauElseExpression") {
      if (expecting !== "else") return missing();
      if (!clauseHasValue(c, read)) {
        return {
          message: IF_EXPRESSION_WITHOUT_VALUE,
          at: firstDescendant(c, LUAU_ELSE_KEYWORD) ?? at,
        };
      }
      return null;
    }
  }
  return missing();
}

// Luau's `toUtf8` refuses code points above this, so `\u{80000000}` is a
// malformed escape rather than a character.
const MAX_UNICODE_ESCAPE = 0x7fffffff;

function childNamed(node: any, name: string): any {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (c.name === name) return c;
  }
  return null;
}

// Normalize a prop name to the vocabulary's kebab-case form the way the renderer
// does (`getCSSPropertyName`): camelCase → kebab, `_` → `-`, lowercased. So
// `#maxWidth` / `#max_width` both match `max-width`.
function normalizeStylePropName(name: string): string {
  return name
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

// DFS in-order: first descendant (or self) whose name is in `names`, else null.
function firstDescendant(node: any, names: Set<string>): any {
  if (names.has(node.name)) return node;
  let c = node.firstChild;
  while (c) {
    const found = firstDescendant(c, names);
    if (found) return found;
    c = c.nextSibling;
  }
  return null;
}

// NOTE: This annotator previously also validated property selectors
// (`PropertySelectorSimpleConditionName`/`...FunctionConditionName`/
// `PropertySelectorConstant`), reserved define names (`DefineVariableName`),
// and `InvalidFieldValue`. The Luau port restructured the selector grammar
// (now `SimpleSelectorFunction`/`RecursiveSelectorFunction`/
// `SelectorPropertyNamePart`, bad names caught by `InvalidSelectorPropertyName`)
// and typed field values (`Numeric/Boolean/String/UnquotedStringFieldValue`),
// so those node names no longer exist — the branches were dead. They were
// removed (along with the `ConditionalBracedBlock` value-type checks: the
// asset-clause value position now only admits TimeValue/NumberValue/NameValue,
// so no conditional node appears there). Only the asset-command validations
// below remain live.

export interface Diagnostic {
  message?: string;
  severity?: "info" | "warning" | "error";
}

export class ValidationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Diagnostic>
> {
  /** Does this `[[…]]` command contain a `to <NameValue>` destination (the
   *  navigate target screen)? Mirrors how ReferenceAnnotator reads a clause
   *  value's keyword (`prevSibling.prevSibling`). */
  protected hasNavigateDestination(commandNode: any): boolean {
    const search = (node: any): boolean => {
      if (node.name === "NameValue") {
        const clauseKeywordNode = node.prevSibling?.prevSibling;
        const clauseKeyword = clauseKeywordNode
          ? this.read(clauseKeywordNode.from, clauseKeywordNode.to)
          : "";
        if (clauseKeyword === "to") {
          return true;
        }
      }
      let c = node.firstChild;
      while (c) {
        if (search(c)) {
          return true;
        }
        c = c.nextSibling;
      }
      return false;
    };
    return search(commandNode);
  }

  protected error(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    message: string,
    from: number,
    to: number,
  ) {
    annotations.push(
      SparkdownAnnotation.mark<Diagnostic>({ message, severity: "error" }).range(
        from,
        to,
      ),
    );
  }

  /**
   * Malformed Luau literals: an unfinished string or block comment, a bad
   * escape sequence, or a number that runs into letters. The grammar
   * recovers from each of these silently (an unfinished `"` swallows the
   * following lines, `123x` parses as `123` followed by narrative text, `\xQQ`
   * lowers to a literal `x`), so without these diagnostics the mistake shows
   * up as wrong program behavior rather than an error at the typo. The
   * wording matches Luau's parser so its diagnostic tests apply verbatim.
   */
  protected validateLuauLiteral(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): boolean {
    const name = nodeRef.name as string;
    if (LUAU_STRING.has(name)) {
      const node = nodeRef.node as any;
      // `[[...]]` holds raw text: no escapes, and newlines are content.
      if (!LUAU_QUOTED_STRING.has(name)) {
        if (!childNamed(node, `${name}_end`)) {
          this.error(annotations, MALFORMED_STRING, nodeRef.from, nodeRef.to);
          return true;
        }
        return false;
      }
      const escapeMessage =
        name === "LuauInterpolatedString"
          ? "Interpolated string literal contains malformed escape sequence"
          : "String literal contains malformed escape sequence";
      const content = childNamed(node, `${name}_content`);
      // `\z` skips every ASCII whitespace character after it (Luau's lexer
      // set: space, tab, CR, LF, VT, FF), line breaks included, so a newline
      // inside that run is not the end of the string. A non-breaking space or
      // any other Unicode space ends the run, as it does in Luau.
      let skippingWhitespace = false;
      let prev: any = null;
      for (let c = content?.firstChild; c; prev = c, c = c.nextSibling) {
        if (
          skippingWhitespace &&
          LUAU_WHITESPACE_RUN.test(this.read(c.from, c.to))
        ) {
          continue;
        }
        skippingWhitespace = false;
        // A quoted string ends at its line unless the newline is escaped
        // with `\` + newline.
        if (c.name === "Newline") {
          if (!prev || prev.name !== "LuauEscapeLine") {
            this.error(annotations, MALFORMED_STRING, nodeRef.from, c.from);
            return true;
          }
          continue;
        }
        const esc = this.read(c.from, c.to);
        let malformed = false;
        if (c.name === "LuauEscapeStandard" && esc === "\\z") {
          skippingWhitespace = true;
        } else if (c.name === "LuauEscapeAny") {
          // `\x` and `\u` only reach here when their digits are missing.
          malformed = esc === "\\x" || esc === "\\u";
        } else if (c.name === "LuauEscapeDecimal") {
          malformed = parseInt(esc.slice(1), 10) > 255;
        } else if (c.name === "LuauEscapeUnicode") {
          const hex = esc.match(/^\\u\{([0-9a-fA-F]*)\}$/)?.[1];
          malformed =
            hex === undefined ||
            hex.length === 0 ||
            parseInt(hex, 16) > MAX_UNICODE_ESCAPE;
        }
        if (malformed) {
          this.error(annotations, escapeMessage, c.from, c.to);
          return true;
        }
      }
      // No newline and no closing quote: the string runs to the end of the
      // file (a quoted string is always the last thing on its line, so the
      // newline check above reports every other unfinished one).
      if (!childNamed(node, `${name}_end`)) {
        this.error(annotations, MALFORMED_STRING, nodeRef.from, nodeRef.to);
        return true;
      }
      return false;
    }
    if (LUAU_NUMBER.has(name)) {
      if (ancestorMatching(nodeRef.node, TEXT_COMMAND_CONTROL)) {
        return false;
      }
      const literal = (nodeRef.node as any).firstChild;
      const literalTo = literal ? literal.to : nodeRef.to;
      const text = this.read(nodeRef.from, literalTo);
      // Luau's lexer takes every following letter, digit, `_` and `.` into
      // the number token and then fails to convert it; the grammar stops at
      // the first character it cannot use, so look at what comes next, up to
      // the end of the line.
      const lineTo = this.text?.lineAt(literalTo).to ?? literalTo;
      const rest = this.read(literalTo, lineTo).match(/^[A-Za-z0-9_.]+/);
      const noDigits = /^0_*[xX]_*$/.test(text);
      if (rest || noDigits) {
        this.error(
          annotations,
          MALFORMED_NUMBER,
          nodeRef.from,
          literalTo + (rest ? rest[0].length : 0),
        );
        return true;
      }
      return false;
    }
    if (LUAU_BLOCK_COMMENT_OPENING.has(name)) {
      if (!childNamed(nodeRef.node, `${name}_end`)) {
        this.error(annotations, UNFINISHED_COMMENT, nodeRef.from, nodeRef.to);
        return true;
      }
      return false;
    }
    // The grammar reads closing brackets before code as a trailing type
    // comment's close wherever a statement or parameter can begin, since no
    // pattern can see the comment's opening on an earlier line. Brackets that
    // no such comment ends right before are Luau's first unexpected token.
    if (name === "LuauTypeTrailingBlockCommentClose") {
      if (!this.endsTrailingTypeComment(nodeRef.from)) {
        this.error(annotations, STRAY_CLOSING_BRACKET, nodeRef.from, nodeRef.from + 1);
        return true;
      }
      return false;
    }
    return false;
  }

  /**
   * The Luau token at or after `pos`, past whitespace, line breaks and the
   * Luau comments the grammar read: a whole name or keyword, or one
   * character. `""` at the end of the Luau, which for a `run` file is the
   * `end` its wrapper closes its function with.
   */
  protected tokenAfterTrivia(pos: number): string {
    for (;;) {
      const char = this.read(pos, pos + 1);
      if (!char || this.isRunWrapperEnd(pos)) {
        return "";
      }
      if (/\s/.test(char)) {
        pos += 1;
        continue;
      }
      let node = this.tree?.resolveInner(pos, 1) ?? null;
      while (node && !LUAU_COMMENT.has(node.name)) {
        node = node.parent;
      }
      if (!node || node.to <= pos) {
        if (!LUAU_NAME_START.test(char)) {
          return char;
        }
        const lineTo = this.text?.lineAt(pos).to ?? pos + 1;
        return this.read(pos, lineTo).match(LUAU_NAME)?.[0] ?? char;
      }
      pos = node.to;
    }
  }

  /** Whether `pos` is the `end` a `run` file's wrapper closes it with
   *  (`runFileUnit`), which is not in the file. */
  protected isRunWrapperEnd(pos: number): boolean {
    const length = this.text?.length ?? 0;
    return (
      !!this.uri &&
      runWrapperName(this.uri) !== undefined &&
      pos === length - RUN_WRAPPER_END.length &&
      this.read(pos, length) === RUN_WRAPPER_END
    );
  }

  /**
   * Whether a missing-type `:` is read as part of an access path (`t.a: = 2`)
   * other than a `for` loop variable's annotation (`for i: = 1, 3`): the name
   * directly after `for` or after a comma before the loop's `in` or `=`.
   */
  protected isMethodColon(node: SyntaxNode): boolean {
    const part = node.parent;
    if (part?.name !== "LuauAccessPart") {
      return false;
    }
    let path: SyntaxNode | null = part.parent;
    while (path && path.name !== "LuauAccessPath") {
      path = path.parent;
    }
    if (!path || path.parent?.name !== "LuauForCondition_content") {
      return true;
    }
    if (part.prevSibling?.name !== "LuauAccessPart" || part.prevSibling.prevSibling) {
      return true;
    }
    for (let before = path.prevSibling; before; before = before.prevSibling) {
      if (
        before.name === "LuauInKeyword" ||
        before.name === "LuauAssignmentOperation"
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Where the type checker does not read the Luau (a flow header or a
   * `store` declaration), the token Luau would find after `pos` if it did,
   * and where Luau's range for it ends: the next token on its line, or on a
   * later line that is Luau the checker reads or starts with a keyword (a
   * flow's `end`, or a statement's, which the grammar may have read as the
   * type when it had only part of the text). Otherwise the Luau ends
   * (`null`, `<eof>`), and the range ends at the start of the next line, as
   * Luau's does at the end of a unit.
   */
  protected luauTokenAfter(pos: number): { text: string | null; to: number } {
    const read = (from: number, to: number) => this.read(from, to);
    const got = nextSignificantToken(pos, read);
    if (got && !read(pos, got.from).includes("\n")) {
      return { text: got.text, to: got.from + got.text.length };
    }
    if (got) {
      const node = this.tree?.resolveInner(got.from, 1) ?? null;
      if (LUAU_NON_TYPE_KEYWORDS.has(got.text) || (node && isCheckedLuau(node, read))) {
        return { text: got.text, to: got.from + got.text.length };
      }
      return { text: null, to: this.text?.lineAt(got.from).from ?? got.from };
    }
    return { text: null, to: this.text?.length ?? pos };
  }

  /** The end of the token before `pos`, past the whitespace and block
   *  comments before it, where Luau's range for a token it did not expect
   *  begins. */
  protected endOfTokenBefore(pos: number): number {
    const before = this.startBeforeBlockComments(pos) ?? pos;
    let end = before;
    while (end > 0 && LUAU_WHITESPACE_RUN.test(this.read(end - 1, end))) {
      end -= 1;
    }
    return end;
  }

  /** Whether a `LuauTypeTrailingBlockComment` ends at `pos`, leaving its
   *  closing brackets to the body there. */
  protected endsTrailingTypeComment(pos: number): boolean {
    let node = this.tree?.resolveInner(pos, -1) ?? null;
    while (node && node.name !== "LuauTypeTrailingBlockComment") {
      node = node.parent;
    }
    return node?.to === pos;
  }

  /**
   * The part of a declaration's content before `node` (its targets, the
   * commas between them and, from the first `=` on, its values), past
   * comments and whitespace: `null` when `node` comes first, and `undefined`
   * when an `=` comes before it, since `node` is then among the values, not
   * the targets.
   */
  protected declarationTargetBefore(
    node: SyntaxNode,
  ): SyntaxNode | null | undefined {
    let before: SyntaxNode | null = null;
    for (let sibling = node.prevSibling; sibling; sibling = sibling.prevSibling) {
      if (
        DECLARATION_ASSIGNMENT.has(sibling.name) ||
        (sibling.name === "LuauVariableAssignment" &&
          sibling.getChild("LuauVariableAssignment_content")?.getChild("LuauAssignmentOperation"))
      ) {
        return undefined;
      }
      if (!before && !isTrivia(sibling)) {
        before = sibling;
      }
    }
    return before;
  }

  /** The end of the text before the block comments (and the whitespace around
   *  them) that end at `pos`, or null when no block comment ends there. */
  protected startBeforeBlockComments(pos: number): number | null {
    let skipped = false;
    for (;;) {
      while (pos > 0 && LUAU_WHITESPACE_RUN.test(this.read(pos - 1, pos))) {
        pos -= 1;
      }
      let node = this.tree?.resolveInner(pos, -1) ?? null;
      while (node && !LUAU_BLOCK_COMMENT.has(node.name)) {
        node = node.parent;
      }
      if (!node || node.from >= pos) {
        return skipped ? pos : null;
      }
      pos = node.from;
      skipped = true;
    }
  }

  override enter(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Diagnostic>>[] {
    if (this.validateLuauLiteral(annotations, nodeRef)) {
      return annotations;
    }
    // A type that is missing or malformed in Luau the type checker reads is
    // reported by the checker, with Luau's parser's wording and range, since
    // Luau's parser has a point wherever a type can stand (see
    // `SparkdownTypechecker`). The grammar's tokens for one are reported here
    // only where the checker does not read the Luau: in a flow header's
    // parameters and in Sparkdown's own constructs.
    const checkerReportsType =
      TYPE_ERROR_TOKENS.has(nodeRef.name) && isCheckedLuau(nodeRef.node, (from, to) => this.read(from, to));
    // A `?` only ends the type before it; the grammar reads one with no type
    // before it as its own token. The wording and range are Luau's parser's,
    // from the end of the token before it.
    if (nodeRef.name === "LuauTypeStrayOptionalOperator") {
      if (!checkerReportsType) {
        this.error(annotations, STRAY_OPTIONAL, this.endOfTokenBefore(nodeRef.from), nodeRef.to);
      }
      return annotations;
    }
    // Likewise a `:` or `::` where a type must begin.
    if (nodeRef.name === "LuauTypeStrayColon") {
      if (!checkerReportsType) {
        const colon = childNamed(nodeRef.node, "LuauTypeStrayColon_c1");
        this.error(
          annotations,
          `${MISSING_TYPE}, got '${this.read(colon.from, colon.to)}'`,
          this.endOfTokenBefore(colon.from),
          colon.to,
        );
      }
      return annotations;
    }
    // An operator or `if` with only whitespace, line breaks or comments before
    // the `;` that ends its statement has no right operand; the grammar reads
    // it as its own token. A cast's `::` has no type after it, which the
    // type checker reports where it reads the Luau.
    if (nodeRef.name === "LuauOperatorMissingOperand") {
      const isCast = this.read(nodeRef.from, nodeRef.to).trim() === "::";
      if (!isCast || !isCheckedLuau(nodeRef.node, (from, to) => this.read(from, to))) {
        this.error(annotations, MISSING_OPERAND, nodeRef.from, nodeRef.to);
      }
      return annotations;
    }
    // Likewise a type annotation or return type `:`, or a type's `|`, `&` or
    // `->`, with no type before the token after it that cannot start one;
    // Luau names the token it found instead. After a name in a value, the `:`
    // starts a method call, which is missing its name.
    if (MISSING_TYPE_NODES.has(nodeRef.name)) {
      const isMethodColon = this.isMethodColon(nodeRef.node);
      if (!isMethodColon && checkerReportsType) {
        return annotations;
      }
      if (!isMethodColon) {
        // Luau's range, as the checker reports it: from the end of the
        // operator to the end of the token it found.
        const operator = /^\s*(->|[:|&])/.exec(this.read(nodeRef.from, nodeRef.to));
        const from = nodeRef.from + (operator?.[0].length ?? 0);
        const got = this.luauTokenAfter(nodeRef.to);
        this.error(
          annotations,
          `${MISSING_TYPE}, got ${got.text == null ? "<eof>" : `'${got.text}'`}`,
          from,
          got.to,
        );
        return annotations;
      }
      const token = this.tokenAfterTrivia(nodeRef.to);
      const expected = MISSING_METHOD_NAME;
      this.error(
        annotations,
        `${expected}, got ${token ? `'${token}'` : "<eof>"}`,
        nodeRef.from,
        nodeRef.to,
      );
      return annotations;
    }
    // A `::` after a declaration's target, where an annotation takes one `:`.
    if (nodeRef.name === "LuauTargetTypeCastOperator") {
      if (!checkerReportsType) {
        this.error(annotations, TARGET_TYPECAST, nodeRef.from, nodeRef.to);
      }
      return annotations;
    }
    // Likewise in a flow header's parameters, which the checker does not
    // read: a `:` or `::` with no name before it (`scene s(: number)`,
    // `scene s(a, :: number)`), or a `::` after a name (`scene s(a :: number)`),
    // worded as Luau's parser words one among a function's parameters.
    if (
      (nodeRef.name === "LuauTypeCastOperation" ||
        nodeRef.name === "LuauTypeAnnotationOperation") &&
      nodeRef.node.parent?.name === "LuauFunctionParameters_content" &&
      !isCheckedLuau(nodeRef.node, (from, to) => this.read(from, to))
    ) {
      const operator = nodeRef.name === "LuauTypeCastOperation" ? "::" : ":";
      const from = nodeRef.from + this.read(nodeRef.from, nodeRef.to).indexOf(operator);
      let before = nodeRef.node.prevSibling;
      while (before && isTrivia(before)) {
        before = before.prevSibling;
      }
      if (!before || before.name === "LuauCommaSeparator") {
        this.error(
          annotations,
          `${MISSING_VARIABLE_NAME}, got '${operator}'`,
          from,
          from + operator.length,
        );
        return annotations;
      }
      const parameters = nodeRef.node.parent.parent;
      if (operator === "::" && parameters) {
        const column = parameters.from - (this.text?.lineAt(parameters.from).from ?? 0) + 1;
        this.error(
          annotations,
          `Expected ')' (to close '(' at column ${column}), got '::'`,
          from,
          from + operator.length,
        );
        return annotations;
      }
    }
    // A `:` or `::` among a declaration's targets that has no name before it
    // (`local :: number`, `local a, : number`), or a `::` after a target on a
    // line continued from a trailing comma, which `LuauTargetTypeCast` cannot
    // see (`local a,` then `b :: number`). The grammar reads each as an
    // annotation or cast in the declaration's own content.
    if (
      (nodeRef.name === "LuauTypeCastOperation" ||
        nodeRef.name === "LuauTypeAnnotationOperation") &&
      VARIABLE_DEFINITION_CONTENT_NAMES.has(nodeRef.node.parent?.name ?? "")
    ) {
      const operator = nodeRef.name === "LuauTypeCastOperation" ? "::" : ":";
      const from = nodeRef.from + this.read(nodeRef.from, nodeRef.to).indexOf(operator);
      const before = this.declarationTargetBefore(nodeRef.node);
      if (before === null || (before && DECLARATION_COMMA.has(before.name))) {
        this.error(
          annotations,
          `${MISSING_VARIABLE_NAME}, got '${operator}'`,
          from,
          from + operator.length,
        );
        return annotations;
      }
      const comma = before && this.declarationTargetBefore(before);
      if (
        operator === "::" &&
        before &&
        before.name === "LuauAccessPath" &&
        soleVariableName(before) &&
        comma &&
        DECLARATION_COMMA.has(comma.name)
      ) {
        this.error(annotations, TARGET_TYPECAST, from, from + operator.length);
        return annotations;
      }
    }
    // A second annotation `:` where the type should be (`local c: : number`).
    // Luau's range runs from the end of the first `:` to the end of the second.
    if (nodeRef.name === "LuauTypeAnnotationOperator") {
      let previous = nodeRef.node.prevSibling;
      while (previous && isTrivia(previous)) {
        previous = previous.prevSibling;
      }
      if (previous?.name === "LuauTypeAnnotationOperator") {
        const colonEnd = (node: SyntaxNode) =>
          node.from + this.read(node.from, node.to).indexOf(":") + 1;
        this.error(
          annotations,
          `${MISSING_TYPE}, got ':'`,
          colonEnd(previous),
          colonEnd(nodeRef.node),
        );
        return annotations;
      }
    }
    // An annotation with no type before the end of its line where the
    // declaration ends there (`store x:` before a line of story), which the
    // grammar reads with no token for the missing type. The grammar only
    // sees the text it has read so far, so it also cannot tell one whose
    // next line starts past the chunk of text it was given, where it reads
    // that line's keyword as the type. The whole text is here. In Luau the
    // type checker reads, the checker reports it; elsewhere the range is
    // the checker's, from the `:` to the token Luau would find.
    if (
      EMPTY_AT_END_OPERATIONS.has(nodeRef.name) &&
      !isCheckedLuau(nodeRef.node, (from, to) => this.read(from, to))
    ) {
      const colon = firstDescendant(nodeRef.node, TYPE_COLON_BEGINS);
      const token = colon ? this.tokenAfterTrivia(colon.to) : undefined;
      if (
        colon &&
        ((token && LUAU_NON_TYPE_KEYWORDS.has(token)) ||
          !firstDescendant(nodeRef.node, LUAU_TYPE_LITERAL))
      ) {
        const from = colon.from + this.read(colon.from, colon.to).indexOf(":") + 1;
        const got = this.luauTokenAfter(from);
        this.error(
          annotations,
          `${MISSING_TYPE}, got ${got.text == null ? "<eof>" : `'${got.text}'`}`,
          from,
          got.to,
        );
        return annotations;
      }
    }
    // The grammar reads a `?` after a block comment as a suffix, because a
    // lookbehind cannot see whether a type stands before the comment
    // (`() -> --[[c]] ?`). Only a type before the comments makes it one.
    // Luau's range begins at the end of the token before the comments.
    if (nodeRef.name === "LuauTypeOptionalOperator" && !checkerReportsType) {
      const operator = childNamed(nodeRef.node, "LuauTypeOptionalOperator_c2");
      const before = this.startBeforeBlockComments(operator.from);
      if (
        before !== null &&
        !LUAU_TYPE_END_BEFORE_OPTIONAL.test(this.read(Math.max(0, before - 2), before))
      ) {
        this.error(annotations, STRAY_OPTIONAL, this.endOfTokenBefore(operator.from), operator.to);
        return annotations;
      }
    }
    // A member access whose last `.` has no name after it on its line
    // (`t.a.`). The grammar reads that `.`, after any whitespace before it, as
    // its own token, so the `.` is the node's last character. The wording is
    // Luau's parser's, naming the token it meets instead of the name.
    if (nodeRef.name === "LuauDanglingAccessor") {
      const got = nextSignificantToken(nodeRef.to, (from, to) =>
        this.read(from, to),
      );
      const nameOnLaterLine =
        got != null &&
        /^[A-Za-z_]/.test(got.text) &&
        !RESERVED.has(got.text) &&
        this.read(nodeRef.to, got.from).includes("\n");
      const message = nameOnLaterLine
        ? NAME_ON_LATER_LINE
        : `Expected identifier, got ${got == null ? "<eof>" : `'${got.text}'`}`;
      this.error(annotations, message, nodeRef.to - 1, nodeRef.to);
      return annotations;
    }
    // A type name with more than one module prefix (`types.ui.Button`). Luau
    // reads at most `module.Type`, so the segments after it are a syntax
    // error; the grammar keeps them inside the type so this can report them.
    if (nodeRef.name === "LuauTypeNameExtraQualifier") {
      this.error(
        annotations,
        TYPE_NAME_EXTRA_QUALIFIER,
        nodeRef.from,
        nodeRef.to,
      );
      return annotations;
    }
    // A Luau if expression needs a condition, a `then` arm and an `else`
    // arm, each with its value; the grammar closes one whose next part never
    // comes at the end of its lines so this can report the part that is
    // missing. An if expression that is a whole `{…}` interpolation in
    // display text is Sparkdown's inline conditional, which may leave out
    // its arms.
    if (
      nodeRef.name === "LuauTernaryExpression" &&
      !isInlineConditional(nodeRef.node)
    ) {
      const missing = missingIfExpressionPart(nodeRef.node, (from, to) =>
        this.read(from, to),
      );
      if (missing) {
        this.error(
          annotations,
          missing.message,
          missing.at?.from ?? nodeRef.from,
          missing.at?.to ?? nodeRef.to,
        );
      }
    }
    if (nodeRef.name === "AssetCommandControl") {
      const context = getContextNames(nodeRef.node);
      // Report invalid image/screen control
      if (
        context.includes("ImageCommand") &&
        !BRACKET_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const message = `Unrecognized command: \`[[ ]]\` commands only support ${formatList(
          BRACKET_CONTROL_KEYWORDS,
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
      // Report invalid audio control
      if (
        context.includes("AudioCommand") &&
        !AUDIO_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const message = `Unrecognized audio control: Audio commands only support ${formatList(
          AUDIO_CONTROL_KEYWORDS,
        )}`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({ message }).range(
            nodeRef.from,
            nodeRef.to,
          ),
        );
        return annotations;
      }
      // `[[navigate <container> to <screen>]]` requires a `to <screen>`
      // destination — a bare `[[navigate <container>]]` is incomplete.
      if (
        context.includes("ImageCommand") &&
        this.read(nodeRef.from, nodeRef.to) === "navigate"
      ) {
        const command = ancestorMatching(nodeRef.node, ASSET_COMMAND);
        if (command && !this.hasNavigateDestination(command)) {
          const message = `Incomplete \`navigate\`: name the destination screen\n> e.g. \`[[navigate menu to settings]]\``;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "warning",
            }).range(nodeRef.from, nodeRef.to),
          );
          return annotations;
        }
      }
    }
    // Dot-prefixed classes on a Sparkle element line (`row.hud`, `text.title`).
    // Classes are SPACE-separated bare words after the tag (`row hud`), so a `.`
    // breaks the header parse into `<tag>` + an `ERROR_UNRECOGNIZED` remainder
    // starting with `.`. Surface a friendly warning pointing at the fix rather
    // than leaving the class silently dropped. Gated on the Sparkle element
    // context (a struct body line) + the leading dot so other unrecognized
    // spans aren't mislabeled.
    if (nodeRef.name === "ERROR_UNRECOGNIZED") {
      // A dotted class breaks the header at the `.`, which becomes a lone
      // ERROR_UNRECOGNIZED node (text `"."`). Warn only for that dot inside a
      // Sparkle element line so unrelated unrecognized spans aren't mislabeled.
      const text = this.read(nodeRef.from, nodeRef.to).trim();
      const context = getContextNames(nodeRef.node);
      // A CSS-nesting SELECTOR is not a dotted class. `&.secondary:` compiles
      // to a real, populated compound rule — `builtins.sd` uses the idiom 13
      // times — and taking the suggested fix turns it into a descendant TYPE
      // selector matching nothing, with no further warning. So the advice was
      // not merely noise: following it silently broke working styles.
      //
      // Detected on the text preceding the dot on this line: a selector
      // combinator (`&`, `>`, `*`) means we are in selector position, where
      // dots are the correct syntax.
      const lineStart = this.read(
        Math.max(0, nodeRef.from - 200),
        nodeRef.from,
      );
      const beforeDot = lineStart.slice(lineStart.lastIndexOf("\n") + 1);
      const inSelectorPosition = /[&>*]/.test(beforeDot);
      if (
        text.startsWith(".") &&
        context.includes("LuauStructBodyLine") &&
        !inSelectorPosition &&
        // Only element-line headers — not a stray `.` inside a `key = value`
        // style property, where the fix isn't "use a space".
        !context.includes("LuauStructScalarProperty")
      ) {
        const message = `Classes are space-separated, not dot-prefixed — replace the \`.\` with a space\n> e.g. \`row hud\`, not \`row.hud\``;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unrecognized `@event` name on a Sparkle element line (`@clik=save`). The
    // event set is closed (EventMap) and an unknown name silently never fires,
    // so surface a typo instead of leaving a dead handler. `EventAttributeName`
    // captures exactly the identifier after `@` (no `@`, no whitespace).
    //
    // Gated on the enclosing HANDLER attribute, because the grammar emits this
    // same leaf for a style SELECTOR (`@hovered:`, `@focused`, `@theme(dark)`,
    // `@has(button)`) — a closed vocabulary of its own that has nothing to do
    // with EventMap. Ungated, every one of those warned that a selector the
    // docs recommend and `builtins.sd` uses 90 times "never fires", and
    // suggested `@click`/`@input` in its place.
    if (
      nodeRef.name === "EventAttributeName" &&
      ancestorMatching(nodeRef.node, SPARKLE_EVENT_HANDLER)
    ) {
      const name = this.read(nodeRef.from, nodeRef.to).trim();
      if (name && !VALID_SPARKLE_EVENTS.has(name)) {
        const message = `Unrecognized event \`@${name}\` — Sparkle dispatches a fixed set of events, so this handler never fires\n> e.g. \`@click\`, \`@input\`, \`@change\`, \`@keydown\``;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unterminated `{` inside an interpolated string.
    //
    // Matches Luau, which lexes a `{` that reaches the end of its string as a
    // BrokenString and reports "Malformed interpolated string; did you forget
    // to add a '}'?". Without this the mistake is silent: the interpolation
    // closes at the string boundary and its contents quietly vanish from the
    // value (and, before the string-bounded rules, it swallowed the rest of
    // the file).
    //
    // Detected on the text rather than on an `_end` child: closing at the
    // string boundary still produces an `_end` node, just a zero-width one.
    if (
      nodeRef.name === "LuauInterpolatedStringExpression" ||
      nodeRef.name === "LuauDoubleQuotedStringInterpolation" ||
      nodeRef.name === "LuauBacktickStringInterpolation" ||
      nodeRef.name === "LuauFunctionCallShorthand" ||
      nodeRef.name === "LuauDoubleQuotedFunctionCallShorthand" ||
      nodeRef.name === "LuauBacktickFunctionCallShorthand"
    ) {
      const raw = this.read(nodeRef.from, nodeRef.to);
      // Empty `{}` — Luau: "Malformed interpolated string, expected expression
      // inside '{}'". An empty interpolation has no value to splice, so
      // without the diagnostic it would vanish from the string. Use `'...'`
      // or `[[...]]` for a string that should hold literal braces.
      if (/^\{\s*\}$/.test(raw.trim())) {
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message:
              "Malformed interpolated string, expected expression inside `{}`",
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      const closed = raw.trimEnd().endsWith("}");
      if (!closed) {
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message:
              "Malformed interpolated string; did you forget to add a `}`?",
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unrecognized inline RICH TEXT tag inside a content string
    // (`text "a <bold>x</bold>"`). The runtime leaves an unknown tag as literal
    // characters — deliberately, so prose like `5 < 6` survives — which means a
    // typo shows up verbatim in the UI instead of styling anything. The grammar
    // already separates a tag-SHAPED token whose name isn't in the vocabulary
    // (`SparkleRichTextTagUnknown`) from a recognized one, so this only has to
    // report it.
    //
    // NOT flagged inside a `#prop` value: rich text is only parsed in element
    // CONTENT, so `<b>` in a placeholder is inert rather than misspelled.
    if (nodeRef.name === "SparkleRichTextTagUnknown") {
      const raw = this.read(nodeRef.from, nodeRef.to).trim();
      const name = raw.replace(/^<\/?/, "").replace(/[=>].*$/s, "");
      const inPropValue = getContextNames(nodeRef.node).includes(
        "LuauPropAttribute",
      );
      if (name && !inPropValue) {
        const message = `Unrecognized rich text tag \`<${name}>\` — not a known inline tag, so it renders literally instead of styling anything\n> Styling tags are \`<b>\`, \`<i>\`, \`<u>\`, \`<s>\`, \`<sub>\`, \`<sup>\`, \`<mark=…>\`, \`<color=…>\`, \`<size=…>\`; wrap text in \`<noparse>…</noparse>\` to keep angle brackets literal`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    // Unrecognized inline `#prop` name on a Sparkle element line (`#colr=red`).
    // Sparkle passes unknown props straight through to CSS, so a typo silently
    // does nothing — warn when the name is neither a known style prop / CSS
    // property / widget prop nor a `--custom` property. `StyleAttributeName`
    // captures exactly the identifier after `#`.
    if (nodeRef.name === "StyleAttributeName") {
      const raw = this.read(nodeRef.from, nodeRef.to).trim();
      const name = raw.replace(/^#/, "");
      // `--custom` CSS variables and `data-*` / `aria-*` attributes are always
      // valid on any element, so they're never flagged. So are the named
      // non-standard props (`#tooltip`), which the ui writes out as `data-*`.
      const isPassThrough =
        name.startsWith("--") ||
        name.startsWith("data-") ||
        name.startsWith("aria-") ||
        isAliasedAttributeProp(name) ||
        CUSTOM_PROPERTY_ALIASES.has(normalizeStylePropName(name));
      if (
        name &&
        !isPassThrough &&
        !VALID_STYLE_PROPS.has(name) &&
        !VALID_STYLE_PROPS.has(normalizeStylePropName(name))
      ) {
        const message = `Unrecognized prop \`#${name}\` — not a known style property, so it has no effect\n> Sparkle props are CSS-style names (\`background-color\`, \`gap\`, \`padding\`) or short aliases; use \`#--${name}\` for a custom CSS variable`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "warning",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "IllegalChar") {
      const context = getContextNames(nodeRef.node);
      // Report invalid image name syntax
      if (context.includes("ImageCommand")) {
        const message = `Invalid syntax`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      // Report invalid audio name syntax
      if (context.includes("AudioCommand")) {
        const message = `Invalid syntax`;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message,
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
    }
    if (nodeRef.name === "AssetCommandClauseKeyword") {
      const text = this.read(nodeRef.from, nodeRef.to);
      const nextNonWhitespacePos = this.getNextNonWhitespacePos(nodeRef.to);
      const nextValueNode = nodeRef.node.nextSibling?.node.nextSibling;
      const nextValueNodeType = (
        nextValueNode ? nextValueNode.type.name : ""
      ) as SparkdownNodeName;
      const nextValueNodeText = nextValueNode
        ? this.read(nextValueNode.from, nextValueNode.to)
        : "";
      if (text === "after") {
        if (
          nextValueNodeType !== "TimeValue" &&
          nextValueNodeType !== "NumberValue"
        ) {
          const message = `\`${text}\` should be followed by a time value\n> e.g. \`after 2\`, \`after 2s\`, \`after 200ms\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "over") {
        if (
          nextValueNodeType !== "TimeValue" &&
          nextValueNodeType !== "NumberValue"
        ) {
          const message = `\`${text}\` should be followed by a time value\n> e.g. \`over 2\`, \`over 2s\`, \`over 200ms\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "with") {
        const context = getContextNames(nodeRef.node);
        if (
          context.includes("ImageCommand") &&
          nextValueNodeType !== "NameValue"
        ) {
          const message = `\`${text}\` should be followed by the name of a transition or animation\n> e.g. \`with shake\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
        if (
          context.includes("AudioCommand") &&
          nextValueNodeType !== "NameValue"
        ) {
          const message =
            "\`with\` should be followed by the name of a modulation\n> e.g. \`with echo\`";
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "ease") {
        const context = getContextNames(nodeRef.node);
        if (
          context.includes("ImageCommand") &&
          nextValueNodeType !== "NameValue"
        ) {
          const message = `\`${text}\` should be followed by the name of an ease\n> e.g. \`ease linear\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (text === "to") {
        // `[[navigate <container> to <screen>]]` uses `to` to name a destination
        // SCREEN (a NameValue), not a number — skip the numeric check for
        // navigate (the destination is validated as a screen by the reference
        // resolver). Audio `to <number>` (volume target) still validates here.
        const command = ancestorMatching(nodeRef.node, ASSET_COMMAND);
        const controlNode = command
          ? firstDescendant(command, ASSET_COMMAND_CONTROL)
          : null;
        const control = controlNode
          ? this.read(controlNode.from, controlNode.to).trim()
          : "";
        if (
          control !== "navigate" &&
          (nextValueNodeType !== "NumberValue" ||
            (nextValueNodeType === "NumberValue" &&
              Number(nextValueNodeText) < 0))
        ) {
          const message = `\`${text}\` should be followed by a number greater than 0\n> e.g. \`to 0\`, \`to 0.5\`, \`to 1\``;
          const errorFrom = nextValueNode
            ? nextValueNode.from
            : nextNonWhitespacePos;
          const errorTo = nextValueNode
            ? nextValueNode.to
            : nextNonWhitespacePos;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(errorFrom, errorTo),
          );
          return annotations;
        }
      }
      if (
        text === "wait" ||
        text === "loop" ||
        text === "once" ||
        text === "mute" ||
        text === "unmute" ||
        text === "now"
      ) {
        if (
          nextValueNode &&
          (nextValueNodeType === "TimeValue" ||
            nextValueNodeType === "NumberValue")
        ) {
          const message = `\`${text}\` is a flag and cannot take an argument`;
          const nodeCharacterOffset = nextValueNode.to - nodeRef.to;
          annotations.push(
            SparkdownAnnotation.mark<Diagnostic>({
              message,
              severity: "error",
            }).range(nodeRef.from, nodeRef.to + nodeCharacterOffset),
          );
          return annotations;
        }
      }
    }
    return annotations;
  }
}

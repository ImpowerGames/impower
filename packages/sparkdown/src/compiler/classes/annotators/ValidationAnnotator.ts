import { explicitRuleNames, isExplicitRuleName } from "../../utils/explicitRuleNames";
import { LUAU_STATEMENT_KEYWORDS } from "../../utils/luauStatementKeywords";
import { ancestorMatching } from "../../utils/ancestorMatching";
import { nodeNameSet } from "../../utils/nodeNameSet";
import { documentString } from "../../utils/documentString";
import { Range, type Text } from "@codemirror/state";
import type { SyntaxNode, Tree } from "@lezer/common";
import { getContextNames } from "@impower/textmate-grammar-tree/src/tree/utils/getContextNames";
import GRAMMAR_DEFINITION from "../../../../language/sparkdown.language-grammar.json";
import VALID_STYLE_PROPS_DATA from "../../constants/validStyleProps.json";
import {
  CUSTOM_PROPERTY_ALIASES,
  isAliasedAttributeProp,
  isReservedAttribute,
} from "../../constants/dataAttributeProps";
import type { SparkdownNodeName } from "../../types/SparkdownNodeName";
import type { SparkdownSyntaxNodeRef } from "../../types/SparkdownSyntaxNodeRef";
import { formatList } from "../../utils/formatList";
import { cutIslands, isStoryCondition } from "../../utils/storyIslands";
import {
  isLineContinuation,
  TYPE_NAME_EXTRA_QUALIFIER,
} from "../../lower/utils/lineContinuation";
import { FIELD_COLON } from "../../lower/utils/fieldColon";
import { authoredIslandEnd, nextSignificantToken, typeCheckerReportsMissingValue } from "../../lower/utils/validateAssignmentValue";
import { luauPositionOffset, readLuauBlock, readLuauExpressionAfter, readLuauMethod, readLuauStatements } from "../../typecheck/readLuauAst";
import { closureReadingErrors } from "../../typecheck/closureReading";
import { containsUnreadToken, UNREAD_TOKENS } from "../../utils/unreadTokens";
import { isTrivia, soleVariableName } from "../../lint/luauTree";
import { checkerReadsOnTo, isLuauDocument, isLuauFile, isReadLuau, loweredExpressionOf, loweredLuauBodyOf, luauReadingReportsAllAt, RESERVED, SPARKDOWN_ONLY } from "../../typecheck/LuauUnitNodes";
import {
  ownAssignmentOperation,
  VARIABLE_DEFINITION_CONTENT_NAMES,
} from "../../utils/variableDefinitionNames";
import { SparkdownAnnotation } from "../SparkdownAnnotation";
import { SparkdownAnnotator } from "../SparkdownAnnotator";
import {
  blockIsClosed,
  blockOpenBrace,
} from "../../lower/utils/structBodyEntries";
import { RUN_WRAPPER_SUFFIX, runWrapperName } from "../../utils/runWrapper";

const IMAGE_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.IMAGE_CONTROL_KEYWORDS || [];
const AUDIO_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.AUDIO_CONTROL_KEYWORDS || [];
const LAYOUT_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LAYOUT_CONTROL_KEYWORDS || [];
const LOAD_CONTROL_KEYWORDS =
  GRAMMAR_DEFINITION.variables.LOAD_CONTROL_KEYWORDS || [];
const MOVIE_CONTROL_KEYWORDS: string[] =
  GRAMMAR_DEFINITION.variables.MOVIE_CONTROL_KEYWORDS || [];
const BRACKET_CONTROL_KEYWORDS = [
  ...IMAGE_CONTROL_KEYWORDS,
  ...LAYOUT_CONTROL_KEYWORDS,
  ...LOAD_CONTROL_KEYWORDS,
  ...MOVIE_CONTROL_KEYWORDS,
];
const PLAY_ONE_VIDEO =
  "`play` takes one video name\n> e.g. `[[play intro]]`, `[[play intro loop with fade]]`";

const ASSET_COMMAND = nodeNameSet(["ImageCommand", "AudioCommand"]);
const ASSET_COMMAND_CONTROL = nodeNameSet(["AssetCommandControl"]);
const ASSET_COMMAND_INSTRUCTION = nodeNameSet(["AssetCommandInstruction"]);
const ASSET_COMMAND_TARGET = nodeNameSet(["AssetCommandTarget"]);
const NAME_VALUE_CLAUSE_KEYWORDS: ReadonlySet<string> = new Set(["with", "ease"]);
const ASSET_COMMAND_EXTRA_NAME = nodeNameSet([
  "AssetCommandName",
  "AssetCommandAddOperator",
]);

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

const VALID_STYLE_PROPS = new Set<string>(VALID_STYLE_PROPS_DATA.props);

const SPARKLE_EVENT_HANDLER = nodeNameSet([
  "LuauEventAttribute",
  "LuauSparkleEventAttribute",
  "LuauSparkleEventClosureAttribute",
]);

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

const LUAU_NUMBER = nodeNameSet([
  "LuauNumericDecimal",
  "LuauNumericHex",
  "LuauNumericBinary",
]);
const LUAU_TYPE_END_BEFORE_OPTIONAL = /(?:[\w)}"'`?]|[^-]>)$/;

const TEXT_COMMAND_CONTROL = nodeNameSet(["TextCommandControl"]);

const LUAU_WHITESPACE_RUN = /^[ \t\r\n\v\f]+$/;

const MALFORMED_STRING = "Malformed string; did you forget to finish it?";
const BACKTICK_INTERPOLATIONS = nodeNameSet([
  "LuauBacktickStringInterpolation",
  "LuauBacktickFunctionCallShorthand",
]);

function backtickLexeme(text: string): string {
  return /^`(?:[^`{\\\r\n]|\\.)*[`{]?/.exec(text)?.[0] ?? "";
}
const BACKTICK_INTERPOLATION_ENDS = nodeNameSet([
  "LuauBacktickStringInterpolation_end",
  "LuauBacktickFunctionCallShorthand_end",
]);
const MALFORMED_NUMBER = "Malformed number";
const UNSUPPORTED_INTEGER =
  "Luau 64-bit integer literals are not supported in Sparkdown";
const UNFINISHED_COMMENT =
  "Expected identifier when parsing expression, got unfinished comment";
const STRAY_OPTIONAL = "Expected type, got '?'";
const MISSING_EXPRESSION = "Expected identifier when parsing expression";
const LINE_BREAK_BINARY_OPERATORS = new Set(
  ["LuauArithmeticOperator", "LuauCompareOperator", "LuauConcatOperator", "LuauLogicalOperator"].flatMap(explicitRuleNames),
);
const UNCLOSED_STRUCT_BLOCK =
  "This block is missing its closing `}`. Without it, every line up to the declaration's `end`, the next `scene` or `branch`, or the end of the file is read as part of this block.";
const INVALID_STRUCT_BLOCK_TOKENS: ReadonlySet<string> = nodeNameSet([
  "LuauStructStrayBlockClose",
  "LuauStructBlockItemMark",
]);
const INVALID_SPARKLE_BLOCK_TOKENS: ReadonlySet<string> = nodeNameSet([
  "LuauSparkleBlockUnknown",
  "LuauSparkleElementInvalid",
]);
const HEADER_CONTENT: ReadonlySet<string> = nodeNameSet(["Scene_content", "Branch_content"]);
const MISSING_TYPE = "Expected type";
const HEADER_METHOD_COLON_NAMES: SparkdownNodeName[] = ["LuauLoopHeaderMethodColon", "LuauIfHeaderMethodColon"];
const HEADER_METHOD_COLONS = nodeNameSet(HEADER_METHOD_COLON_NAMES);
const METHOD_RECEIVERS = nodeNameSet([
  "LuauAccessPath",
  "LuauParenthetical",
  "LuauChainedFunctionCall",
  "LuauChainedPropertyAccess",
]);
const TYPE_ERROR_TOKENS = nodeNameSet([
  "LuauTypeStrayOptionalOperator",
  "LuauTypeStrayColon",
  "LuauTypeAnnotationMissingType",
  ...HEADER_METHOD_COLON_NAMES,
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
  ...HEADER_METHOD_COLON_NAMES,
  "LuauTypeBinaryOperatorMissingType",
  "LuauFunctionReturnMissingType",
]);
const EMPTY_AT_END_OPERATIONS = nodeNameSet([
  "LuauTypeAnnotationOperation",
  "LuauFunctionReturnType",
]);
const TYPE_COLON_BEGINS = nodeNameSet([
  "LuauTypeAnnotationOperator_begin",
  "LuauFunctionReturnType_begin",
]);
const LUAU_TYPE_LITERAL = nodeNameSet(["LuauTypeLiteral"]);
const LUAU_NAME_START = /[A-Za-z_]/;
const LUAU_NAME = /^[A-Za-z_]\w*/;
const LUAU_NON_TYPE_KEYWORDS = new Set<string>(
  GRAMMAR_DEFINITION.variables.LUAU_NON_TYPE_KEYWORDS,
);
const LUAU_TRIVIA = /\s+|--\[(=*)\[[\s\S]*?\]\1\]|--(?!\[=*\[)[^\n]*/y;
const LUAU_BLOCK_COMMENT_OPENER = /--\[=*\[/y;
const LUAU_TOKEN = /[A-Za-z_]\w*|(?:\d|\.\d)[\d._]*(?:[eE][+-]?)?\w*|\.\.\.|\.\.=?|\/\/=?|[=~<>]=|::|->|[+\-*/%^]=|\S/y;
const RUN_WRAPPER_END = RUN_WRAPPER_SUFFIX.slice("\n".length);
const STRAY_CLOSING_BRACKET =
  "Expected identifier when parsing expression, got ']'";
const LUAU_TRAILING_BLOCK_COMMENTS: SparkdownNodeName[] = [
  "LuauTypeTrailingBlockComment",
  "LuauUncallableValueTrailingBlockComment",
  "LuauCallableValueTrailingBlockComment",
];
const LUAU_TRAILING_BLOCK_COMMENT = nodeNameSet(LUAU_TRAILING_BLOCK_COMMENTS);
const LUAU_BLOCK_COMMENT_OPENINGS: SparkdownNodeName[] = [
  "LuauBlockComment",
  ...LUAU_TRAILING_BLOCK_COMMENTS,
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
const NAME_ON_LATER_LINE =
  "Expected identifier after '.' on the same line\n> e.g. `t.a.b`, not `t.a.` with `b` on the next line";
const IF_EXPRESSION_WITHOUT_VALUE =
  "Expected identifier when parsing expression";
const IF_EXPRESSION_WITHOUT_THEN =
  "Expected 'then' when parsing if then else expression";
const IF_EXPRESSION_WITHOUT_ELSE =
  "Expected 'else' when parsing if then else expression";
const IF_STATEMENT_WITHOUT_THEN = "Expected 'then' when parsing if statement";
const LUAU_IF_STATEMENT_CONDITION = nodeNameSet([
  "LuauIfBlockCondition",
  "LuauElseifBlockCondition",
  "LuauSparkdownExplicitIfCondition",
]);
const STORY_CONDITION_BLOCKS: ReadonlySet<string> = new Set(["LuauSparkdownIfBlock", "LuauSparkdownElseifBlock"]);
const IF_CONDITION_TRIVIA = nodeNameSet([
  "LuauConditionLeadingBreak",
  "LuauComment",
  "LuauLineComment",
  "LuauDocLineComment",
  "LuauBlockComment",
  "ExtraWhitespace",
  "Newline",
]);
const LUAU_IF_KEYWORD = nodeNameSet(["LuauIfKeyword"]);
const LUAU_THEN_KEYWORD = nodeNameSet(["LuauThenKeyword"]);
const LUAU_UNTIL_KEYWORD = nodeNameSet(["LuauUntilKeyword"]);
const LUAU_ELSE_KEYWORD = nodeNameSet(["LuauElseKeyword"]);
const IF_CLAUSE_TRIVIA = new Set([
  "LuauThenOperator",
  "LuauElseOperator",
  "LuauSparkdownExplicitThenOperator",
  "LuauSparkdownExplicitElseOperator",
  "LuauComment",
  "LuauLineComment",
  "LuauDocLineComment",
  ...LUAU_BLOCK_COMMENT_NAMES,
  "LuauCommaSeparator",
  "ExtraWhitespace",
  "OptionalWhitespace",
  "Newline",
]);
const LUAU_BINDING_INTERPOLATION_HOSTS = nodeNameSet([
  "LuauPropAttribute",
  "LuauSparklePropAttribute",
  "StringFieldValueInterpolated",
  "LuauElementContentStringInterpolated",
]);

function isInlineConditional(node: any): boolean {
  return (
    isExplicitRuleName(node.parent?.name, "LuauInterpolatedStringExpression_content") &&
    !ancestorMatching(node.parent.parent, LUAU_BINDING_INTERPOLATION_HOSTS)
  );
}

const OPERATOR_FIRST_OPERATIONS = nodeNameSet([
  "LuauArithmeticOperation",
  "LuauCompareOperation",
  "LuauConcatOperation",
  "LuauLogicalOperation",
  "LuauLengthOperation",
  "LuauTypeCastOperation",
]);
const UNARY_OPERATORS = new Set(["-", "not", "#"]);

function firstPart(node: any, start = node?.firstChild): any {
  let part = start;
  while (part && IF_CLAUSE_TRIVIA.has(part.name)) part = part.nextSibling;
  return part ?? null;
}

function clauseHasValue(
  clause: any,
  read: (from: number, to: number) => string,
): boolean {
  const content = childNamed(clause, `${clause.name}_content`);
  let part = firstPart(content);
  if (part?.name === "LuauThenNextLineArm") {
    part = firstPart(childNamed(part, `${part.name}_content`));
  }
  return !!part && !isLineContinuation(part) && isValue(part, read);
}

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

function missingIfExpressionPart(
  node: any,
  read: (from: number, to: number) => string,
): { message: string; at: any } | null {
  const content = childNamed(node, "LuauTernaryExpression_content");
  let at = firstDescendant(node, LUAU_IF_KEYWORD);
  let expecting: "condition" | "then" | "then value" | "else" = "condition";
  const missing = () => ({
    message:
      expecting === "condition" || expecting === "then value"
        ? IF_EXPRESSION_WITHOUT_VALUE
        : expecting === "then"
          ? IF_EXPRESSION_WITHOUT_THEN
          : IF_EXPRESSION_WITHOUT_ELSE,
    at,
  });
  for (let c = content?.firstChild; c; c = c.nextSibling) {
    if (isExplicitRuleName(c.name, "LuauTernaryExpressionCondition")) {
      if (expecting !== "condition") return missing();
      if (!clauseHasValue(c, read)) return { message: IF_EXPRESSION_WITHOUT_VALUE, at };
      const end = childNamed(c, `${c.name}_end`);
      const gluedThen = end && firstDescendant(end, LUAU_THEN_KEYWORD);
      if (gluedThen) at = gluedThen;
      expecting = gluedThen ? "then value" : "then";
    } else if (isExplicitRuleName(c.name, "LuauThenExpression")) {
      if (expecting !== "then" && expecting !== "then value") return missing();
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
    } else if (isExplicitRuleName(c.name, "LuauElseExpression")) {
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

const MAX_UNICODE_ESCAPE = 0x7fffffff;

function childNamed(node: any, name: string): any {
  for (let c = node.firstChild; c; c = c.nextSibling) {
    if (isExplicitRuleName(c.name, name)) return c;
  }
  return null;
}

function normalizeStylePropName(name: string): string {
  return name
    .replace(/_/g, "-")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

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

const PURE_LUAU_BODY_CONTENT = nodeNameSet([
  "LuauDefine_content",
  "LuauMethodDefinition_content",
  "LuauSparkleHandlerClosure_content",
  "LuauFunctionDefinition_content",
  "LuauFunctionBody_content",
  "LuauForLoop_content",
  "LuauWhileLoop_content",
  "LuauRepeatLoop_content",
  "LuauDoBlock_content",
  "LuauIfBlock_content",
  "LuauElseifBlock_content",
  "LuauElseBlock_content",
  "LuauAlternatorArms_content",
  "LuauFunctionTypeDeclaration_content",
]);

const ALTERNATOR_CONTENT = nodeNameSet(["LuauAlternatorArms_content"]);
const MEMBER_CONTENT = nodeNameSet(["LuauDefine_content", "LuauSparkleHandlerClosure_content"]);

function armNodeOf(node: SyntaxNode | null): SyntaxNode | null {
  while (node && !ALTERNATOR_CONTENT.has(node.parent?.name ?? "")) node = node.parent;
  return node;
}

function armHoldsUnreadToken(armNode: SyntaxNode): boolean {
  let first = armNode;
  while (first.prevSibling && first.prevSibling.name !== "LuauAlternatorSeparator") first = first.prevSibling;
  for (let node: SyntaxNode | null = first; node && node.name !== "LuauAlternatorSeparator"; node = node.nextSibling) {
    if (containsUnreadToken(node)) return true;
  }
  return false;
}

function bodyStatementOf(node: SyntaxNode | null): SyntaxNode | null {
  while (node && !PURE_LUAU_BODY_CONTENT.has(node.parent?.name ?? "")) node = node.parent;
  return node;
}

function outermostStatementOf(statement: SyntaxNode): SyntaxNode {
  let top = statement;
  for (let parent = statement.parent; parent?.parent; parent = parent.parent) {
    if (MEMBER_CONTENT.has(parent.name)) break;
    if (!parent.name.startsWith("Luau") || parent.name.startsWith("LuauSparkdown") || SPARKDOWN_ONLY.has(parent.name)) break;
    top = parent;
  }
  return top;
}

export interface Diagnostic {
  message?: string;
  severity?: "info" | "warning" | "error";
}

export class ValidationAnnotator extends SparkdownAnnotator<
  SparkdownAnnotation<Diagnostic>
> {
  private diagnosticDocument?: { text: Text; source: string };
  private unreadReadings = new Map<string, ReadonlySet<string>>();
  private loweredReadings = new Map<string, readonly { message: string; from: number; to: number }[]>();

  private cutIslandRanges?: { tree: Tree; islands: readonly { from: number; to: number }[] };

  override update(tree: Tree, text: Text, uri?: string): void {
    if (text !== this.text) this.diagnosticDocument = undefined;
    this.unreadReadings.clear();
    this.loweredReadings.clear();
    super.update(tree, text, uri);
  }

  private inCutIsland(at: number): boolean {
    const tree = this.tree;
    if (!tree) return false;
    if (this.cutIslandRanges?.tree !== tree) this.cutIslandRanges = { tree, islands: cutIslands(tree, this.statementDocumentText()) };
    return this.cutIslandRanges.islands.some((island) => at >= island.from && at < island.to);
  }

  private loweredReadingReports(message: string, from: number, to: number): boolean {
    const errors = this.loweredReadingErrors(this.tree?.resolveInner(from, 1) ?? null);
    return !!errors?.some(
      (error) =>
        error.message === message &&
        ((error.from <= to && from <= error.to) || (to <= error.from && this.read(to, error.from).trim() === "")),
    );
  }

  private loweredReadingErrors(node: SyntaxNode | null): readonly { message: string; from: number; to: number }[] | undefined {
    const body = loweredLuauBodyOf(node);
    if (!body) return undefined;
    const key = `${body.from}:${body.to}`;
    let errors = this.loweredReadings.get(key);
    if (!errors) {
      const text = this.statementDocumentText();
      const content = body.getChild("LuauSparkleHandlerClosure_content");
      const reading =
        body.name === "LuauMethodDefinition"
          ? readLuauMethod(body, text)
          : content
            ? readLuauStatements([content], text)
            : readLuauBlock([body], text);
      errors = closureReadingErrors(reading.errors, body, text)
        .filter((error) => !error.sparkdown && !error.pastChunkEnd)
        .map((error) => ({
          message: error.message,
          from: luauPositionOffset(error.location.begin, text),
          to: luauPositionOffset(error.location.end, text),
        }));
      this.loweredReadings.set(key, errors);
    }
    return errors;
  }

  private ownedByUnreadReading(node: SyntaxNode): boolean {
    const arm = armNodeOf(node);
    if (arm) return armHoldsUnreadToken(arm);
    const statement = bodyStatementOf(node);
    if (!statement) return false;
    const top = outermostStatementOf(statement);
    if (top.parent?.name === "LuauDefine_content" && top.name !== "LuauMethodDefinition" && top.name !== "LuauFunctionDefinition") {
      return UNREAD_TOKENS.has(statement.name);
    }
    const reading = top.parent?.name === "LuauSparkleHandlerClosure_content" ? top.parent : top;
    return this.unreadStatementsIn(reading).has(`${statement.from}:${statement.to}`);
  }

  private unreadStatementsIn(reading: SyntaxNode): ReadonlySet<string> {
    const key = `${reading.name}:${reading.from}:${reading.to}`;
    let owned = this.unreadReadings.get(key);
    if (owned) return owned;
    const found = new Set<string>();
    if (containsUnreadToken(reading)) {
      const text = this.statementDocumentText();
      const ranges = reading.name === "LuauMethodDefinition"
        ? readLuauMethod(reading, text).unreadStatements
        : reading.name === "LuauSparkleHandlerClosure_content"
          ? readLuauStatements([reading], text).unreadStatements
          : readLuauBlock([reading], text).unreadStatements ?? [];
      for (const range of ranges) {
        const statement = bodyStatementOf(reading.resolveInner(range.from, 1));
        if (statement) found.add(`${statement.from}:${statement.to}`);
      }
    }
    this.unreadReadings.set(key, found);
    return found;
  }

  private statementDocumentText = (): string => {
    const text = this.text;
    if (!text) return "";
    if (this.diagnosticDocument?.text !== text) {
      this.diagnosticDocument = { text, source: documentString(text) };
    }
    return this.diagnosticDocument.source;
  };

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

  protected conditionExpressionEnd(condition: any): number {
    if (condition.name === "LuauSparkdownExplicitIfCondition") {
      const text = this.statementDocumentText();
      return luauPositionOffset(readLuauExpressionAfter(condition.from, text, condition.to).expr.location.end, text);
    }
    const content = childNamed(condition, `${condition.name}_content`);
    let end = content?.from ?? condition.from;
    for (let c = content?.firstChild; c; c = c.nextSibling) {
      if (c.name === "ERROR_INCOMPLETE") break;
      if (!IF_CONDITION_TRIVIA.has(c.name)) end = c.to;
    }
    return end;
  }

  protected error(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    message: string,
    from: number,
    to: number,
  ) {
    if (this.loweredReadingReports(message, from, to)) return;
    annotations.push(
      SparkdownAnnotation.mark<Diagnostic>({ message, severity: "error" }).range(
        from,
        to,
      ),
    );
  }

  protected validateStructBlock(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): boolean {
    if (
      nodeRef.name === "LuauStructBlockBody" ||
      nodeRef.name === "LuauStructListBlock"
    ) {
      if (!blockIsClosed(nodeRef.node)) {
        const open = blockOpenBrace(nodeRef.node);
        this.error(
          annotations,
          UNCLOSED_STRUCT_BLOCK,
          open?.from ?? nodeRef.from,
          open?.to ?? nodeRef.from + 1,
        );
      }
      return false;
    }
    if (INVALID_SPARKLE_BLOCK_TOKENS.has(nodeRef.name)) {
      this.error(annotations, "Invalid syntax", nodeRef.from, nodeRef.to);
      return true;
    }
    if (nodeRef.name === "LuauStructInvalidColon") {
      this.error(annotations, FIELD_COLON, nodeRef.from, nodeRef.to);
      return true;
    }
    if (INVALID_STRUCT_BLOCK_TOKENS.has(nodeRef.name)) {
      this.error(annotations, "Invalid syntax", nodeRef.from, nodeRef.to);
      return true;
    }
    return false;
  }

  protected isClosedInterpolation(node: any): boolean {
    const end = childNamed(node, `${node.name}_end`);
    return !!end && this.read(end.from, end.to).startsWith("}");
  }

  protected validateLuauLiteral(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): boolean {
    const name = nodeRef.name as string;
    if (LUAU_STRING.has(name)) {
      if (name === "LuauInterpolatedString") return false;
      const node = nodeRef.node as any;
      if (!LUAU_QUOTED_STRING.has(name)) {
        if (!childNamed(node, `${name}_end`)) {
          this.error(annotations, MALFORMED_STRING, nodeRef.from, nodeRef.to);
          return true;
        }
        return false;
      }
      const escapeMessage = "String literal contains malformed escape sequence";
      const content = childNamed(node, `${name}_content`);
      for (let c = content?.firstChild; c; c = c.nextSibling) {
        const esc = this.read(c.from, c.to);
        let malformed = false;
        if (c.name === "LuauEscapeAny") {
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
      const end = childNamed(node, `${name}_end`);
      if (!end || end.from === end.to) {
        if (ancestorMatching(nodeRef.node, BACKTICK_INTERPOLATION_ENDS)) {
          return true;
        }
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
      const lineTo = this.text?.lineAt(literalTo).to ?? literalTo;
      const rest = this.read(literalTo, lineTo).match(/^[A-Za-z0-9_.]+/);
      const noDigits = /^0_*[xXbB]_*$/.test(text);
      if (rest || noDigits) {
        const integer = /^(?:[0-9]+|0[xX][0-9a-fA-F]*|0[bB][01]+)i$/.test(
          (text + (rest?.[0] ?? "")).replaceAll("_", ""),
        );
        this.error(
          annotations,
          integer ? UNSUPPORTED_INTEGER : MALFORMED_NUMBER,
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
    if (name === "LuauTypeTrailingBlockCommentClose") {
      if (!this.endsTrailingTypeComment(nodeRef.from)) {
        this.error(annotations, STRAY_CLOSING_BRACKET, nodeRef.from, nodeRef.from + 1);
        return true;
      }
      return false;
    }
    return false;
  }

  protected tokenAfterTrivia(pos: number, to = this.text?.length ?? pos): string {
    for (;;) {
      if (pos >= to) return "";
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
        const lineTo = Math.min(to, this.text?.lineAt(pos).to ?? pos + 1);
        return this.read(pos, lineTo).match(LUAU_NAME)?.[0] ?? char;
      }
      pos = node.to;
    }
  }

  protected missingTypeEnd(from: number, to: number): number {
    const lineBreak = this.read(from, to).indexOf("\n");
    return lineBreak < 0 ? to : from + lineBreak + 1;
  }

  protected checkerReadsOnTo(node: SyntaxNode, tokenFrom: number | undefined): boolean {
    if (this.uri && isLuauFile(this.uri)) return true;
    return checkerReadsOnTo(node, tokenFrom, (from, to) => this.read(from, to));
  }

  protected isRunWrapperEnd(pos: number): boolean {
    const length = this.text?.length ?? 0;
    return (
      !!this.uri &&
      runWrapperName(this.uri) !== undefined &&
      pos === length - RUN_WRAPPER_END.length &&
      this.read(pos, length) === RUN_WRAPPER_END
    );
  }

  protected followsForBinding(node: SyntaxNode): boolean {
    let path = node.prevSibling;
    while (path && isTrivia(path)) {
      path = path.prevSibling;
    }
    if (!path || !isExplicitRuleName(path.name, "LuauAccessPath") || path.parent?.name !== "LuauForCondition_content") {
      return false;
    }
    const content = childNamed(path, `${path.name}_content`);
    const part = content?.firstChild;
    let after = part?.nextSibling;
    while (after && isTrivia(after)) {
      after = after.nextSibling;
    }
    if (!part || !isExplicitRuleName(part.name, "LuauAccessPart") || after) {
      return false;
    }
    for (let before = path.prevSibling; before; before = before.prevSibling) {
      if (before.name === "LuauInKeyword" || isExplicitRuleName(before.name, "LuauAssignmentOperation")) {
        return false;
      }
    }
    return true;
  }

  protected followsMethodReceiver(node: SyntaxNode): boolean {
    let value: SyntaxNode | null = node.prevSibling;
    while (value && isTrivia(value)) {
      value = value.prevSibling;
    }
    while (value) {
      if (METHOD_RECEIVERS.has(value.name)) {
        return true;
      }
      let last = value.lastChild;
      while (last && isTrivia(last)) {
        last = last.prevSibling;
      }
      value = last;
    }
    return false;
  }

  protected inPureLuau(node: SyntaxNode): boolean {
    return luauReadingReportsAllAt(node, (from, to) => this.read(from, to), this.uri);
  }

  protected inLuauDocument(): boolean {
    return !!this.uri && isLuauDocument(this.uri);
  }

  protected isMethodColon(node: SyntaxNode): boolean {
    if (HEADER_METHOD_COLONS.has(node.name)) {
      return true;
    }
    const part = node.parent;
    if (!part || !isExplicitRuleName(part.name, "LuauAccessPart")) {
      return false;
    }
    let path: SyntaxNode | null = part.parent;
    while (path && !isExplicitRuleName(path.name, "LuauAccessPath")) {
      path = path.parent;
    }
    if (!path || path.parent?.name !== "LuauForCondition_content") {
      return true;
    }
    if (!part.prevSibling || !isExplicitRuleName(part.prevSibling.name, "LuauAccessPart") || part.prevSibling.prevSibling) {
      return true;
    }
    for (let before = path.prevSibling; before; before = before.prevSibling) {
      if (
        before.name === "LuauInKeyword" ||
        isExplicitRuleName(before.name, "LuauAssignmentOperation")
      ) {
        return true;
      }
    }
    return false;
  }

  protected luauTokenAfter(pos: number): { text: string | null; to: number } | undefined {
    const read = (from: number, to: number) => this.read(from, to);
    const got = this.luauTokenAt(pos);
    if (got === undefined) return undefined;
    if (got && !read(pos, got.from).includes("\n")) {
      return { text: got.text, to: got.from + got.text.length };
    }
    if (got) {
      const node = this.tree?.resolveInner(got.from, 1) ?? null;
      if (LUAU_NON_TYPE_KEYWORDS.has(got.text) || (node && isReadLuau(node, read))) {
        return { text: got.text, to: got.from + got.text.length };
      }
      return { text: null, to: this.text?.lineAt(got.from).from ?? got.from };
    }
    return { text: null, to: this.text?.length ?? pos };
  }

  protected luauTokenAt(pos: number, to = this.text?.length ?? pos): { text: string; from: number } | null | undefined {
    const rest = this.read(pos, to);
    let i = 0;
    for (;;) {
      LUAU_TRIVIA.lastIndex = i;
      const trivia = LUAU_TRIVIA.exec(rest);
      if (!trivia || !trivia[0]) break;
      i += trivia[0].length;
    }
    LUAU_BLOCK_COMMENT_OPENER.lastIndex = i;
    if (LUAU_BLOCK_COMMENT_OPENER.test(rest)) return undefined;
    LUAU_TOKEN.lastIndex = i;
    const token = LUAU_TOKEN.exec(rest);
    return token ? { text: token[0], from: pos + i } : null;
  }

  protected lineBreakEnd(pos: number): number {
    const next = this.read(pos, pos + 2);
    return pos + (next.startsWith("\r\n") ? 2 : next.startsWith("\n") || next.startsWith("\r") ? 1 : 0);
  }

  protected endOfTokenBefore(pos: number): number {
    const before = this.startBeforeBlockComments(pos) ?? pos;
    let end = before;
    while (end > 0 && LUAU_WHITESPACE_RUN.test(this.read(end - 1, end))) {
      end -= 1;
    }
    return end;
  }

  protected endsTrailingTypeComment(pos: number): boolean {
    let node = this.tree?.resolveInner(pos, -1) ?? null;
    while (node && !LUAU_TRAILING_BLOCK_COMMENT.has(node.name)) {
      node = node.parent;
    }
    return node?.to === pos;
  }

  protected declarationTargetBefore(
    node: SyntaxNode,
  ): SyntaxNode | null | undefined {
    let before: SyntaxNode | null = null;
    for (let sibling = node.prevSibling; sibling; sibling = sibling.prevSibling) {
      if (
        DECLARATION_ASSIGNMENT.has(sibling.name) ||
        (isExplicitRuleName(sibling.name, "LuauVariableAssignment") && ownAssignmentOperation(sibling))
      ) {
        return undefined;
      }
      if (!before && !isTrivia(sibling)) {
        before = sibling;
      }
    }
    return before;
  }

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

  protected validateLineEndOperator(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ) {
    if (!LINE_BREAK_BINARY_OPERATORS.has(nodeRef.name) || !/[\r\n]/.test(this.read(nodeRef.from, nodeRef.to))) {
      return;
    }
    const got = this.luauTokenAt(nodeRef.to);
    if (got && LUAU_STATEMENT_KEYWORDS.has(got.text) && !this.checkerReadsOnTo(nodeRef.node, got.from)) {
      this.error(annotations, `${MISSING_EXPRESSION}, got '${got.text}'`, got.from, got.from + got.text.length);
    }
  }

  override enter(
    annotations: Range<SparkdownAnnotation<Diagnostic>>[],
    nodeRef: SparkdownSyntaxNodeRef,
  ): Range<SparkdownAnnotation<Diagnostic>>[] {
    if (nodeRef.name.startsWith("Luau") && this.inCutIsland(nodeRef.from)) {
      return annotations;
    }
    this.validateLineEndOperator(annotations, nodeRef);
    if (nodeRef.name.startsWith("Luau") && this.ownedByUnreadReading(nodeRef.node)) {
      return annotations;
    }
    if (this.validateLuauLiteral(annotations, nodeRef)) {
      return annotations;
    }
    if (this.validateStructBlock(annotations, nodeRef)) {
      return annotations;
    }
    const checkerReportsType =
      TYPE_ERROR_TOKENS.has(nodeRef.name) && isReadLuau(nodeRef.node, (from, to) => this.read(from, to));
    if (nodeRef.name === "LuauTypeStrayOptionalOperator") {
      if (!checkerReportsType) {
        this.error(annotations, STRAY_OPTIONAL, this.endOfTokenBefore(nodeRef.from), nodeRef.to);
      }
      return annotations;
    }
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
    if (isExplicitRuleName(nodeRef.name, "LuauOperatorMissingOperand")) {
      const lineStart = this.text?.lineAt(nodeRef.from).from ?? nodeRef.from;
      const afterAnnotationColon = /(?:^|[^:]):\s*$/.test(this.read(lineStart, nodeRef.from));
      const authoredEnd = authoredIslandEnd(nodeRef.node, this.statementDocumentText());
      const got = this.luauTokenAt(nodeRef.to, authoredEnd);
      if (!afterAnnotationColon && !this.checkerReadsOnTo(nodeRef.node, got?.from)) {
        const eof = authoredEnd === undefined ? undefined : { from: authoredEnd, to: this.lineBreakEnd(authoredEnd) };
        this.error(
          annotations,
          `${MISSING_EXPRESSION}, got ${got ? `'${got.text}'` : "<eof>"}`,
          got?.from ?? eof?.from ?? nodeRef.from,
          got ? got.from + got.text.length : (eof?.to ?? nodeRef.to),
        );
      }
      return annotations;
    }
    if (nodeRef.name === "LuauKeywordMethodName") {
      if (this.inPureLuau(nodeRef.node) || loweredExpressionOf(nodeRef.node)) {
        return annotations;
      }
      const accessor = nodeRef.node.parent?.parent;
      if (
        accessor &&
        isExplicitRuleName(accessor.name, "LuauExpressionKeywordMethodAccessor") &&
        (this.followsForBinding(accessor) || !this.followsMethodReceiver(accessor))
      ) {
        return annotations;
      }
      this.error(
        annotations,
        `${MISSING_METHOD_NAME}, got '${this.read(nodeRef.from, nodeRef.to)}'`,
        nodeRef.from,
        nodeRef.to,
      );
      return annotations;
    }
    if (MISSING_TYPE_NODES.has(nodeRef.name)) {
      if (HEADER_METHOD_COLONS.has(nodeRef.name) && (this.inPureLuau(nodeRef.node) || !this.followsMethodReceiver(nodeRef.node))) {
        return annotations;
      }
      const isMethodColon = this.isMethodColon(nodeRef.node);
      const authoredEnd = isMethodColon ? authoredIslandEnd(nodeRef.node, this.statementDocumentText()) : undefined;
      if (checkerReportsType && (!isMethodColon || this.checkerReadsOnTo(nodeRef.node, this.luauTokenAt(nodeRef.to, authoredEnd)?.from))) {
        return annotations;
      }
      if (isMethodColon && loweredExpressionOf(nodeRef.node)) {
        return annotations;
      }
      if (!isMethodColon) {
        const operator = /^\s*(->|[:|&])/.exec(this.read(nodeRef.from, nodeRef.to));
        const from = nodeRef.from + (operator?.[0].length ?? 0);
        const islandEnd = authoredIslandEnd(nodeRef.node, this.statementDocumentText());
        const inIsland = islandEnd === undefined ? undefined : this.luauTokenAt(nodeRef.to, islandEnd);
        const got = inIsland === null
          ? { text: null, to: this.lineBreakEnd(islandEnd!) }
          : inIsland
            ? { text: inIsland.text, to: inIsland.from + inIsland.text.length }
            : this.luauTokenAfter(nodeRef.to);
        if (!got) return annotations;
        this.error(
          annotations,
          `${MISSING_TYPE}, got ${got.text == null ? "<eof>" : `'${got.text}'`}`,
          from,
          this.missingTypeEnd(from, got.to),
        );
        return annotations;
      }
      const token = this.tokenAfterTrivia(nodeRef.to, authoredEnd);
      const got = token ? this.luauTokenAt(nodeRef.to, authoredEnd) : null;
      this.error(
        annotations,
        `${MISSING_METHOD_NAME}, got ${token ? `'${token}'` : "<eof>"}`,
        got?.from ?? nodeRef.from,
        got ? got.from + got.text.length : nodeRef.to,
      );
      return annotations;
    }
    if (nodeRef.name === "LuauTargetTypeCastOperator") {
      if (!checkerReportsType) {
        this.error(annotations, TARGET_TYPECAST, nodeRef.from, nodeRef.to);
      }
      return annotations;
    }
    if (
      (isExplicitRuleName(nodeRef.name, "LuauTypeCastOperation") ||
        isExplicitRuleName(nodeRef.name, "LuauTypeAnnotationOperation")) &&
      nodeRef.node.parent?.name === "LuauFunctionParameters_content" &&
      !isReadLuau(nodeRef.node, (from, to) => this.read(from, to))
    ) {
      const operator = isExplicitRuleName(nodeRef.name, "LuauTypeCastOperation") ? "::" : ":";
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
    if (
      (isExplicitRuleName(nodeRef.name, "LuauTypeCastOperation") ||
        isExplicitRuleName(nodeRef.name, "LuauTypeAnnotationOperation")) &&
      VARIABLE_DEFINITION_CONTENT_NAMES.has(nodeRef.node.parent?.name ?? "")
    ) {
      const operator = isExplicitRuleName(nodeRef.name, "LuauTypeCastOperation") ? "::" : ":";
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
        isExplicitRuleName(before.name, "LuauAccessPath") &&
        soleVariableName(before) &&
        comma &&
        DECLARATION_COMMA.has(comma.name)
      ) {
        this.error(annotations, TARGET_TYPECAST, from, from + operator.length);
        return annotations;
      }
    }
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
    if (
      EMPTY_AT_END_OPERATIONS.has(nodeRef.name) &&
      !isReadLuau(nodeRef.node, (from, to) => this.read(from, to))
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
        if (!got) return annotations;
        this.error(
          annotations,
          `${MISSING_TYPE}, got ${got.text == null ? "<eof>" : `'${got.text}'`}`,
          from,
          this.missingTypeEnd(from, got.to),
        );
        return annotations;
      }
    }
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
    if (nodeRef.name === "LuauDanglingAccessor") {
      const got = nextSignificantToken(nodeRef.node, nodeRef.to,
        (from, to) => this.read(from, to), this.statementDocumentText);
      const nameOnLaterLine =
        got != null &&
        /^[A-Za-z_]/.test(got.text) &&
        !RESERVED.has(got.text) &&
        this.read(nodeRef.to, got.from).includes("\n");
      if (nameOnLaterLine) {
        this.error(annotations, NAME_ON_LATER_LINE, nodeRef.to - 1, nodeRef.to);
      } else if (!this.checkerReadsOnTo(nodeRef.node, got?.from)) {
        const backtick = got?.text === "`" ? backtickLexeme(this.read(got.from, this.text?.lineAt(got.from).to ?? got.from)) : undefined;
        const finished = backtick !== undefined && backtick.length > 1 && /[`{]$/.test(backtick);
        const description = got == null ? "<eof>" : backtick !== undefined ? (finished ? backtick : "malformed string") : `'${got.text}'`;
        const length = backtick !== undefined ? backtick.length : (got?.text.length ?? 0);
        this.error(
          annotations,
          `Expected identifier, got ${description}`,
          got?.from ?? nodeRef.to - 1,
          got ? got.from + length : nodeRef.to,
        );
      }
      return annotations;
    }
    if (nodeRef.name === "LuauTypeNameExtraQualifier" || isExplicitRuleName(nodeRef.name, "LuauTypeNameExtraQualifierContinuation")) {
      const to = isExplicitRuleName(nodeRef.name, "LuauTypeNameExtraQualifierContinuation")
        ? nodeRef.from + this.read(nodeRef.from, nodeRef.to).trimEnd().length
        : nodeRef.to;
      this.error(
        annotations,
        TYPE_NAME_EXTRA_QUALIFIER,
        nodeRef.from,
        to,
      );
      return annotations;
    }
    if (
      isExplicitRuleName(nodeRef.name, "LuauTernaryExpression") &&
      !isInlineConditional(nodeRef.node) &&
      !loweredExpressionOf(nodeRef.node)
    ) {
      const found = missingIfExpressionPart(nodeRef.node, (from, to) =>
        this.read(from, to),
      );
      const after = found ? this.luauTokenAt(found.at?.to ?? nodeRef.to, authoredIslandEnd(nodeRef.node, this.statementDocumentText())) : undefined;
      const lowered = this.loweredReadingErrors(nodeRef.node);
      const readingReports = lowered
        ? lowered.some((error) => !!found && error.message.startsWith(found.message) && error.from >= nodeRef.from)
        : !!after && this.checkerReadsOnTo(nodeRef.node, after.from);
      const missing = found && this.inPureLuau(nodeRef.node) && readingReports ? undefined : found;
      const read = (from: number, to: number) => this.read(from, to);
      const checkerReportsValue =
        missing?.message === IF_EXPRESSION_WITHOUT_VALUE &&
        typeCheckerReportsMissingValue(nodeRef.node, missing.at?.to ?? nodeRef.to, read, this.statementDocumentText);
      let reportedElse = false;
      if (missing?.message === IF_EXPRESSION_WITHOUT_ELSE) {
        const text = this.statementDocumentText();
        const start = firstDescendant(nodeRef.node, LUAU_IF_KEYWORD)?.from ?? nodeRef.from;
        const error = readLuauExpressionAfter(start, text, authoredIslandEnd(nodeRef.node, this.statementDocumentText())).errors[0];
        if (error?.message.startsWith(`${IF_EXPRESSION_WITHOUT_ELSE}, got `)) {
          let from = luauPositionOffset(error.location.begin, text);
          let to = luauPositionOffset(error.location.end, text);
          let message = error.message;
          if (this.isRunWrapperEnd(from)) {
            from = to = from - 1;
            message = `${IF_EXPRESSION_WITHOUT_ELSE}, got <eof>`;
          }
          const atEof = message.endsWith("got <eof>");
          if (this.checkerReadsOnTo(nodeRef.node, atEof ? undefined : from)) {
            this.error(annotations, message, from, to);
            reportedElse = true;
          }
        }
      }
      if (missing && !checkerReportsValue && !reportedElse) {
        this.error(
          annotations,
          missing.message,
          missing.at?.from ?? nodeRef.from,
          missing.at?.to ?? nodeRef.to,
        );
      }
    }
    if (STORY_CONDITION_BLOCKS.has(nodeRef.name)) {
      const content = childNamed(nodeRef.node, `${nodeRef.name}_content`);
      if (!content?.getChild("LuauSparkdownExplicitIfCondition")) {
        const begin = childNamed(nodeRef.node, `${nodeRef.name}_begin`);
        const at = this.text?.lineAt(begin?.to ?? nodeRef.from).to ?? nodeRef.to;
        this.error(annotations, `${MISSING_EXPRESSION}, got <eof>`, at, this.lineBreakEnd(at));
      }
    }
    if (nodeRef.name === "LuauSparkdownRepeatLoop") {
      const end = childNamed(nodeRef.node, `${nodeRef.name}_end`);
      const until = end ? firstDescendant(end, LUAU_UNTIL_KEYWORD) : null;
      if (until) {
        const at = this.text?.lineAt(until.to).to ?? until.to;
        let next = nodeRef.node.nextSibling;
        while (next && next.from === next.to) next = next.nextSibling;
        if (next?.name !== "LuauSparkdownExplicitUntilCondition" || next.from > at) {
          this.error(annotations, `${MISSING_EXPRESSION}, got <eof>`, at, this.lineBreakEnd(at));
        }
      }
    }
    if (LUAU_IF_STATEMENT_CONDITION.has(nodeRef.name) && !this.inLuauDocument()) {
      const end = childNamed(nodeRef.node, `${nodeRef.name}_end`);
      if (!end || !firstDescendant(end, LUAU_THEN_KEYWORD)) {
        const authoredEnd = authoredIslandEnd(nodeRef.node, this.statementDocumentText());
        if (authoredEnd !== undefined && isStoryCondition(nodeRef.node)) {
          const expressionError = readLuauExpressionAfter(nodeRef.from, this.statementDocumentText(), authoredEnd).errors[0];
          if (expressionError && !expressionError.message.startsWith("Expected the end of the expression")) {
            if (expressionError.message.endsWith("got <eof>")) {
              this.error(annotations, expressionError.message, authoredEnd, this.lineBreakEnd(authoredEnd));
            }
            return annotations;
          }
        }
        const got = nextSignificantToken(
          nodeRef.node,
          this.conditionExpressionEnd(nodeRef.node),
          (from, to) => this.read(from, to),
          this.statementDocumentText,
          authoredEnd,
        );
        const eof = authoredEnd ?? this.tree?.length ?? nodeRef.to;
        const eofEnd = authoredEnd !== undefined && isStoryCondition(nodeRef.node) ? this.lineBreakEnd(eof) : eof;
        this.error(
          annotations,
          `${IF_STATEMENT_WITHOUT_THEN}, got ${got == null ? "<eof>" : `'${got.text}'`}`,
          got?.from ?? eof,
          got == null ? eofEnd : got.from + got.text.length,
        );
      }
    }
    if (nodeRef.name === "AssetCommandControl") {
      const context = getContextNames(nodeRef.node);
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
      if (
        context.includes("ImageCommand") &&
        MOVIE_CONTROL_KEYWORDS.includes(this.read(nodeRef.from, nodeRef.to))
      ) {
        const instruction = ancestorMatching(
          nodeRef.node,
          ASSET_COMMAND_INSTRUCTION,
        );
        const target = instruction
          ? firstDescendant(instruction, ASSET_COMMAND_TARGET)
          : null;
        const targetText = target ? this.read(target.from, target.to) : "";
        let extraFrom: number | undefined;
        let extraTo: number | undefined;
        const findExtra = (node: SyntaxNode) => {
          for (let c = node.firstChild; c; c = c.nextSibling) {
            if (ASSET_COMMAND_EXTRA_NAME.has(c.name)) {
              extraFrom ??= c.from;
              extraTo = c.to;
            } else {
              findExtra(c);
            }
          }
        };
        if (instruction) findExtra(instruction);
        if (!target || !targetText.trim()) {
          this.error(annotations, PLAY_ONE_VIDEO, nodeRef.from, nodeRef.to);
          return annotations;
        }
        if (targetText.includes("+")) {
          this.error(annotations, PLAY_ONE_VIDEO, target.from, extraTo ?? target.to);
          return annotations;
        }
        if (extraFrom !== undefined && extraTo !== undefined) {
          this.error(annotations, PLAY_ONE_VIDEO, extraFrom, extraTo);
        }
        const command = ancestorMatching(nodeRef.node, ASSET_COMMAND);
        const findStrayValue = (node: SyntaxNode) => {
          for (let c = node.firstChild; c; c = c.nextSibling) {
            if (c.name === "NameValue") {
              const keyword = c.prevSibling?.prevSibling;
              const keywordText = keyword
                ? this.read(keyword.from, keyword.to)
                : "";
              if (
                keyword?.name !== "AssetCommandClauseKeyword" ||
                !NAME_VALUE_CLAUSE_KEYWORDS.has(keywordText)
              ) {
                this.error(annotations, PLAY_ONE_VIDEO, c.from, c.to);
              }
            } else {
              findStrayValue(c);
            }
          }
        };
        if (command) findStrayValue(command);
        return annotations;
      }
    }
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
    if (
      isExplicitRuleName(nodeRef.name, "LuauInterpolatedStringExpression") ||
      nodeRef.name === "LuauDoubleQuotedStringInterpolation" ||
      nodeRef.name === "LuauBacktickStringInterpolation" ||
      isExplicitRuleName(nodeRef.name, "LuauFunctionCallShorthand") ||
      nodeRef.name === "LuauDoubleQuotedFunctionCallShorthand" ||
      nodeRef.name === "LuauBacktickFunctionCallShorthand"
    ) {
      const raw = this.read(nodeRef.from, nodeRef.to);
      if (/^\{\s*\}$/.test(raw.trim())) {
        if (BACKTICK_INTERPOLATIONS.has(nodeRef.name)) return annotations;
        annotations.push(
          SparkdownAnnotation.mark<Diagnostic>({
            message:
              "Malformed interpolated string, expected expression inside `{}`",
            severity: "error",
          }).range(nodeRef.from, nodeRef.to),
        );
        return annotations;
      }
      const backtick = BACKTICK_INTERPOLATIONS.has(nodeRef.name);
      const closed = backtick
        ? this.isClosedInterpolation(nodeRef.node)
        : raw.trimEnd().endsWith("}");
      if (!closed && backtick) return annotations;
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
    if (nodeRef.name === "Unknown" && HEADER_CONTENT.has(nodeRef.node.parent?.name ?? "") && !this.inLuauDocument()) {
      const raw = this.read(nodeRef.from, nodeRef.to);
      const from = nodeRef.from + (raw.length - raw.trimStart().length);
      const kind = nodeRef.node.parent!.name === "Scene_content" ? "scene" : "branch";
      this.error(
        annotations,
        `Unexpected text after the ${kind}'s header: \`${raw.trim()}\`. Only tags (\`# name\`) and a \`--\` comment can follow a ${kind}'s name and parameters on its line.`,
        from,
        nodeRef.to,
      );
      return annotations;
    }
    if (nodeRef.name === "SparkleRichTextTagUnknown") {
      const raw = this.read(nodeRef.from, nodeRef.to).trim();
      const name = raw.replace(/^<\/?/, "").replace(/[=>].*$/s, "");
      const context = getContextNames(nodeRef.node);
      const inPropValue =
        context.includes("LuauPropAttribute") ||
        context.includes("LuauSparklePropAttribute");
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
    if (nodeRef.name === "StyleAttributeName") {
      const raw = this.read(nodeRef.from, nodeRef.to).trim();
      const name = raw.replace(/^#/, "");
      const isPassThrough =
        name.startsWith("--") ||
        (name.startsWith("data-") && !isReservedAttribute(name)) ||
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
